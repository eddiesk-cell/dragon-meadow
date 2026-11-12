#!/bin/bash
# The Marrowkeeper end to end from its paid mesh, run from the desk (the work runs on the Mac Studio through
# tools/bestiary/studio-rig.sh): prep -> rig the paid mesh on hand-placed joints (its weights say what is arm) ->
# LONG arms (long_arms.py: only the bone shafts stretch) -> rig again on the long-armed mesh, hips and knees on the bony leg
# (fix_legs.py) -> the entry's 10 clips -> ground every clip on its feet -> idle, feet and legs (side, coat cut away) check
# renders -> public/models/bestiary/marrowkeeper.glb -> clips.png (every clip of the shipped glb).
# Offsets: the arms swing out 14 deg so the long hands hang clear of the legs; the hands twist 70 deg so the claws
# point forward instead of into the knees; the feet pitch down 14/12.5 deg because the borrowed Idle lifts the toes by
# that much (the heel sank, the front claws were in the air).
#   art/bestiary/marrowkeeper/build.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."
A=art/bestiary/marrowkeeper; R=dm-rig/bestiary/marrowkeeper; B=/Applications/Blender.app/Contents/MacOS/Blender
ssh -4 guru-studio "mkdir -p $R"
rsync -a $A/hunyuan.glb tools/hero/prep.py $A/long_arms.py $A/clips_render.py guru-studio:$R/
ssh -4 guru-studio "cd $R && $B -b -noaudio -P prep.py -- hunyuan.glb clean-orig.glb 60000 2>&1 | grep -E '^PREP|Error' &&
  cp clean-orig.glb clean.glb"
tools/bestiary/studio-rig.sh marrowkeeper rig $A/markers-short.json | grep -E 'note|SCALE'
ssh -4 guru-studio "cd $R && cp rig.blend rig-short.blend &&
  $B -b -noaudio -P long_arms.py -- clean-orig.glb rig-short.blend \$PWD/clean.glb 0.25 2>&1 | grep -E 'LONGARMS|Error|Traceback'"
# The final rig is studio-rig.sh's rig step with fix_legs.py as the autorig's python: core put the hips and knees 13-15 cm
# back in the cape (the biggest island at knee height), fix_legs moves them onto the bony leg and core skins there.
rsync -a $A/markers-fixed.json $A/fix_legs.py guru-studio:$R/
ssh -4 guru-studio "cd $R && PATH=~/dm-rig/venv/bin:\$PATH AUTORIG_PY=\$PWD/fix_legs.py ~/dm-rig/tools/rig/autorig.sh clean.glb rig.fbx --markers markers-fixed.json | grep -E 'note|AUTORIG wrote' &&
  $B -b -noaudio -P fbx2blend.py -- rig.fbx rig.blend 2>&1 | grep -E 'Error|Traceback' ;
  $B -b -noaudio -P skel_tex.py -- rig.blend \$PWD/skel.png 2>&1 | grep -E 'Error|Traceback' ;
  ~/dm-rig/venv/bin/python overlay_draw.py \$PWD/skel.png >/dev/null &&
  ~/dm-rig/venv/bin/python -c \"from PIL import Image; im=Image.open('skel.png'); im.resize((im.width*2//5, im.height*2//5)).save('skel-small.png')\""
rsync -a guru-studio:$R/rig.markers.png $A/markers.png; rsync -a guru-studio:$R/skel-small.png $A/skeleton.png
rsync -a guru-studio:$R/rig.markers.json $A/markers-auto.json
tools/bestiary/studio-rig.sh marrowkeeper clips Idle Walk Run Summon "Slash (Diagonal)" Throw "AoE Ground Slam" \
  "Hit (Front)" Stagger "Death (Collapse)" -- leftUpperArm=Y,-14 rightUpperArm=Y,14 leftHand=X,-70 rightHand=X,-70 leftFoot=X,14 rightFoot=X,12.5 | tail -1
# The clips move the hips by hip height alone, so with these legs Idle sank and the stances floated: ground.py lifts each
# clip so its lowest foot point meets the floor (after the offsets, which move the heel), then Idle and the feet are
# re-rendered and the glb re-shipped.
rsync -a $A/ground.py $A/feet_render.py $A/legs_render.py guru-studio:$R/
ssh -4 guru-studio "cd $R && $B -b -noaudio -P ground.py -- full.glb full.glb 2>&1 | grep -E '^GROUND|Error|Traceback|Assert' &&
  $B -b -noaudio -P legs_render.py -- full.glb legs.json \$PWD/legs.png 2>&1 | grep -E '^LEGS|Error|Traceback' ;
  ~/dm-rig/venv/bin/python legs_render.py --sheet \$PWD/legs.png &&
  $B -b -noaudio -P idle_render.py -- full.glb \$PWD/idle 2>&1 | grep -E 'Error|Traceback' ;
  ~/dm-rig/venv/bin/python -c \"from PIL import Image; a,b=Image.open('idle.front.png'),Image.open('idle.side.png'); o=Image.new('RGB',(1800,900)); o.paste(a,(0,0)); o.paste(b,(900,0)); o.save('idle.png')\" &&
  $B -b -noaudio -P feet_render.py -- full.glb \$PWD/feet.png 2>&1 | grep -E 'Error|Traceback' ;
  ~/dm-rig/venv/bin/python feet_render.py --sheet \$PWD/feet.png"
rsync -a guru-studio:$R/idle.png guru-studio:$R/feet.png guru-studio:$R/legs.png guru-studio:$R/full.glb $A/
$HOME/.local/homebrew/bin/python3.12 tools/hero/slim.py $A/full.glb public/models/bestiary/marrowkeeper.glb | tail -1
rsync -a public/models/bestiary/marrowkeeper.glb guru-studio:$R/ship.glb   # the sheet shows what ships (slimmed)
ssh -4 guru-studio "cd $R && rm -f clips.png*; $B -b -noaudio -P clips_render.py -- ship.glb \$PWD/clips.png 2>&1 | grep -E 'CLIPS|Error|Traceback';
  ~/dm-rig/venv/bin/python clips_render.py --sheet \$PWD/clips.png"
rsync -a guru-studio:$R/clips.png $A/clips.png
