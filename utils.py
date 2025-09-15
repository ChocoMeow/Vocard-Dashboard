import aiohttp
import asyncio
import logging
import sass
import os
import objects

from logging.handlers import TimedRotatingFileHandler

from geoip2 import (
    records,
    database,
    errors
)

from quart import session
from jsmin import jsmin

from typing import (
    Optional,
    Dict,
    Any
)

DISCORD_API_BASE_URL = 'https://discord.com/api'
VERSION_REQUIRED = "2.7.2"

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(ROOT_DIR, "assets")

# Getting the GeoLite Database from https://github.com/P3TERX/GeoLite.mmdb
GEODB_URL = "https://git.io/GeoLite2-Country.mmdb"
GEODB_PATH = "geolite_db/GeoLite2-City.mmdb"

# SCSS paths
SCSS_DIR = os.path.join(ASSETS_DIR, "scss")
CSS_DIR = os.path.join(ROOT_DIR, "static", "css")

JS_SOURCE_DIR = os.path.join(ASSETS_DIR, "js")
JS_OUTPUT_DIR = os.path.join(ROOT_DIR, "static", "js")

# Supported Languages
LANGUAGES: Dict[str, Dict[str, str]] = {}

LOGGER = logging.getLogger("dashboard")

class ColoredFormatter(logging.Formatter):
    LEVEL_COLORS = [
        (logging.DEBUG, '\x1b[40;1m'),
        (logging.INFO, '\x1b[34;1m'),
        (logging.WARNING, '\x1b[33;1m'),
        (logging.ERROR, '\x1b[31m'),
        (logging.CRITICAL, '\x1b[41m'),
    ]

    FORMATS = {
        level: logging.Formatter(
            f'\x1b[30;1m%(asctime)s\x1b[0m {colour}%(levelname)-8s\x1b[0m \x1b[35m%(name)s\x1b[0m %(message)s',
            '%Y-%m-%d %H:%M:%S',
        )
        for level, colour in LEVEL_COLORS
    }

    def format(self, record):
        formatter = self.FORMATS.get(record.levelno, self.FORMATS[logging.DEBUG])

        if record.exc_info:
            text = formatter.formatException(record.exc_info)
            record.exc_text = f'\x1b[31m{text}\x1b[0m'

        output = formatter.format(record)
        record.exc_text = None
        return output

def setup_logging(log_settings: Dict[str, Any]):
    root_logger = logging.getLogger()

    if (LOG_FILE := log_settings.get("file", {})).get("enable", True):
        log_path = os.path.abspath(LOG_FILE.get("path", "./logs"))
        if not os.path.exists(log_path):
            os.makedirs(log_path)

        # Create a file handler
        file_handler = TimedRotatingFileHandler(
            filename=f'{log_path}/vocard.log', 
            encoding="utf-8", 
            backupCount=log_settings.get("max-history", 30), 
            when="d"
        )
        file_handler.namer = lambda name: name.replace(".log", "") + ".log"
        file_handler.setFormatter(logging.Formatter('{asctime} [{levelname:<8}] {name}: {message}', '%Y-%m-%d %H:%M:%S', style='{'))
        root_logger.addHandler(file_handler)

        for log_name, log_level in log_settings.get("level", {}).items():
            _logger = logging.getLogger(log_name)
            _logger.setLevel(log_level)

    consoleHandler = logging.StreamHandler()
    consoleHandler.setFormatter(ColoredFormatter())
    root_logger.addHandler(consoleHandler)

def get_locale() -> str:
    language = session.get("language_code")
    
    if not language:
        token = session.get("discord_token")
        if token:
            user = objects.UserPool.get(token=token)
            language = user.language_code if user else None

    return language or list(LANGUAGES.keys())[0]

def process_js_files() -> None:
    """
    Compress and obfuscate JavaScript files from the source directory
    and save them to the output directory.
    """
    os.makedirs(JS_OUTPUT_DIR, exist_ok=True)

    for js_file in os.listdir(JS_SOURCE_DIR):
        if js_file.endswith(".js"):
            input_path = os.path.join(JS_SOURCE_DIR, js_file)
            output_path = os.path.join(JS_OUTPUT_DIR, js_file.replace(".js", ".min.js"))
            
            try:
                # Compress the JS file
                with open(input_path, "r", encoding="utf-8") as source_file:
                    compressed_js = jsmin(source_file.read(), quote_chars="'\"`")
                
                # Write compiled JS to the JS directory
                with open(output_path, "w", encoding="utf-8") as js_file:
                    js_file.write(compressed_js)
                
                LOGGER.debug(f"Successfully processed {js_file}.")
            except Exception as e:
                LOGGER.error(f"Error processing {js_file}: {e}")

    LOGGER.info("Finished processing JavaScript files.")

def compile_scss() -> None:
    """
    Compile SCSS files from the SCSS directory into CSS, 
    handling imports properly by compiling only entry-point SCSS files.
    """
    os.makedirs(CSS_DIR, exist_ok=True)

    for scss_file in os.listdir(SCSS_DIR):
        if scss_file.endswith(".scss") and not scss_file.startswith("_"):
            scss_path = os.path.join(SCSS_DIR, scss_file)
            css_path = os.path.join(CSS_DIR, scss_file.replace(".scss", ".css"))
            
            try:
                # Compile SCSS file
                compiled_css = sass.compile(filename=scss_path, include_paths=[SCSS_DIR], output_style="compressed")
                
                # Write compiled CSS to the CSS directory
                with open(css_path, "w", encoding="utf-8") as css_file:
                    css_file.write(compiled_css)

                LOGGER.debug(f"Successfully compiled {scss_file}.")
            except Exception as e:
                LOGGER.error(f"Error compiling {scss_file}: {e}")

    LOGGER.info("Finished compiling SCSS files.")

def check_version(current_version: str) -> bool:
    current_version = current_version.replace("v", "")
    def version_tuple(version: str):
        main_version, *beta = version.replace('b', '.').split('.')
        return tuple(int(part) if part.isdigit() else 0 for part in main_version.split('.') + beta)

    current_version_tuple = version_tuple(current_version)
    target_version_tuple = version_tuple(VERSION_REQUIRED)

    return current_version_tuple >= target_version_tuple

def _check_country_with_ip_sync(address: str) -> Optional[records.Country]:
    with database.Reader(GEODB_PATH) as reader:
        try:
            response = reader.country(address)
            return response.country
        except errors.AddressNotFoundError:
            return None

async def requests_api(url: str, method: str = 'GET', data: dict = None, headers: dict = None) -> dict:
    LOGGER.debug(f"Making {method} request to {url} with data: {data} and headers: {headers}")
    async with aiohttp.ClientSession() as session:
        try:
            if method == 'GET':
                resp = await session.get(url, headers=headers)
            elif method == 'POST':
                resp = await session.post(url, data=data, headers=headers)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            if resp.status != 200:
                LOGGER.debug(f"Received non-200 response: {resp.status} for URL: {url}")
                return None
            
            json_response = await resp.json(encoding="utf-8")
            LOGGER.debug(f"Received response: {json_response}")
            return json_response
        except Exception as e:
            LOGGER.error(f"Error during API request to {url}: {e}")
            return None

async def check_country_with_ip(address: str) -> Optional[records.Country]:
    return await asyncio.to_thread(_check_country_with_ip_sync, address)

async def download_geoip_db() -> None:
    # Create directory if it doesn't exist
    os.makedirs(os.path.dirname(GEODB_PATH), exist_ok=True)

    # Check if the database already exists
    if os.path.exists(GEODB_PATH):
        return
    
    async with aiohttp.ClientSession() as session:
        LOGGER.info("Downloading GeoIP database...")
        async with session.get(GEODB_URL) as response:
            if response.status == 200:
                with open(GEODB_PATH, 'wb') as f:
                    f.write(await response.read())
                LOGGER.info("GeoIP database downloaded successfully.")
            else:
                LOGGER.error(f"Failed to download database: {response.status}")