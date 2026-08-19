import os
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(relative_path: str) -> str:
    with open(os.path.join(ROOT, relative_path), encoding="utf-8") as handle:
        return handle.read()


class DiagnosticsTemplateTests(unittest.TestCase):
    def test_sidebar_entry_is_hidden_by_default(self):
        menu = read("templates/menu.html")
        self.assertIn('id="menu-diagnostics-page"', menu)
        self.assertIn("Diagnostics", menu)
        self.assertIn('style="display: none"', menu.split('id="menu-diagnostics-page"', 1)[1].split(">", 1)[0])

    def test_banner_is_compact_and_has_no_admin_dump(self):
        index = read("templates/index.html")
        self.assertIn('id="playback-health-bar"', index)
        self.assertIn('id="playback-health-diagnostics-link"', index)
        self.assertIn('id="playback-health-close"', index)
        self.assertIn("View diagnostics", index)
        self.assertNotIn("playback-health-admin-details", index)
        self.assertNotIn("Admin diagnostics", index)

    def test_diagnostics_page_exists(self):
        index = read("templates/index.html")
        self.assertIn('id="diagnostics-page"', index)
        self.assertIn('id="diagnostics-components"', index)
        self.assertIn('id="diagnostics-failure"', index)
        self.assertIn('id="diagnostics-error"', index)

    def test_ipc_disconnect_banner_is_separate(self):
        index = read("templates/index.html")
        warning = index.index('class="warning-bar"')
        health = index.index('id="playback-health-bar"')
        diagnostics = index.index('id="diagnostics-page"')
        self.assertLess(warning, health)
        self.assertLess(health, diagnostics)


class PlaybackHealthUiScriptTests(unittest.TestCase):
    def test_ui_helpers(self):
        script = os.path.join(ROOT, "tests", "test_playback_health_ui.js")
        completed = subprocess.run(
            ["node", script],
            capture_output=True,
            text=True,
            cwd=ROOT,
        )
        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        self.assertIn("ok", completed.stdout)


if __name__ == "__main__":
    unittest.main()
