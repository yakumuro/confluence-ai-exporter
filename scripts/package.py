"""Build a clean Chrome Web Store archive with manifest.json at its root."""
from pathlib import Path
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
RUNTIME_FILES = [ROOT / "manifest.json", ROOT / "background.js", ROOT / "ai-background.js"]
RUNTIME_DIRS = ["content", "lib", "popup", "icons"]


def build():
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    files = list(RUNTIME_FILES)
    for directory in RUNTIME_DIRS:
        files.extend(path for path in (ROOT / directory).rglob("*") if path.is_file())
    missing = [path.name for path in files if not path.exists()]
    if missing:
        raise RuntimeError("Missing runtime files: " + ", ".join(missing))
    DIST.mkdir(exist_ok=True)
    target = DIST / f"confluence-ai-exporter-{manifest['version']}.zip"
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(files):
            archive.write(path, path.relative_to(ROOT).as_posix())
    with zipfile.ZipFile(target) as archive:
        assert archive.testzip() is None
        assert "manifest.json" in archive.namelist()
        reserved = [name for name in archive.namelist() if any(part.startswith("_") for part in Path(name).parts)]
        assert not reserved, "Chrome-reserved filenames: " + ", ".join(reserved)
    print(f"{target.relative_to(ROOT)} · {len(files)} files · {target.stat().st_size} bytes")


if __name__ == "__main__":
    build()
