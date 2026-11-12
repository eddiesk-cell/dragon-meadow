#!/bin/bash
# The lantern-cap's rig step: tools/bestiary/studio-rig.sh <id> rig, but with autorig-py.sh as the autorig's python.
# Run from the repo root on the desk (needs ssh to guru-studio). Then: tools/bestiary/studio-rig.sh lantern-cap clips ...
set -euo pipefail
cd "$(dirname "$0")/../../.."
A=art/bestiary/lantern-cap; R="~/dm-rig/bestiary/lantern-cap"; B=/Applications/Blender.app/Contents/MacOS/Blender
rsync -a $A/markers-fixed.json $A/autorig-py.sh guru-studio:dm-rig/bestiary/lantern-cap/
ssh -4 guru-studio "cd $R && cp ../../hero/{fbx2blend,skel_tex,overlay_draw}.py . &&
  AUTORIG_PY=\$PWD/autorig-py.sh ~/dm-rig/tools/rig/autorig.sh clean.glb rig.fbx --markers markers-fixed.json &&
  $B -b -noaudio -P fbx2blend.py -- rig.fbx rig.blend 2>&1 | grep -E 'Error|Traceback' ;
  $B -b -noaudio -P skel_tex.py -- rig.blend \$PWD/skel.png 2>&1 | grep -E 'Error|Traceback' ;
  ~/dm-rig/venv/bin/python overlay_draw.py \$PWD/skel.png >/dev/null &&
  ~/dm-rig/venv/bin/python -c \"from PIL import Image; im=Image.open('skel.png'); im.resize((im.width*2//5, im.height*2//5)).save('skel-small.png')\" &&
  ~/dm-rig/venv/bin/python -c \"import json; b=json.load(open('skel.png.json'))['bones']; [print('JOINT', n, [round(c, 3) for c in b[n][0]]) for n in ('Hips','Spine2','Neck','Head','LeftArm','LeftForeArm','LeftHand','LeftUpLeg','LeftLeg')]\""
rsync -a guru-studio:dm-rig/bestiary/lantern-cap/rig.markers.png $A/markers.png
rsync -a guru-studio:dm-rig/bestiary/lantern-cap/skel-small.png $A/skeleton.png
rsync -a guru-studio:dm-rig/bestiary/lantern-cap/rig.markers.json $A/markers-auto.json
