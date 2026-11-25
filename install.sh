#!/bin/sh
# Linux and macOS: same as `python3 install.py`.
exec python3 "$(dirname "$0")/install.py" "$@"
