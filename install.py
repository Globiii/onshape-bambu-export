#!/usr/bin/env python3
"""Registers bambu_host.py with Chromium-based browsers (Chrome, Edge, Brave, Chromium) on Linux, macOS and Windows.

Run again after moving this folder. `python install.py --uninstall` removes the registration.
"""
import json
import sys
from pathlib import Path

NAME = "io.github.globiii.onshape_bambu"
EXTENSION_ID = "lhdnlofeehnhkenhjbifjcjcbijgkmcm"  # fixed by the "key" in onshape-exporter/manifest.json
HERE = Path(__file__).resolve().parent
HOST = HERE / "bambu_host.py"

LINUX_DIRS = ["google-chrome", "chromium", "BraveSoftware/Brave-Browser", "microsoft-edge"]
MAC_DIRS = ["Google/Chrome", "Chromium", "BraveSoftware/Brave-Browser", "Microsoft Edge"]  # in ~/Library/Application Support
WINDOWS_KEYS = [r"Software\Google\Chrome", r"Software\Chromium", r"Software\BraveSoftware\Brave-Browser",
                r"Software\Microsoft\Edge"]


def manifest(host_path):
    return {
        "name": NAME,
        "description": "Open Onshape exports in Bambu Studio",
        "path": str(host_path),
        "type": "stdio",
        "allowed_origins": [f"chrome-extension://{EXTENSION_ID}/"],
    }


def install_posix(uninstall, mac):
    if mac:
        # Chrome on macOS runs hosts with a minimal PATH where python3 may be the Xcode stub, so pin this Python.
        host = HERE / "bambu_host.sh"
        if not uninstall:
            host.write_text(f'#!/bin/sh\nexec "{sys.executable}" "{HOST}" "$@"\n')
            host.chmod(0o755)
        root, dirs = Path.home() / "Library" / "Application Support", MAC_DIRS
    else:
        host = HOST
        HOST.chmod(0o755)
        root, dirs = Path.home() / ".config", LINUX_DIRS
    done = []
    for d in dirs:
        browser = root / d
        if not browser.is_dir():
            continue
        target = browser / "NativeMessagingHosts" / f"{NAME}.json"
        if uninstall:
            target.unlink(missing_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(manifest(host), indent=2))
        done.append(d)
    return done


def install_windows(uninstall):
    import winreg
    # Chrome can't run a .py directly; a .bat that calls this exact Python works without relying on PATH.
    launcher = HERE / "bambu_host.bat"
    manifest_file = HERE / f"{NAME}.json"
    if not uninstall:
        launcher.write_text(f'@echo off\r\n"{sys.executable}" "{HOST}" %*\r\n')
        manifest_file.write_text(json.dumps(manifest(launcher), indent=2))
    done = []
    for base in WINDOWS_KEYS:
        key = rf"{base}\NativeMessagingHosts\{NAME}"
        if uninstall:
            try:
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, key)
            except FileNotFoundError:
                continue
        else:
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key) as k:
                winreg.SetValueEx(k, "", 0, winreg.REG_SZ, str(manifest_file))
        done.append(base.split("\\")[-1])
    return done


def main():
    uninstall = "--uninstall" in sys.argv
    if sys.platform == "win32":
        done = install_windows(uninstall)
    else:
        done = install_posix(uninstall, mac=sys.platform == "darwin")
    if not done:
        sys.exit("No supported browser found." if not uninstall else "Nothing to remove.")
    print(("Removed from: " if uninstall else "Registered for: ") + ", ".join(done))
    if not uninstall:
        print("Now reload the extension on your browser's extensions page.")


if __name__ == "__main__":
    main()
