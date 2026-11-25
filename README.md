# Onshape → Bambu Studio exporter

A Chrome extension that exports parts from the Onshape Part Studio you have open and sends them straight to Bambu Studio, like Fusion's "Send to 3D print utility". You can also save them into a tidy folder tree, or anywhere you choose.

<img src="docs/popup.png" width="300" alt="Extension popup: part list, format and action choices">

> **Beta, Linux only for now.** Tested on Ubuntu with Chrome and the Bambu Studio Flatpak. Windows/macOS support is planned.

## Features

- Pick which parts to export; each part becomes its own file.
- Formats: **3MF**, **STEP**, **STL** (binary, millimetres), plus IGES and Parasolid for other CAD tools.
- Then:
  - **Bambu + Save:** open in Bambu Studio and keep a copy in the folder tree
  - **Bambu:** open in Bambu Studio only
  - **Save:** folder tree only
  - **Save as…:** pick any folder
- Folder tree: `~/Downloads/onshape-export/<document>/<part studio>/<date>_<version>/`. Exporting the same version again moves the older files into `archive/<export time>/` instead of overwriting them.
- Keeps running if you close the popup; the toolbar icon shows `…` / `✓` / `!`.
- Uses your normal Onshape login. No API keys needed.

## Install

Requirements: Linux, Python 3, a Chromium-based browser (Chrome, Chromium, Brave, Edge), Bambu Studio, and `zenity` for "Save as…" (preinstalled on Ubuntu).

```bash
git clone https://github.com/Globiii/onshape-bambu-export.git
cd onshape-bambu-export
./install.sh
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the `onshape-exporter` folder.

`install.sh` registers a small helper (`bambu_host.py`) with your browser. Browsers can't write into your folders or start programs themselves, so the helper does that. It only accepts messages from this extension, and it only writes 3D/CAD files into the export folder or the folder you pick.

Bambu Studio is found as a Flatpak, a snap, `bambu-studio` on your PATH, or an AppImage in `~/Applications`. Anything else: set `BAMBU_STUDIO=/path/to/bambu-studio`.

## How it works

The popup runs Onshape API calls inside your open Onshape tab, so they use your existing session. Each part is exported through Onshape's translation service, and the files are passed to the helper over Chrome native messaging. Onshape always writes STL in metres, so the extension rescales STL files to millimetres.

## Uninstall

Remove the extension in `chrome://extensions`, then delete `~/.config/<browser>/NativeMessagingHosts/io.github.globiii.onshape_bambu.json`.

## Disclaimer

Unofficial hobby project. Not affiliated with or endorsed by Onshape / PTC Inc. or Bambu Lab. Use at your own risk.

## License

MIT, see [LICENSE](LICENSE).
