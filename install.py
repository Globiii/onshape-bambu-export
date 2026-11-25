#!/usr/bin/env python3
"""Registers bambu_host.py with Chromium-based browsers (Chrome, Edge, Brave, Chromium) on Linux and Windows.

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


def install_linux(uninstall):
    HOST.chmod(0o755)
    done = []
    for d in LINUX_DIRS:
        browser = Path.home() / ".config" / d
        if not browser.is_dir():
            continue
        target = browser / "NativeMessagingHosts" / f"{NAME}.json"
        if uninstall:
            target.unlink(missing_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(manifest(HOST), indent=2))
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
    done = install_windows(uninstall) if sys.platform == "win32" else install_linux(uninstall)
    if not done:
        sys.exit("No supported browser found." if not uninstall else "Nothing to remove.")
    print(("Removed from: " if uninstall else "Registered for: ") + ", ".join(done))
    if not uninstall:
        print("Now reload the extension on your browser's extensions page.")


if __name__ == "__main__":
    main()
