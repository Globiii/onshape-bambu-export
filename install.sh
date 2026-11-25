#!/bin/sh
# Linux: same as `python3 install.py`.
exec python3 "$(dirname "$0")/install.py" "$@"
