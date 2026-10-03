#!/bin/sh
# Serves the game at http://localhost:8765 (audio needs http, not file://)
exec python3 "$(dirname "$0")/serve.py" 8765
