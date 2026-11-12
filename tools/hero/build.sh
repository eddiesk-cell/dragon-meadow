#!/bin/bash
# Generated mesh → clean → house autorig → VRM names → cloth spring bones → the Drifter's 51 clips → public/models/hero.glb
#   tools/hero/build.sh art/hero/raw/hero-tripo.glb [markers.json]
# Run unsandboxed (Blender writes its tickets under /tmp). Look at art/hero/rig/hero.markers.png every time.
set -euo pipefail
cd "$(dirname "$0")/../.."
SRC=$1; MARK=${2:-}
STUDIO="/Users/eddie/Documents/Guru AVS Campaign/studio"
DONOR="/Users/eddie/Documents/Character-Library/2026-10-25-world-of-dreams-drifter/rigged/drifter-v2-textured-51clips.glb"
RETARGET=/Users/eddie/Documents/Eddie/popup-book/tools/retarget.py
export PATH=$HOME/.local/homebrew/bin:$PATH
mkdir -p art/hero/rig
blender -b -P tools/hero/prep.py -- "$SRC" art/hero/rig/hero-clean.glb 60000 2>&1 | grep -E "^PREP|Error"
"$STUDIO/tools/rig/autorig.sh" art/hero/rig/hero-clean.glb art/hero/rig/hero.fbx ${MARK:+--markers "$MARK"}
blender -b -P "$STUDIO/tools/rig/kimodo_glb.py" -- art/hero/rig/hero.fbx art/hero/rig/hero-vrm.glb 2>&1 | grep -E "Error|Traceback" || true
# Bandana tails + hem panels as spring_<chain>_<n> bones (src/springs.js swings them); fails on a chain with 0 vertices.
blender -b --python-exit-code 1 -P tools/hero/springs.py -- art/hero/rig/hero-vrm.glb art/hero/rig/hero-springs.glb 2>&1 | grep -E "^SPRINGS|Error|Traceback|assert"
CLIPS=$(python3 -c "
import json,struct; b=open('$DONOR','rb').read(); n=struct.unpack('<I',b[12:16])[0]
print('\n'.join(a['name'] for a in json.loads(b[20:20+n])['animations']))")
mapfile_clips=(); while IFS= read -r c; do mapfile_clips+=("$c"); done <<< "$CLIPS"
# Idle first: retarget.py centres in-place clips on Idle's hips.
ordered=("Idle"); for c in "${mapfile_clips[@]}"; do [ "$c" != "Idle" ] && ordered+=("$c"); done
blender -b -P "$RETARGET" -- art/hero/rig/hero-springs.glb "$DONOR" public/models/hero.glb "${ordered[@]}" 2>&1 | grep -E "Error|Traceback|wrote|clips" | tail -5
# Proof the retarget kept the spring bones and every clip: bones before/after, spring bones, animations.
python3 - art/hero/rig/hero-springs.glb public/models/hero.glb <<'PY'
import json, struct, sys
def gl(p):
    b = open(p, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]; return json.loads(b[20:20 + n])
a, b = gl(sys.argv[1]), gl(sys.argv[2])
sp = lambda g: sum(g['nodes'][j]['name'].startswith('spring_') for j in g['skins'][0]['joints'])
print(f"BUILD bones {len(a['skins'][0]['joints'])} -> {len(b['skins'][0]['joints'])} (spring {sp(a)} -> {sp(b)}), animations {len(b.get('animations', []))}")
assert len(b['skins'][0]['joints']) == len(a['skins'][0]['joints']) and sp(b) == sp(a) > 0 and len(b.get('animations', [])) == 51
PY
ls -la public/models/hero.glb
