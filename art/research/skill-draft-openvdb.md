---
name: blender-volume-bake
description: Use when Dragon Meadow needs smoke, fire, mist or cloud that is too rich to hand-write in TSL. Simulates in headless Blender (which bundles OpenVDB), then bakes to a flipbook atlas (default) or a small 3D texture (one cloud/mist volume), and plays it in Three.js WebGPU. Do NOT ship .vdb files to the browser; do NOT use for sparks, hits, dust, splashes (keep those in TSL).
---

# Blender volume bake (OpenVDB inside Blender)

Facts (checked 2026-11-14): OpenVDB 14.0.0 (Apache-2.0, 2026-10-29) is a C++ library; Blender 5.1.2 here bundles it
(`Resources/lib/libopenvdb.dylib`, python module `openvdb` .so in its site-packages, Python 3.13).
No system `pip` openvdb. No browser VDB/NanoVDB path was found in a primary source: treat VDB as an offline format.

## Choose the output
1. Flipbook atlas (default): render the sim from the camera angle the game uses, 8x8 frames of 128px = 1024x1024,
   RGBA, WebP ~0.3-1 MB. Runtime = one billboard quad, sample atlas by frame. Cheapest frame time.
2. 3D texture (static or slow cloud/mist only): density grid 64^3 R8 = 262 KB raw, 128^3 = 2 MB raw (compress it).
   Runtime = raymarch in TSL over a `Data3DTexture`, 32-64 steps; full-screen cost is real, keep the box small.
3. Animated 3D volume: skip; 128^3 x 60 frames is ~120 MB raw.

## Steps
1. Write `art/<name>/bake.py` run as `blender -b --python art/<name>/bake.py` (same style as existing art/*.py).
2. Quick smoke/fire domain, set cache to OPENVDB, bake, frame range fixed (e.g. 1-64).
3. Atlas: render each frame (Eevee or Workbench volume shading, transparent film), tile with Python (PIL/ffmpeg), write WebP.
4. 3D texture: in the same script `import openvdb`, read grid `density`, `grid.copyToArray(arr)`, resample to 64^3, write raw `.bin`.
5. Load in `src/vfx.js` (atlas: texture + TSL frame index from time; 3D: `Data3DTexture`, `RedFormat`, linear filter).
6. Log file sizes and measure frame time with the effect on and off in the real page (shot.mjs); do not guess.

## Gotchas
- Blender crashes at start inside the Claude sandbox here (USD assumptions error); run it with the sandbox off or in the user terminal.
- Import of `openvdb` was not run-verified; confirm with one print before building on it.
- WebGPU: sample 3D textures with a linear sampler, no `texture3D` mipmaps needed; premultiply atlas alpha.
- Loop the atlas: make frame 64 blend into frame 1, or the fire visibly pops.
- Keep sims deterministic (fixed seed) so rebuilds do not change the look.
