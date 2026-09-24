import json
import subprocess
import unittest
from html.parser import HTMLParser
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


class PageParser(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.nodes = []
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        self.nodes.append((tag, dict(attrs)))


class HomepageContractTest(unittest.TestCase):
    def setUp(self):
        self.html = (ROOT / "index.html").read_text(encoding="utf-8")
        self.nodes = PageParser(self.html).nodes

    def test_current_identity_and_four_series(self):
        for text in ("庫倫 Coulomb", "異相工作室", "Out of Phase Studio",
                     "AI・科技", "Zero Sequence", "空想科學台", "異相實驗室"):
            self.assertIn(text, self.html)
        self.assertEqual(sum(tag == "h1" for tag, _ in self.nodes), 1)
        self.assertEqual(sum(attrs.get("class") == "series-item" for _, attrs in self.nodes), 4)

    def test_internal_anchors_and_ids(self):
        ids = [attrs["id"] for _, attrs in self.nodes if "id" in attrs]
        self.assertEqual(len(ids), len(set(ids)))
        for tag, attrs in self.nodes:
            href = attrs.get("href", "")
            if tag == "a" and href.startswith("#"):
                self.assertIn(href[1:], ids)

    def test_static_fallback_matches_public_registry(self):
        registry = json.loads((ROOT / "projects.json").read_text(encoding="utf-8"))
        for project in registry["projects"]:
            if project.get("published") is False:
                continue
            for key in ("title", "description", "path", "cover"):
                self.assertIn(project[key], self.html)
        self.assertNotIn("hanzi-generals/v2", self.html)
        self.assertIn('href="./games/hanzi-generals/"', self.html)

    def test_filters_start_hidden_and_disabled(self):
        filters = next(attrs for _, attrs in self.nodes if attrs.get("id") == "project-filters")
        self.assertIn("hidden", filters)
        buttons = [attrs for tag, attrs in self.nodes if tag == "button" and "data-filter" in attrs]
        self.assertEqual(len(buttons), 3)
        self.assertTrue(all("disabled" in attrs and "aria-pressed" in attrs for attrs in buttons))

    def test_assets_and_canonical_route(self):
        for tag, attrs in self.nodes:
            value = attrs.get("src", "") if tag in ("script", "img") else attrs.get("href", "") if tag == "link" else ""
            if value.startswith("./"):
                self.assertTrue((ROOT / value[2:]).is_file(), value)
        canonical = next(attrs for tag, attrs in self.nodes if tag == "link" and attrs.get("rel") == "canonical")
        self.assertEqual(canonical["href"], "https://moonlightengineer.github.io/Moonlight-playground/")

    def test_404_has_stable_return_route_and_new_identity(self):
        html = (ROOT / "404.html").read_text(encoding="utf-8")
        self.assertIn("異相工作室", html)
        self.assertIn('href="/Moonlight-playground/"', html)


if __name__ == "__main__":
    unittest.main()
