# Onshape → Bambu Studio exporter

A Chrome extension that exports parts from the Onshape Part Studio you have open and sends them straight to Bambu Studio, like Fusion's "Send to 3D print utility". You can also save them into a tidy folder tree, or anywhere you choose.

<img src="docs/popup.png" width="300" alt="Extension popup: part list, format and action choices">

> **Beta.** Linux is tested (Ubuntu, Chrome, Bambu Studio Flatpak). **Windows support is new and not yet tested on a real Windows machine.** Bug reports are very welcome. macOS isn't supported yet.

## Features

- Pick which parts to export; each part becomes its own file.
- Formats: **3MF**, **STEP**, **STL** (binary, millimetres), plus IGES and Parasolid for other CAD tools.
- Then:
  - **Bambu + Save:** open in Bambu Studio and keep a copy in the folder tree
  - **Bambu:** open in Bambu Studio only
  - **Save:** folder tree only
  - **Save as…:** pick any folder
- Folder tree: `Downloads/onshape-export/<document>/<part studio>/<date>_<version>/`. Exporting the same version again moves the older files into `archive/<export time>/` instead of overwriting them.
- Keeps running if you close the popup; the toolbar icon shows `…` / `✓` / `!`.
- Uses your normal Onshape login. No API keys needed.

## Install

You need a Chromium-based browser (Chrome, Edge, Brave, Chromium), Bambu Studio and Python 3.

### Windows

1. Install Python 3 from [python.org](https://www.python.org/downloads/) (keep the "py launcher" option ticked).
2. Download this repo (**Code → Download ZIP**) and unzip it somewhere permanent, e.g. `Documents\onshape-bambu-export`.
3. Double-click **`install.bat`**.
4. Open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**, click **Load unpacked** and pick the `onshape-exporter` folder.

Bambu Studio is found in its default install folder. If yours is elsewhere, set the `BAMBU_STUDIO` environment variable to the full path of `bambu-studio.exe`.

### Linux

```bash
git clone https://github.com/Globiii/onshape-bambu-export.git
cd onshape-bambu-export
./install.sh
```

Then load the `onshape-exporter` folder as above. "Save as…" uses `zenity` (preinstalled on Ubuntu). Bambu Studio is found as a Flatpak, a snap, `bambu-studio` on your PATH, or an AppImage in `~/Applications`; otherwise set `BAMBU_STUDIO=/path/to/bambu-studio`.

### What the installer does

It registers a small helper (`bambu_host.py`) with your browsers. Browsers can't write into your folders or start programs themselves, so the helper does that. It only accepts messages from this extension, and it only writes 3D/CAD files into the export folder or the folder you pick. If you move the folder, run the installer again.

## How it works

The popup runs Onshape API calls inside your open Onshape tab, so they use your existing session. Each part is exported through Onshape's translation service, and the files are passed to the helper over Chrome native messaging. Onshape always writes STL in metres, so the extension rescales STL files to millimetres.

## Uninstall

Remove the extension in your browser, then run `python install.py --uninstall` (Windows: `py install.py --uninstall`).

## Disclaimer

Unofficial hobby project. Not affiliated with or endorsed by Onshape / PTC Inc. or Bambu Lab. Use at your own risk.

## License

MIT, see [LICENSE](LICENSE).
