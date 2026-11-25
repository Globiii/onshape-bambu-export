#!/bin/sh
# Registers bambu_host.py with Chromium-based browsers so the extension can save files and open Bambu Studio.
set -e
DIR=$(cd "$(dirname "$0")" && pwd)
NAME=io.github.globiii.onshape_bambu
chmod +x "$DIR/bambu_host.py"

installed=0
for BROWSER_DIR in google-chrome chromium BraveSoftware/Brave-Browser microsoft-edge; do
  [ -d "$HOME/.config/$BROWSER_DIR" ] || continue
  HOST_DIR="$HOME/.config/$BROWSER_DIR/NativeMessagingHosts"
  mkdir -p "$HOST_DIR"
  cat > "$HOST_DIR/$NAME.json" <<EOF
{
  "name": "$NAME",
  "description": "Open Onshape exports in Bambu Studio",
  "path": "$DIR/bambu_host.py",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://lhdnlofeehnhkenhjbifjcjcbijgkmcm/"]
}
EOF
  echo "Registered for $BROWSER_DIR"
  installed=1
done

[ "$installed" = 1 ] || { echo "No supported browser profile found in ~/.config"; exit 1; }
echo "Done. Reload the extension in your browser's extensions page."
