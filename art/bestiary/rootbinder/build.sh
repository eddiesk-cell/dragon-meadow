#!/bin/bash
# The Rootbinder end to end from its paid mesh, run from the desk (the work runs on the Mac Studio): prep -> rig the paid
# mesh on hand-placed joints (its weights say what is arm) -> LONG arms (long_arms.py, +0.5 m each: the hanging hands reach
# the shins, BESTIARY "its arms reach the ground") -> rig again on the long-armed mesh -> the entry's 9 clips -> every clip
# stood on its feet (ground.py; the stances floated up to 15 cm) -> idle check render -> public/models/bestiary/rootbinder.glb
# -> clips.png (every clip of the shipped glb) and the worst bark stretch per clip (stretch.py).
# Both rigs run core.py through autorig-py.sh (torso centre fixed, no garment pass).
# Offsets: the long arms swing out 12 deg so the hands hang clear of the legs; neck and head nod 6 + 8 deg (the borrowed
# Idle looks up); the feet tip down 14 + 12.5 deg (the borrowed clips lift the toes, measured 14.2 / 12.2 deg by feet.py). clips_render.py and ground.py are copies of marrowkeeper's.
#   art/bestiary/rootbinder/build.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."
A=art/bestiary/rootbinder; R=dm-rig/bestiary/rootbinder; B=/Applications/Blender.app/Contents/MacOS/Blender
rig() {   # studio-rig.sh's rig step, on markers file $1, with autorig-py.sh as the autorig's python
  rsync -a "$1" guru-studio:$R/markers-fixed.json
  ssh -4 guru-studio "cd $R && AUTORIG_PY=\$PWD/autorig-py.sh ~/dm-rig/tools/rig/autorig.sh clean.glb rig.fbx --markers markers-fixed.json | grep -E 'shim|note|AUTORIG wrote' &&
    $B -b -noaudio -P fbx2blend.py -- rig.fbx rig.blend 2>&1 | grep -E 'Error|Traceback' ;
    $B -b -noaudio -P skel_tex.py -- rig.blend \$PWD/skel.png 2>&1 | grep -E 'Error|Traceback' ;
    ~/dm-rig/venv/bin/python overlay_draw.py \$PWD/skel.png >/dev/null &&
    ~/dm-rig/venv/bin/python -c \"from PIL import Image; im=Image.open('skel.png'); im.resize((im.width*2//5, im.height*2//5)).save('skel-small.png')\""
}
ssh -4 guru-studio "mkdir -p $R"
rsync -a $A/hunyuan.glb tools/hero/prep.py $A/autorig-py.sh $A/long_arms.py $A/ground.py $A/clips_render.py $A/stretch.py $A/feet.py guru-studio:$R/
ssh -4 guru-studio "cd $R && cp ../../hero/{fbx2blend,skel_tex,overlay_draw}.py . &&
  $B -b -noaudio -P prep.py -- hunyuan.glb clean-orig.glb 60000 2>&1 | grep -E '^PREP|Error' && cp clean-orig.glb clean.glb"
rig $A/markers-short.json
ssh -4 guru-studio "cd $R && cp rig.blend rig-short.blend &&
  $B -b -noaudio -P long_arms.py -- clean-orig.glb rig-short.blend \$PWD/clean.glb 0.5 2>&1 | grep -E 'LONGARMS|Error|Traceback'"
rig $A/markers-fixed.json
rsync -a guru-studio:$R/rig.markers.png $A/markers.png; rsync -a guru-studio:$R/skel-small.png $A/skeleton.png
rsync -a guru-studio:$R/rig.markers.json $A/markers-auto.json
tools/bestiary/studio-rig.sh rootbinder clips Idle Walk Summon "Slash (Horizontal)" Stab Block "Hit (Front)" Stagger \
  "Death (Collapse)" -- leftUpperArm=Y,-12 rightUpperArm=Y,12 neck=X,6 head=X,8 leftFoot=X,14 rightFoot=X,12.5 | tail -1
ssh -4 guru-studio "cd $R && $B -b -noaudio -P ground.py -- full.glb full.glb 2>&1 | grep -E '^GROUND|Error|Traceback|Assert' &&
  $B -b -noaudio -P idle_render.py -- full.glb \$PWD/idle 2>&1 | grep -E 'Error|Traceback' ;
  ~/dm-rig/venv/bin/python -c \"from PIL import Image; a,b=Image.open('idle.front.png'),Image.open('idle.side.png'); o=Image.new('RGB',(1800,900)); o.paste(a,(0,0)); o.paste(b,(900,0)); o.save('idle.png')\""
rsync -a guru-studio:$R/idle.png guru-studio:$R/full.glb $A/
$HOME/.local/homebrew/bin/python3.12 tools/hero/slim.py $A/full.glb public/models/bestiary/rootbinder.glb | tail -1
rsync -a public/models/bestiary/rootbinder.glb guru-studio:$R/ship.glb   # the sheet shows what ships (slimmed)
ssh -4 guru-studio "cd $R && rm -f clips.png*; $B -b -noaudio -P clips_render.py -- ship.glb \$PWD/clips.png 2>&1 | grep -E 'CLIPS|Error|Traceback';
  ~/dm-rig/venv/bin/python clips_render.py --sheet \$PWD/clips.png &&
  $B -b -noaudio -P stretch.py -- ship.glb 2>&1 | grep -E 'STRETCH|Error|Traceback';
  $B -b -noaudio -P feet.py -- ship.glb Idle 2>&1 | grep -E '^FEET Idle|Error|Traceback'"
rsync -a guru-studio:$R/clips.png $A/clips.png
