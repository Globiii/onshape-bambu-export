#!/usr/bin/env python3
"""Builds the Firefox version of the extension for addons.mozilla.org ("On your own" / unlisted signing).

Creates dist/firefox/ (the folder) and dist/onshape-exporter-firefox-<version>.zip (upload this), and adds the version
to updates.json, which installed copies check for updates. After signing, attach the signed .xpi to a GitHub release
named v<version> with the file name printed below, and push updates.json.
"""
import json
import shutil
from pathlib import Path

REPO = "Globiii/onshape-bambu-export"
HERE = Path(__file__).resolve().parent
SRC = HERE / "onshape-exporter"
OUT = HERE / "dist" / "firefox"
UPDATES = HERE / "updates.json"
UPDATE_URL = f"https://raw.githubusercontent.com/{REPO}/main/updates.json"

m = json.loads((SRC / "manifest.json").read_text())
version, gecko = m["version"], m["browser_specific_settings"]["gecko"]
m.pop("key")  # Chrome-only
m["background"] = {"scripts": m["background"]["scripts"]}  # Firefox runs these; it has no service worker here
gecko["strict_min_version"] = "140.0"  # data_collection_permissions needs 140
gecko["update_url"] = UPDATE_URL

shutil.rmtree(OUT, ignore_errors=True)
shutil.copytree(SRC, OUT, ignore=shutil.ignore_patterns(".*"))
(OUT / "manifest.json").write_text(json.dumps(m, indent=2, ensure_ascii=False) + "\n")
zip_path = shutil.make_archive(str(HERE / "dist" / f"onshape-exporter-firefox-{version}"), "zip", OUT)

xpi = f"onshape-exporter-{version}.xpi"
updates = json.loads(UPDATES.read_text()) if UPDATES.exists() else {"addons": {gecko["id"]: {"updates": []}}}
entries = updates["addons"][gecko["id"]]["updates"]
if not any(e["version"] == version for e in entries):
    entries.append({"version": version, "update_link": f"https://github.com/{REPO}/releases/download/v{version}/{xpi}"})
UPDATES.write_text(json.dumps(updates, indent=2) + "\n")

print(f"Folder: {OUT}\nUpload: {zip_path}\nAfter signing, name the .xpi {xpi} and attach it to GitHub release v{version}.")
