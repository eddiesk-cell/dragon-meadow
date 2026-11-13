#!/bin/bash
# Contact sheets of hero clips with the same cameras as art/hero/motion/before-*.png: 8 frames, side on top, front below.
#   tools/hero/sheets.sh <rig.glb> <prefix> Clip [Clip...]   -> <prefix>-<clip>.png   (run unsandboxed: Blender)
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
GLB=$1; PRE=$2; shift 2
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
blender -b -P "$HERE/clipsheet.py" -- "$GLB" "$TMP" "$@" 2>&1 | grep -E "^CLIP |MISSING|Error|Traceback" || true
"$HOME/.local/homebrew/bin/python3.12" - "$TMP" "$PRE" "$@" <<'PY'
import sys; from PIL import Image
tmp, pre, clips = sys.argv[1], sys.argv[2], sys.argv[3:]
for c in clips:
    s = Image.new('RGB', (1800, 600))
    for r, v in enumerate(('side', 'front')):
        for i in range(8): s.paste(Image.open(f'{tmp}/{c}-{v}-{i}.png').convert('RGB').resize((225, 300)), (225 * i, 300 * r))
    s.save(f'{pre}-{c.lower()}.png'); print('SHEET', f'{pre}-{c.lower()}.png')
PY
