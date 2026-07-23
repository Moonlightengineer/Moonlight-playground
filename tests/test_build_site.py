import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class BuildSiteTest(unittest.TestCase):
    def test_build_keeps_classic_and_copies_hidden_v2(self):
        result = subprocess.run(
            ["python", "scripts/build_site.py"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        self.assertIn("SITE_VERIFY_OK", result.stdout)

        classic_path = ROOT / "_site/games/hanzi-generals/index.html"
        v2_path = ROOT / "_site/games/hanzi-generals/v2/index.html"
        classic = classic_path.read_text(encoding="utf-8")
        v2 = v2_path.read_text(encoding="utf-8")

        self.assertIn('id="game-app"', classic)
        self.assertIn('id="v2-game-app"', v2)
        self.assertFalse((ROOT / "_site/games/hanzi-generals/v2/tests").exists())

    def test_v2_is_not_registered_on_public_homepage(self):
        registry = (ROOT / "projects.json").read_text(encoding="utf-8")
        self.assertNotIn('"v2"', registry)
        self.assertNotIn('hanzi-generals/v2', registry)


if __name__ == "__main__":
    unittest.main()
