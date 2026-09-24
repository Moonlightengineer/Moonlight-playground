import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class BuildSiteTest(unittest.TestCase):
    def test_boss_manifest_rejects_windows_drive(self):
        from scripts.build_site import build
        from unittest.mock import patch
        import json
        manifest = json.loads((ROOT / "docs/boss-comparison/packaging.json").read_text(encoding="utf-8"))
        manifest["opus"]["assets"]["C:/tmp/escape.bin"] = "unused"
        original = Path.read_text
        def read_manifest(path, *args, **kwargs):
            return json.dumps(manifest) if path.name == "packaging.json" else original(path, *args, **kwargs)
        with patch.object(Path, "read_text", read_manifest):
            with self.assertRaisesRegex(RuntimeError, "Nonportable asset path"):
                build()

    def test_boss_comparison_requires_packaged_assets(self):
        from scripts.build_site import build, ROOT
        from unittest.mock import patch
        original = Path.read_bytes
        def missing_asset(path):
            if path.parent.name == "assets" and "boss-model-comparison" in path.parts:
                raise FileNotFoundError("Simulated missing game bundle")
            return original(path)
        with patch.object(Path, "read_bytes", missing_asset):
            with self.assertRaises(FileNotFoundError):
                build()
        build()
        for model in ("opus", "astra", "sol"):
            self.assertTrue((ROOT / f"_site/games/boss-model-comparison/play/{model}/index.html").is_file())

    def test_build_keeps_classic_and_copies_hidden_v2(self):
        result = subprocess.run(
            ["python", "scripts/build_site.py"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        self.assertIn("SITE_VERIFY_OK", result.stdout)
        self.assertIn("v2=1", result.stdout)

        classic_path = ROOT / "_site/games/hanzi-generals/index.html"
        v2_path = ROOT / "_site/games/hanzi-generals/v2/index.html"
        classic = classic_path.read_text(encoding="utf-8")
        v2 = v2_path.read_text(encoding="utf-8")

        self.assertIn('id="game-app"', classic)
        self.assertIn('id="v2-game-app"', v2)
        self.assertIn("群雄遠征", v2)
        self.assertTrue((ROOT / "_site/games/hanzi-generals/v2/src/app.js").exists())
        self.assertTrue((ROOT / "_site/games/hanzi-generals/v2/data/stages.js").exists())
        self.assertFalse((ROOT / "_site/games/hanzi-generals/v2/tests").exists())

    def test_v2_is_not_registered_on_public_homepage(self):
        source_registry = (ROOT / "projects.json").read_text(encoding="utf-8")
        built_registry = (ROOT / "_site/projects.json").read_text(encoding="utf-8")
        for registry in (source_registry, built_registry):
            self.assertNotIn('"id": "hanzi-generals-v2"', registry)
            self.assertNotIn("hanzi-generals/v2", registry)

    def test_build_does_not_copy_node_tests_or_private_plans(self):
        subprocess.run(
            ["python", "scripts/build_site.py"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        self.assertFalse((ROOT / "_site/games/hanzi-generals/v2/tests").exists())
        self.assertFalse((ROOT / "_site/docs").exists())


if __name__ == "__main__":
    unittest.main()
