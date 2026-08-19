import asyncio
import json
import quart
import os

from babel.languages import get_official_languages
from geoip2 import records

from typing import (
    Optional,
    Dict,
    Any,
)

from utils import (
    DISCORD_API_BASE_URL,
    LANGUAGES,
    LOGGER,
    requests_api
)
from health import (
    configure_admin_user_id,
    normalize_admin_user_id,
    prepare_outbound_payload,
)

class Asset:
    def __init__(self, id: str, key: str):
        self.key: str = key
        self.url: str = f"https://cdn.discordapp.com/avatars/{id}/{key}.webp"

class User:
    def __init__(self, pool, data: Dict):
        self.id: str = data.get("id")
        self.name: str = data.get("global_name")
        self.avatar: Asset = Asset(self.id, data.get("avatar"))
        self.access_token: str = data.get("access_token")
        self.country: records.Country = data.get("country") 
        
        self.bot: Optional[Bot] = None
        self.guild: Optional[Guild] = None
        
        self._pool: UserPool = pool
        self._websocket: Optional[quart.Websocket] = None
    
    async def assign_bot(self, bot) -> None:
        if self.bot:
            if self.id in self.bot._users:
                del self.bot._users[self.id]
            self.bot = None
        
        if self.guild:
            await self.guild.remove_user(self)

        self.bot = bot
        self.bot._users[self.id] = self
        await self.send_to_bot({"op": "initUser"})
        await self.send_to_bot({"op": "initPlayer"})

    async def send_to_bot(self, payload: Dict) -> None:
        method = payload.get("op")
        if method == "heartbeat":
            return
        
        if method == "updateSelectedBot":
            bot = BotPool.get(payload.get("botId"))
            if not bot:
                return await self.send({"op": "botNotFound"})

            return await self.assign_bot(bot)

        elif method == "getMutualGuilds":
            try:
                resp: list[dict] = await requests_api(f'{DISCORD_API_BASE_URL}/users/@me/guilds', headers={'Authorization': f'Bearer {self.access_token}'})
                guilds = {
                    guild["id"]: {
                        "avatar": f"https://cdn.discordapp.com/icons/{guild['id']}/{guild['icon']}.webp" if guild.get('icon') else None,
                        "banner": f"https://cdn.discordapp.com/banners/{guild['id']}/{guild['banner']}.webp?size=480&quality=lossless" if guild.get('banner') else None,
                        "name": guild['name']
                    }
                    for guild in resp if guild['permissions'] >= 1275593889
                }
                payload["guilds"] = guilds

            except:
                return await self.send({"op": "errorMsg", "level": "error", "msg": "Failed to retrieve guild information. Please try again later!"})
        
        payload["userId"] = self.id

        if self.guild:
            return await self.guild.send_to_bot(payload)
        
        elif self.bot:
            return await self.bot.send(payload)
    
    async def send(self, payload: Dict) -> None:
        if self._websocket:
            await self._websocket.send_json(prepare_outbound_payload(payload, self.id))
            
    async def _listen(self) -> None:
        while True:
            if not self.bot:
                await BotPool.broadcast({"op": "initBot", "userId": self.id})

            data = await self._websocket.receive()
            await self.send_to_bot(json.loads(data))
                
    async def connect(self, websocket: quart.Websocket) -> None:
        if self._websocket:
            await self.disconnect()
            
        self._websocket = websocket
                
        LOGGER.info(f"User {self.name}({self.id}) has been connected!")
        received = asyncio.create_task(self._listen())
        await asyncio.gather(received)

    async def disconnect(self) -> None:
        if self._websocket:
            if self.guild:
                await self.guild.remove_user(self)
            
            self.bot = None
            await self._websocket.close(1004)
            self._websocket = None
            LOGGER.info(f"User {self.name}({self.id}) has been disconnected!")

    @property
    def is_connected(self) -> bool:
        return self._websocket
    
    @property
    def language_code(self) -> str:
        language = get_official_languages(self.country.iso_code if self.country else "US")
        return language[0] if language and language[0] in LANGUAGES else list(LANGUAGES.keys())[0]
        
    def __repr__(self) -> str:
        return f"ID={self.id} Name={self.name}, Guild={self.guild}"
    
class Guild:
    def __init__(self, bot, guild_id: str):
        self.bot: Bot = bot
        self.id: str = guild_id
        
        self._users: Dict[str, User] = {}
    
    async def add_user(self, user: User, init_player: bool = True) -> None:
        if not user.guild:
            user.guild = self
            self._users[user.id] = user

            if init_player:
                await self.bot.send({"op": "initPlayer", "userId": user.id})
        
    async def remove_user(self, user: User) -> None:
        if user.id in self._users:
            await user.send({"op": "playerClose"})
            if len(self._users.keys()) <= 1:
                await user.send_to_bot({"op": "closeConnection", "guildId": self.id})
                
            user.guild = None
            del self._users[user.id]
    
    async def remove_all_user(self) -> None:
        for user_id, user in self._users.copy().items():
            await user.send({"op": "playerClose"})
            user.guild = None
            del self._users[user_id]
            
    async def broadcast(self, payload: Dict) -> None:
        skip_users = payload.get("skip_users", [])
        for user_id, user in self._users.items():
            if user_id not in skip_users:
                await user.send(payload)
    
    async def send_to_bot(self, data: Dict) -> None:
        data["guildId"] = self.id
        await self.bot.send(data)
        
class Bot:
    def __init__(
        self, 
        pool,
        headers: Dict[str, str],
        websocket: quart.Websocket
    ):  
        self.id: str = headers.get("User-Id")
        self._websocket: quart.Websocket = websocket
        self._pool: BotPool = pool

        self._guilds: Dict[str, Guild] = {}
        self._users: Dict[str, User] = {}
    
    async def broadcast(self, payload: Dict):
        try:
            for guild in self._guilds.values():
                await guild.broadcast(payload)
        except Exception as e:
            LOGGER.error("Something wrong while broadcast to the bot.", e)
    
    async def send(self, payload: Dict) -> None:
        if self.is_connected:
            LOGGER.debug(f"Bot ({self.id}) sending message: {payload}")
            await self._websocket.send_json(payload)
    
    async def _listen(self):
        while True:
            data = await self._websocket.receive()
            data: Dict = json.loads(data)
            LOGGER.debug(f"Bot ({self.id}) receiving message: {data}")
            
            method = data.get("op")
            if not method:
                continue
            
            if (guild_id := data.get("guildId")):
                guild: Guild = self.get_guild(guild_id)
                if not guild:
                    guild: Guild = self.create_guild(guild_id)

                if not guild.bot:
                    guild.bot = self
            
                if method == "updateGuild":
                    user: User = UserPool.get(user_id=data.get("user", {}).get("userId"))
                    if user:
                        await guild.add_user(user) if data.get("isJoined") else await guild.remove_user(user)
                
                elif method == "createPlayer":
                    for member_id in data.get("memberIds", []):
                        user = UserPool.get(user_id=member_id)
                        if user:
                            await guild.add_user(user)
                    
                    continue
                
                elif method == "initPlayer":
                    user: User = UserPool.get(user_id=data.get("userId"))
                    if user:
                        await guild.add_user(user, init_player=False)

                elif method == "playerClose":
                    guild = self._guilds.get(data.get("guildId"))
                    if guild:
                        await guild.remove_all_user()

            if user_id := data.get("userId"):
                user = UserPool.get(user_id=user_id)
                if user:
                    await user.send(data)
                
            else:
                await guild.broadcast(data)

    async def disconnect(self) -> None:
        if self._websocket:
            await self._websocket.close(1004)
            self._websocket = None
            
            for guild in self._guilds.values():
                await guild.remove_all_user()
            
            for user in self._users.values():
                await user.send({"op": "closeConnection"})

            self._guilds = {}
            self._users = {}

            LOGGER.info(f"Bot ({self.id}) has been disconnected!")

    def create_guild(self, guild_id: str) -> Guild:
        if guild_id in self._guilds:
            raise Exception("Guild already exists!")
        
        guild = Guild(self, guild_id)
        self._guilds[guild_id] = guild
        
        return guild
    
    def get_guild(self, guild_id: str) -> Optional[Guild]:
        return self._guilds.get(guild_id)
    
    @property
    def is_connected(self) -> bool:
        return self._websocket is not None
    
class BotPool:
    _bots: Dict[str, Bot] = {}
    
    @classmethod
    async def create(cls, bot_id: str, websocket: quart.Websocket) -> None:
        try:
            header = websocket.headers
            
            bot: Bot = cls.get(bot_id)
            if bot:
                if bot.is_connected:
                    await bot.disconnect()
                bot._websocket = websocket
            else:  
                bot = Bot(cls, header, websocket)
                cls._bots[bot_id] = bot
            
            LOGGER.info(f"Bot ({bot.id}) has been connected!")

            received = asyncio.create_task(bot._listen())
            await asyncio.gather(received)
        except:
            await bot.disconnect()
            raise
    
    @classmethod
    def get(cls, bot_id: str) -> Optional[Bot]:
        return cls._bots.get(bot_id)
    
    @classmethod
    async def broadcast(cls, data: Dict) -> None:
        for bot in cls._bots.values():
            await bot.send(data)
            
class UserPool:
    _users: Dict[str, User] = {}
    
    @classmethod
    def add(cls, data: Dict) -> User:
        user = User(cls, data)
        cls._users[user.id] = user
        return user
    
    @classmethod
    def get(cls, *, user_id: str = None, token: str = None) -> Optional[User]:
        if user_id:
            return cls._users.get(user_id)
        
        if token:
            for user in cls._users.values():
                if user.access_token == token:
                    return user

class Settings:
    def __init__(self, settings_file: str = "settings.json"):
        self.settings_file = settings_file
        self.settings = self.load()

        self.host: str = self.get_setting("host") or os.getenv("HOST")
        self.port: int = self.get_setting("port") or os.getenv("PORT", 5000)
        self.password: int = self.get_setting("password") or os.getenv("PASSWORD")
        self.client_id: str = self.get_setting("client_id") or os.getenv("CLIENT_ID")
        self.client_secret_id: str = self.get_setting("client_secret_id") or os.getenv("CLIENT_SECRET_ID")
        self.secret_key: str = self.get_setting("secret_key") or os.getenv("SECRET_KEY")
        self.redirect_url: str = self.get_setting("redirect_url") or os.getenv("REDIRECT_URL")
        raw_admin_user_id = self.get_setting("admin_user_id")
        if raw_admin_user_id is None:
            raw_admin_user_id = os.getenv("ADMIN_USER_ID")
        self.admin_user_id: Optional[str] = normalize_admin_user_id(raw_admin_user_id)
        configure_admin_user_id(self.admin_user_id)

        self.logging: Dict[str, Any] = self.get_setting("logging")

    def get_setting(self, key: str, default: Optional[str] = None) -> Optional[str]:
        return self.settings.get(key, default)

    def load(self) -> Dict:
        try:
            with open(self.settings_file, "r") as file:
                return json.load(file)
        except FileNotFoundError as e:
            LOGGER.error(f"Unable to load the settings file.", exc_info=e)
            return {}