#!/bin/bash
# Rig one generated creature on the Mac Studio (the desk is too loaded): weld/clean → house autorig → skeleton drawn
# over the textured body → clips → slim. Run FROM THE DESK:
#   tools/bestiary/studio-rig.sh <id> rig  [markers.json]   → art/bestiary/<id>/{markers,skeleton}.png to LOOK at
#   tools/bestiary/studio-rig.sh <id> clips "Idle" "Walk" … [-- pose offsets like leftUpperArm=Y,-20]
#                                                            → public/models/bestiary/<id>.glb + art/bestiary/<id>/idle.png
# The Studio side lives in ~/dm-rig (autorig copy + numpy/scipy/pillow venv); see PLAN.md Phase 4c.
set -euo pipefail
cd "$(dirname "$0")/../.."
ID=$1; STEP=$2; shift 2
R="~/dm-rig/bestiary/$ID"; A=art/bestiary/$ID
ssh -4 guru-studio "mkdir -p $R"
B=/Applications/Blender.app/Contents/MacOS/Blender
if [ "$STEP" = rig ]; then
  MARK=${1:-}
  rsync -a $A/hunyuan.glb tools/hero/prep.py guru-studio:dm-rig/bestiary/$ID/
  [ -n "$MARK" ] && rsync -a "$MARK" guru-studio:dm-rig/bestiary/$ID/markers-fixed.json
  ssh -4 guru-studio "cd $R && cp ../../hero/{fbx2blend,skel_tex,overlay_draw}.py . &&
    { [ -f clean.glb ] || $B -b -noaudio -P prep.py -- hunyuan.glb clean.glb 60000 2>&1 | grep -E '^PREP|Error|Assert'; } &&
    AUTORIG_PY=~/dm-rig/venv/bin/python ~/dm-rig/tools/rig/autorig.sh clean.glb rig.fbx ${MARK:+--markers markers-fixed.json} &&
    $B -b -noaudio -P fbx2blend.py -- rig.fbx rig.blend 2>&1 | grep -E 'Error|Traceback' ;
    $B -b -noaudio -P skel_tex.py -- rig.blend \$PWD/skel.png 2>&1 | grep -E 'Error|Traceback' ;
    ~/dm-rig/venv/bin/python overlay_draw.py \$PWD/skel.png >/dev/null &&
    ~/dm-rig/venv/bin/python -c \"from PIL import Image; im=Image.open('skel.png'); im.resize((im.width*2//5, im.height*2//5)).save('skel-small.png')\" &&
    cat skel.png.json | ~/dm-rig/venv/bin/python -c \"import json,sys; j=json.load(sys.stdin); print('SCALE', {k:j[k] for k in ('W','H','S','cx','cz')})\""
  rsync -a guru-studio:dm-rig/bestiary/$ID/rig.markers.png $A/markers.png
  rsync -a guru-studio:dm-rig/bestiary/$ID/skel-small.png $A/skeleton.png
  rsync -a guru-studio:dm-rig/bestiary/$ID/rig.markers.json $A/markers-auto.json
elif [ "$STEP" = clips ]; then
  CLIPS=(); OFFS=()
  while [ $# -gt 0 ] && [ "$1" != -- ]; do CLIPS+=("$1"); shift; done
  [ "${1:-}" = -- ] && shift && OFFS=("$@")
  rsync -a tools/monster/pose_offset.py tools/bestiary/idle_render.py guru-studio:dm-rig/bestiary/$ID/
  printf '%q ' "${CLIPS[@]}" > /tmp/clips-$ID.txt; scp -q /tmp/clips-$ID.txt guru-studio:dm-rig/bestiary/$ID/clips.txt
  ssh -4 guru-studio "cd $R && $B -b -noaudio -P ~/dm-rig/tools/rig/kimodo_glb.py -- rig.fbx vrm.glb 2>&1 | grep -E 'Error|Traceback' ;
    eval \"$B -b -noaudio -P ../../hero/retarget.py -- vrm.glb ../../hero/drifter-v2-textured-51clips.glb full.glb \$(cat clips.txt)\" 2>&1 | grep -E 'Error|Traceback|wrote' &&
    ${OFFS:+$B -b -noaudio -P pose_offset.py -- full.glb full.glb ${OFFS[*]} 2>&1 | grep -E 'wrote|Error|Traceback|Assert' &&} true &&
    $B -b -noaudio -P idle_render.py -- full.glb \$PWD/idle 2>&1 | grep -E 'Error|Traceback' ;
    ~/dm-rig/venv/bin/python -c \"from PIL import Image; a,b=Image.open('idle.front.png'),Image.open('idle.side.png'); o=Image.new('RGB',(1800,900)); o.paste(a,(0,0)); o.paste(b,(900,0)); o.save('idle.png')\""
  rsync -a guru-studio:dm-rig/bestiary/$ID/idle.png $A/idle.png
  mkdir -p public/models/bestiary
  rsync -a guru-studio:dm-rig/bestiary/$ID/full.glb $A/full.glb
  $HOME/.local/homebrew/bin/python3.12 tools/hero/slim.py $A/full.glb public/models/bestiary/$ID.glb | tail -1
fi
