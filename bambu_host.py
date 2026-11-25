#!/usr/bin/env python3
"""Chrome native-messaging helper: saves files sent by the Onshape extension and opens them in Bambu Studio."""
import base64
import os
import json
import re
import shutil
import struct
import subprocess
import sys
import time
from pathlib import Path

WINDOWS = sys.platform == "win32"
MAC = sys.platform == "darwin"
# Both inside $HOME so the Bambu Flatpak can read them.
OUT_ROOT = Path.home() / "Downloads" / "onshape-export"  # "both": user keeps the files
CACHE_ROOT = OUT_ROOT / ".temp"  # "bambu only": temporary; not directly in ~/.* because snaps can't read that
CACHE_DAYS = 7
FLATPAK_ID = "com.bambulab.BambuStudio"
ALLOWED_EXT = {".stl", ".step", ".3mf", ".igs", ".x_t"}
BAMBU_EXT = {".stl", ".step", ".3mf"}  # what Bambu Studio can open


def read_msg():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        sys.exit(0)
    return json.loads(sys.stdin.buffer.read(struct.unpack("<I", raw)[0]))


def send_msg(obj):
    data = json.dumps(obj).encode()
    sys.stdout.buffer.write(struct.pack("<I", len(data)) + data)
    sys.stdout.buffer.flush()


# Names Windows refuses as file or folder names, with or without an extension.
WIN_RESERVED = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}


def clean(text, fallback):
    """One safe path component: no separators, no leading dots, so names from the browser can't escape the folder."""
    name = re.sub(r"[^\w.+\- ]+", "_", str(text)).strip(" ._")[:80] or fallback
    return f"_{name}" if name.split(".")[0].upper() in WIN_RESERVED else name


def launch(cmd):
    """Start a program that outlives this helper, without inheriting Chrome's stdin/stdout pipe."""
    io = dict(stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if not WINDOWS:
        return subprocess.Popen(cmd, start_new_session=True, **io)
    flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
    try:  # Chrome may run the helper in a job that kills children when it exits; break out of it if allowed.
        return subprocess.Popen(cmd, creationflags=flags | subprocess.CREATE_BREAKAWAY_FROM_JOB, **io)
    except OSError:
        return subprocess.Popen(cmd, creationflags=flags, **io)


def safe_name(name, taken):
    stem, dot, ext = Path(name).name.rpartition(".")
    if not dot or f".{ext.lower()}" not in ALLOWED_EXT:
        raise ValueError(f"refusing file type: {name!r}")
    stem = clean(stem, "part")
    candidate, n = f"{stem}.{ext.lower()}", 1
    while candidate in taken:  # Onshape allows duplicate part names
        n += 1
        candidate = f"{stem}_{n}.{ext.lower()}"
    taken.add(candidate)
    return candidate


def save_files(files, out_dir, archive_old=True):
    out_dir.mkdir(parents=True, exist_ok=True)
    # In a folder the user picked, never overwrite and don't add an archive/ folder: existing names count as
    # taken, so new files get _2, _3… instead.
    taken = set() if archive_old else {p.name for p in out_dir.iterdir()}
    # Decode everything first so a bad file can't leave the folder half archived.
    new = [(out_dir / safe_name(f["name"], taken), base64.b64decode(f["b64"], validate=True)) for f in files]

    # Move files this export replaces into archive/<when they were exported>/ instead of overwriting them.
    for p, _ in new:
        if not p.exists():
            continue
        archive = out_dir / "archive" / time.strftime("%Y-%m-%d_%H-%M-%S", time.localtime(p.stat().st_mtime))
        archive.mkdir(parents=True, exist_ok=True)
        target, n = archive / p.name, 1
        while target.exists():  # never overwrite an archived file
            n += 1
            target = archive / f"{p.stem}_{n}{p.suffix}"
        p.replace(target)

    for path, data in new:
        path.write_bytes(data)
    return [str(p) for p, _ in new]


def prune_cache():
    cutoff = time.time() - CACHE_DAYS * 86400
    for d in CACHE_ROOT.glob("*/"):
        if d.stat().st_mtime < cutoff:
            shutil.rmtree(d, ignore_errors=True)


def bambu_command():
    """How to start Bambu Studio: $BAMBU_STUDIO, the Windows install folder, the macOS app, the Flatpak, or a
    bambu-studio/AppImage on PATH or in ~/Applications."""
    if os.environ.get("BAMBU_STUDIO"):
        return [os.environ["BAMBU_STUDIO"]]
    if MAC:
        for apps in (Path("/Applications"), Path.home() / "Applications"):
            for app in ("BambuStudio.app", "Bambu Studio.app"):
                if (apps / app).is_dir():
                    return ["open", "-a", str(apps / app)]  # `open` hands the files to the app and returns
        raise RuntimeError("BambuStudio.app not found in /Applications. Install it, or set BAMBU_STUDIO.")
    if WINDOWS:
        # shortcut: checks the default install folders only, read the uninstall registry key if people install elsewhere
        for base in ("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"):
            for sub in ("Bambu Studio", r"Programs\Bambu Studio"):
                exe = Path(os.environ.get(base, "")) / sub / "bambu-studio.exe"
                if os.environ.get(base) and exe.is_file():
                    return [str(exe)]
    if shutil.which("flatpak") and subprocess.run(["flatpak", "info", FLATPAK_ID], capture_output=True).returncode == 0:
        return ["flatpak", "run", FLATPAK_ID]
    for name in ("bambu-studio", "BambuStudio"):  # snap, distro package, or a symlinked AppImage
        if shutil.which(name):
            return [shutil.which(name)]
    appimages = sorted((Path.home() / "Applications").glob("Bambu*Studio*.AppImage"))
    if appimages:
        return [str(appimages[-1])]
    raise RuntimeError("Bambu Studio not found. Install it, or set BAMBU_STUDIO to its path.")


def pick_folder():
    """Native folder dialog; None if the user cancels."""
    if WINDOWS:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)  # otherwise the dialog can open behind the browser
        path = filedialog.askdirectory(parent=root, title="Save Onshape export to…", initialdir=Path.home() / "Downloads")
        root.destroy()
        return Path(path) if path else None
    if MAC:
        script = 'POSIX path of (choose folder with prompt "Save Onshape export to…" default location (path to downloads folder))'
        r = subprocess.run(["osascript", "-e", script], stdin=subprocess.DEVNULL, capture_output=True, text=True)
        path = r.stdout.strip()
        return Path(path) if r.returncode == 0 and path else None  # returncode 1 = cancelled
    r = subprocess.run(["zenity", "--file-selection", "--directory", "--title=Save Onshape export to…",
                        f"--filename={Path.home() / 'Downloads'}/"],
                       stdin=subprocess.DEVNULL, capture_output=True, text=True)
    path = r.stdout.strip()
    return Path(path) if r.returncode == 0 and path else None


def main():
    try:
        msg = read_msg()
        if msg.get("openFolder"):
            # The Part Studio's folder if it was exported before, else the export root.
            doc, studio = ((msg.get("folder") or []) + ["", ""])[:2]
            target = OUT_ROOT / clean(doc, "document") / clean(studio, "part studio")
            if not target.is_dir():
                target = OUT_ROOT
            target.mkdir(parents=True, exist_ok=True)
            if WINDOWS:
                os.startfile(target)
            else:
                launch(["open" if MAC else "xdg-open", str(target)])
            return send_msg({"ok": True, "dir": str(target).replace(str(Path.home()), "~", 1)})
        # mode: "both" (organised + Bambu), "bambu" (cache + Bambu), "save" (organised), "saveas" (picked folder).
        mode = msg.get("mode") or ("both" if msg.get("keep") else "bambu")  # "keep" = older extension versions
        if mode in ("both", "save"):
            # Same day + same version = same folder; replaced files move to its archive/ subfolder.
            doc, studio, version = (msg.get("folder") or ["unsorted", "unsorted", ""])[:3]
            out_dir = (OUT_ROOT / clean(doc, "document") / clean(studio, "part studio")
                       / f"{time.strftime('%Y-%m-%d')}_{clean(version, 'unknown')}")
        elif mode == "saveas":
            out_dir = pick_folder()
            if out_dir is None:
                return send_msg({"cancelled": True})
        else:
            prune_cache()
            out_dir = CACHE_ROOT / time.strftime("%Y-%m-%d_%H-%M-%S")
        paths = save_files(msg["files"], out_dir, archive_old=mode != "saveas")
        printable = [p for p in paths if Path(p).suffix in BAMBU_EXT]
        if mode in ("both", "bambu") and printable:
            launch([*bambu_command(), *printable])
        send_msg({"ok": True, "paths": paths, "dir": str(out_dir).replace(str(Path.home()), "~", 1)})
    except Exception as e:  # report back to the popup instead of dying silently
        send_msg({"err": str(e)})


if __name__ == "__main__":
    main()
