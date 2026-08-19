import asyncio
import json
import os
import tempfile
import unittest

from health import (
    configure_admin_user_id,
    is_dashboard_admin,
    normalize_admin_user_id,
    prepare_outbound_payload,
    serialize_health_for_user,
    serialize_health_message,
)
from objects import Guild, Settings, User, UserPool


ADMIN_ID = "111111111111111111"
USER_ID = "222222222222222222"

SAMPLE_HEALTH = {
    "op": "playbackHealth",
    "guildId": "333",
    "userId": ADMIN_ID,
    "components": [
        {
            "component": "node:DEFAULT",
            "status": "ok",
            "severity": "info",
            "installed_version": "4.0.8",
            "available_version": None,
            "message": None,
            "last_error": None,
            "last_seen": 1700000000,
        },
        {
            "component": "source:youtube",
            "status": "degraded",
            "severity": "error",
            "installed_version": "1.18.0",
            "available_version": None,
            "message": "YouTube source is reporting repeated failures. Installed plugin: youtube-plugin 1.18.0. Check/update the Lavalink YouTube plugin.",
            "last_error": {"code": "YOUTUBE_SOURCE_FAILED", "detail": "AllClientsFailedException: clients exhausted"},
            "last_seen": 1700000001,
        },
    ],
    "playbackFailure": {
        "code": "YOUTUBE_SOURCE_FAILED",
        "title": "Never Gonna Give You Up",
        "source": "youtube",
    },
}

ADMIN_LEAK_MARKERS = (
    "installed_version",
    "available_version",
    "last_error",
    "last_seen",
    "youtube-plugin",
    "1.18.0",
    "4.0.8",
    "AllClientsFailedException",
    "YOUTUBE_SOURCE_FAILED",
    "node:DEFAULT",
    "source:youtube",
    "Check/update",
    "severity",
)


class FakeWebsocket:
    def __init__(self):
        self.messages = []

    async def send_json(self, payload):
        self.messages.append(payload)


class RecordingUser:
    def __init__(self, user_id):
        self.id = user_id
        self.sent = []

    async def send(self, payload):
        self.sent.append(payload)


def dump(payload) -> str:
    return json.dumps(payload, default=str)


class NormalizeAdminIdTests(unittest.TestCase):
    def test_missing_and_blank_are_not_admin(self):
        self.assertIsNone(normalize_admin_user_id(None))
        self.assertIsNone(normalize_admin_user_id(""))
        self.assertIsNone(normalize_admin_user_id("  "))
        self.assertIsNone(normalize_admin_user_id("null"))
        self.assertIsNone(normalize_admin_user_id(True))
        self.assertIsNone(normalize_admin_user_id({"id": ADMIN_ID}))

    def test_snowflake_stays_a_string(self):
        value = normalize_admin_user_id(ADMIN_ID)
        self.assertEqual(value, ADMIN_ID)
        self.assertIsInstance(value, str)


class AdminIdentityTests(unittest.TestCase):
    def test_configured_admin_matches_authenticated_id(self):
        self.assertTrue(is_dashboard_admin(ADMIN_ID, ADMIN_ID))

    def test_normal_user_does_not_match(self):
        self.assertFalse(is_dashboard_admin(USER_ID, ADMIN_ID))

    def test_no_admin_configured_nobody_is_admin(self):
        self.assertFalse(is_dashboard_admin(ADMIN_ID, None))
        self.assertFalse(is_dashboard_admin(ADMIN_ID, ""))
        self.assertFalse(is_dashboard_admin(USER_ID, None))

    def test_username_and_display_name_do_not_authorize(self):
        self.assertFalse(is_dashboard_admin("AdminUser", ADMIN_ID))
        self.assertFalse(is_dashboard_admin("dashboard admin", ADMIN_ID))


class HealthSerializationTests(unittest.TestCase):
    def assert_no_admin_leaks(self, payload):
        text = dump(payload)
        for marker in ADMIN_LEAK_MARKERS:
            self.assertNotIn(marker, text, f"admin marker leaked: {marker}")

    def test_admin_receives_diagnostics_and_normal_health(self):
        payload = serialize_health_for_user(SAMPLE_HEALTH, ADMIN_ID, admin_user_id=ADMIN_ID)
        self.assertTrue(payload["admin"])
        youtube = next(c for c in payload["components"] if c["component"] == "source:youtube")
        self.assertEqual(youtube["installed_version"], "1.18.0")
        self.assertEqual(youtube["last_error"]["code"], "YOUTUBE_SOURCE_FAILED")
        node = next(c for c in payload["components"] if c["component"] == "node:DEFAULT")
        self.assertEqual(node["installed_version"], "4.0.8")
        self.assertEqual(payload["playbackFailure"]["code"], "YOUTUBE_SOURCE_FAILED")
        self.assertIn("Check/update", youtube["message"])

    def test_normal_user_receives_only_user_safe_health(self):
        payload = serialize_health_for_user(SAMPLE_HEALTH, USER_ID, admin_user_id=ADMIN_ID)
        self.assertFalse(payload["admin"])
        self.assertEqual(payload["message"], "YouTube playback is currently experiencing problems.")
        self.assertEqual(payload["components"], [{"kind": "youtube", "status": "degraded"}])
        self.assertEqual(payload["playbackFailure"]["userMessage"], "This track could not be played.")
        self.assertEqual(payload["playbackFailure"]["title"], "Never Gonna Give You Up")
        self.assert_no_admin_leaks(payload)

    def test_admin_payload_shows_degraded_after_first_source_failure(self):
        health = {
            "components": [
                {
                    "component": "source:youtube",
                    "status": "degraded",
                    "severity": "warning",
                    "installed_version": "1.18.0",
                    "available_version": None,
                    "message": "YouTube source is reporting failures. Installed plugin: youtube-plugin 1.18.0.",
                    "last_error": {"code": "SOURCE_AUTH_REQUIRED", "detail": "AllClientsFailedException"},
                    "last_seen": 1,
                }
            ],
            "playbackFailure": {
                "code": "SOURCE_AUTH_REQUIRED",
                "title": "Stateside",
                "source": "youtube",
            },
        }
        admin = serialize_health_for_user(health, ADMIN_ID, admin_user_id=ADMIN_ID)
        self.assertTrue(admin["admin"])
        self.assertEqual(admin["components"][0]["status"], "degraded")
        self.assertEqual(admin["components"][0]["last_error"]["code"], "SOURCE_AUTH_REQUIRED")
        self.assertEqual(admin["playbackFailure"]["code"], "SOURCE_AUTH_REQUIRED")

        public = serialize_health_for_user(health, USER_ID, admin_user_id=ADMIN_ID)
        self.assertFalse(public["admin"])
        self.assertEqual(public["components"], [{"kind": "youtube", "status": "degraded"}])
        self.assertEqual(public["message"], "YouTube playback is currently experiencing problems.")
        self.assert_no_admin_leaks(public)

    def test_no_admin_configured_strips_diagnostics(self):
        payload = serialize_health_for_user(SAMPLE_HEALTH, ADMIN_ID, admin_user_id=None)
        self.assertFalse(payload["admin"])
        self.assert_no_admin_leaks(payload)
        self.assertEqual(payload["message"], "YouTube playback is currently experiencing problems.")

    def test_client_provided_user_id_cannot_obtain_admin_diagnostics(self):
        spoofed = dict(SAMPLE_HEALTH)
        spoofed["userId"] = ADMIN_ID
        payload = serialize_health_for_user(spoofed, USER_ID, admin_user_id=ADMIN_ID)
        self.assertFalse(payload["admin"])
        self.assert_no_admin_leaks(payload)

    def test_init_player_does_not_leak_admin_fields(self):
        init_player = {
            "op": "initPlayer",
            "guildId": "333",
            "userId": USER_ID,
            "isPlaying": True,
            "health": SAMPLE_HEALTH,
        }
        outbound = prepare_outbound_payload(init_player, USER_ID, admin_user_id=ADMIN_ID)
        self.assertEqual(outbound["op"], "initPlayer")
        self.assertTrue(outbound["isPlaying"])
        self.assertFalse(outbound["health"]["admin"])
        self.assert_no_admin_leaks(outbound["health"])
        self.assertNotIn("installed_version", dump(outbound))

    def test_init_player_admin_still_receives_diagnostics(self):
        init_player = {"op": "initPlayer", "health": SAMPLE_HEALTH, "guildId": "333"}
        outbound = prepare_outbound_payload(init_player, ADMIN_ID, admin_user_id=ADMIN_ID)
        self.assertTrue(outbound["health"]["admin"])
        self.assertEqual(outbound["health"]["components"][1]["installed_version"], "1.18.0")

    def test_playback_health_push_does_not_leak(self):
        outbound = serialize_health_message(SAMPLE_HEALTH, USER_ID, admin_user_id=ADMIN_ID)
        self.assertEqual(outbound["op"], "playbackHealth")
        self.assertEqual(outbound["guildId"], "333")
        self.assertFalse(outbound["admin"])
        self.assert_no_admin_leaks(outbound)

    def test_get_health_uses_authenticated_identity(self):
        response = dict(SAMPLE_HEALTH)
        response["userId"] = ADMIN_ID
        outbound = serialize_health_message(response, USER_ID, admin_user_id=ADMIN_ID)
        self.assertFalse(outbound["admin"])
        self.assert_no_admin_leaks(outbound)

    def test_reconnect_resync_remains_filtered(self):
        resync = {"op": "initPlayer", "health": SAMPLE_HEALTH}
        first = prepare_outbound_payload(resync, USER_ID, admin_user_id=ADMIN_ID)
        second = prepare_outbound_payload(resync, USER_ID, admin_user_id=ADMIN_ID)
        self.assertEqual(first["health"], second["health"])
        self.assert_no_admin_leaks(second["health"])


class SettingsAdminConfigTests(unittest.TestCase):
    def setUp(self):
        configure_admin_user_id(None)

    def tearDown(self):
        configure_admin_user_id(None)

    def _settings(self, payload):
        handle, path = tempfile.mkstemp(suffix=".json")
        os.close(handle)
        try:
            with open(path, "w", encoding="utf-8") as file:
                json.dump(payload, file)
            return Settings(path)
        finally:
            os.remove(path)

    def test_missing_admin_id_does_not_fail_and_is_not_everyone(self):
        settings = self._settings({"host": "localhost"})
        self.assertIsNone(settings.admin_user_id)
        self.assertFalse(is_dashboard_admin(ADMIN_ID, settings.admin_user_id))
        self.assertFalse(is_dashboard_admin(USER_ID, settings.admin_user_id))

    def test_blank_admin_id_is_not_admin(self):
        settings = self._settings({"admin_user_id": ""})
        self.assertIsNone(settings.admin_user_id)

    def test_configured_admin_id_is_a_string(self):
        settings = self._settings({"admin_user_id": ADMIN_ID})
        self.assertEqual(settings.admin_user_id, ADMIN_ID)
        self.assertIsInstance(settings.admin_user_id, str)


class WebSocketFilterTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        configure_admin_user_id(ADMIN_ID)
        UserPool._users = {}

    def tearDown(self):
        configure_admin_user_id(None)
        UserPool._users = {}

    def _user(self, user_id, name="Test"):
        user = User(UserPool, {"id": user_id, "global_name": name, "avatar": "a", "access_token": f"token-{user_id}"})
        user._websocket = FakeWebsocket()
        UserPool._users[user.id] = user
        return user

    async def test_user_send_filters_playback_health(self):
        user = self._user(USER_ID)
        await user.send(SAMPLE_HEALTH)
        outbound = user._websocket.messages[0]
        self.assertFalse(outbound["admin"])
        self.assertNotIn("1.18.0", dump(outbound))
        self.assertNotIn("YOUTUBE_SOURCE_FAILED", dump(outbound))

    async def test_admin_send_keeps_diagnostics(self):
        admin = self._user(ADMIN_ID)
        await admin.send(SAMPLE_HEALTH)
        outbound = admin._websocket.messages[0]
        self.assertTrue(outbound["admin"])
        self.assertIn("1.18.0", dump(outbound))

    async def test_send_to_bot_overwrites_client_user_id(self):
        user = self._user(USER_ID)

        class FakeBot:
            def __init__(self):
                self.sent = []

            async def send(self, payload):
                self.sent.append(payload)

        user.bot = FakeBot()
        await user.send_to_bot({"op": "getHealth", "userId": ADMIN_ID})
        self.assertEqual(user.bot.sent[0]["userId"], USER_ID)
        self.assertNotEqual(user.bot.sent[0]["userId"], ADMIN_ID)

    async def test_guild_broadcast_does_not_bypass_membership(self):
        guild = Guild(bot=None, guild_id="333")
        member = RecordingUser(USER_ID)
        outsider_admin = RecordingUser(ADMIN_ID)
        guild._users[member.id] = member
        await guild.broadcast(SAMPLE_HEALTH)
        self.assertEqual(len(member.sent), 1)
        self.assertEqual(outsider_admin.sent, [])

    async def test_guild_broadcast_filters_per_authenticated_member(self):
        guild = Guild(bot=None, guild_id="333")
        member = self._user(USER_ID)
        admin = self._user(ADMIN_ID)
        guild._users[member.id] = member
        guild._users[admin.id] = admin
        await guild.broadcast(SAMPLE_HEALTH)
        public = member._websocket.messages[0]
        privileged = admin._websocket.messages[0]
        self.assertFalse(public["admin"])
        self.assertTrue(privileged["admin"])
        self.assertNotIn("youtube-plugin", dump(public))
        self.assertIn("youtube-plugin", dump(privileged))


if __name__ == "__main__":
    unittest.main()
