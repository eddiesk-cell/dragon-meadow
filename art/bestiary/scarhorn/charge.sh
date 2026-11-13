#!/bin/bash
# Scarhorn's ram_charge (BESTIARY "## 9"): text -> Kimodo motion on the desk GPU -> retargeted onto the rigged Scarhorn,
# grounded and its stance feet locked (charge.py) -> build.sh's pose offsets -> appended to full.glb as
# "Kimodo: ram_charge", the other clips kept byte for byte (merge.py) -> public/models/bestiary/scarhorn.glb ->
# charge.png (6 side frames) and the feet numbers. Run on the desk, unsandboxed (GPU, Blender temp files). build.sh
# calls it last.
#   art/bestiary/scarhorn/charge.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."
A=art/bestiary/scarhorn; K=$A/ram_charge; T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
B=/Applications/Blender.app/Contents/MacOS/Blender; PY=$HOME/.local/homebrew/bin/python3.12
OFFS=(leftUpperArm=Y,-30 rightUpperArm=Y,30 leftLowerArm=Y,-18 rightLowerArm=Y,18 neck=X,8 head=X,8)  # build.sh's
# 120 frames blew up on 4 seeds of 4 (the root teleports). Of 30 seeds at 100-110 frames, 110 / seed 24 winds up
# (0.3 m/s), charges, and comes to a dead stop. Kimodo is deterministic: a rerun makes the same motion.
if [ ! -f $K/motion.bvh ]; then
  ~/ai-stack/kimodo/kimodo-generate.sh "a person lowers their head and charges forward hunched over, then skids to a stop" $K 110 100 24 | tail -1
  rm -rf $K/frames $K/motion.gif  # the preview's stills; motion.mp4 keeps the preview
fi
# ADDUCT 0: Kimodo's arm narrowing is for slim explorers; this broad body takes build.sh's 30 deg spread like its other clips
KIMODO_ADDUCT=0 $B -b -noaudio -P $A/charge.py -- $A/full.glb $K/motion.bvh $T/charge.glb 2>&1 | grep -E '^RETARGET|^[A-Za-z]*Error:|Traceback|Assert'
$B -b -noaudio -P tools/monster/pose_offset.py -- $T/charge.glb $T/charge.glb "${OFFS[@]}" 2>&1 | grep -E '^OFFSET .*:|Traceback|Assert'
python3 $A/merge.py $A/full.glb $T/charge.glb $A/full.glb
$PY tools/hero/slim.py $A/full.glb public/models/bestiary/scarhorn.glb | tail -1
$B -b -noaudio -P $A/charge_render.py -- public/models/bestiary/scarhorn.glb $T 2>&1 | grep -E '^(FEET|BODY|TRAVEL|SHOT)|^[A-Za-z]*Error:|Traceback' | tee $T/log
$PY - $T $A/charge.png <<'PY'
import sys; from PIL import Image, ImageDraw
T, out = sys.argv[1:]; shots = [l.split() for l in open(f'{T}/log') if l.startswith('SHOT')]
o = Image.new('RGB', (480 * len(shots), 440)); d = ImageDraw.Draw(o)
for k, s in enumerate(shots):  # SHOT k frame time speed ...
    o.paste(Image.open(f'{T}/charge_{k}.png'), (480 * k, 0)); d.text((480 * k + 14, 12), f'{s[3]}   {s[4]}', fill=(20, 20, 20), font_size=24)
o.save(out); print('wrote', out)
PY
