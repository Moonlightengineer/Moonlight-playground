from __future__ import annotations

import base64
import gzip
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "_site"
PACKAGE_PATTERN = "hanzi-generals.html.gz.b64.part-*"
V2_SOURCE = ROOT / "games" / "hanzi-generals" / "v2"
V2_OUTPUT = OUTPUT / "games" / "hanzi-generals" / "v2"


def require_text(path: Path, marker: str) -> None:
    text = path.read_text(encoding="utf-8")
    if marker not in text:
        raise RuntimeError(
            f"Missing expected marker {marker!r} in {path.relative_to(ROOT)}"
        )


def build() -> None:
    registry_path = ROOT / "projects.json"
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    projects = registry.get("projects")
    if not isinstance(projects, list) or not projects:
        raise RuntimeError("projects.json must contain at least one project")

    if any("hanzi-generals/v2" in str(project.get("path", "")) for project in projects):
        raise RuntimeError("Hidden Hanzi Generals v2 must not be listed in projects.json")

    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    (OUTPUT / "assets").mkdir(parents=True)
    (OUTPUT / "games" / "hanzi-generals").mkdir(parents=True)

    for filename in ("index.html", "projects.json", "404.html", ".nojekyll"):
        shutil.copy2(ROOT / filename, OUTPUT / filename)
    shutil.copytree(ROOT / "assets", OUTPUT / "assets", dirs_exist_ok=True)
    shutil.copy2(
        ROOT / "games" / "hanzi-generals" / "cover.svg",
        OUTPUT / "games" / "hanzi-generals" / "cover.svg",
    )

    package_parts = sorted((ROOT / "site-packages").glob(PACKAGE_PATTERN))
    if not package_parts:
        raise RuntimeError("Hanzi Generals package parts are missing")

    encoded = "".join(
        part.read_text(encoding="ascii").strip() for part in package_parts
    )
    compressed = base64.b64decode(encoded, validate=True)
    game_html = gzip.decompress(compressed)
    game_output = OUTPUT / "games" / "hanzi-generals" / "index.html"
    game_output.write_bytes(game_html)

    if len(game_html) < 50_000:
        raise RuntimeError("Hanzi Generals output is unexpectedly small")
    require_text(OUTPUT / "index.html", "月光試驗場")
    require_text(game_output, 'id="game-app"')
    require_text(game_output, "字陣無雙")

    v2_copied = False
    if V2_SOURCE.exists():
        shutil.copytree(
            V2_SOURCE,
            V2_OUTPUT,
            dirs_exist_ok=True,
            ignore=shutil.ignore_patterns("tests", "*.test.js"),
        )
        require_text(V2_OUTPUT / "index.html", 'id="v2-game-app"')
        require_text(V2_OUTPUT / "index.html", "群雄遠征")
        if (V2_OUTPUT / "tests").exists():
            raise RuntimeError("v2 tests must not be copied into the deployed site")
        v2_copied = True

    print(
        "SITE_VERIFY_OK "
        f"projects={len(projects)} game_bytes={len(game_html)} v2={int(v2_copied)}"
    )


if __name__ == "__main__":
    build()
