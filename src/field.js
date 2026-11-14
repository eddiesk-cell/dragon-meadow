// Lane field — terrain, GPU grass, wildflowers, sea. Contract: PLAN.md §Contract.
// Grass pattern borrowed from wanderlight/src/life/grass.js: blades on lattices that follow the camera,
// identity hashed from the integer world cell, so the field stays nailed down as the tile slides.
import {
  Fn, uniform, uniformArray, attribute, varying, vec2, vec3, vec4, float, int, uint,
  floor, sin, cos, mix, smoothstep, step, saturate, length, normalize, dot, pow, min, max, exp, reflect,
  cameraPosition, cameraViewMatrix, positionWorld, positionLocal, positionViewDirection, normalView, vertexColor, texture,
  mx_fractal_noise_float,
} from 'three/tsl'

const ss = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k) }

// The ground is written twice — JS (ctx.heightAt, terrain mesh) and TSL (grass roots). Keep them in lockstep.
// Rolling ±3 m round the start; climbs to a ~25 m crest by z = −195; cliff lip near z ≈ −222…−242; sea floor −48.
// West of Asterhaven (x < −1440) the crest bends north in coves and falls gently to a lower lip near z ≈ −622: settlements' bay lies at −1.5 out to z −550
// and the north sea at −40, and two water levels need land between them (else the bay's edge hangs over the sea as a shelf).
function heightAt(x, z) {
  const roll = 1.4 * Math.sin(x * 0.031 + 1.3) * Math.sin(z * 0.027 + 0.4) + 0.9 * Math.sin(x * 0.013 - z * 0.019 + 2.1) + 0.45 * Math.sin(x * 0.071 + z * 0.053)
  const bend = ss(-1440, -1660, x + 40 * Math.sin(z * 0.03)), rise = ss(55, 195, -z), e = 222 + 14 * Math.sin(x * 0.011 + 0.7) + 6 * Math.sin(x * 0.037) + 400 * bend
  const land = roll * (1 - 0.5 * rise) + (25 + 3 * Math.sin(x * 0.02)) * rise - 19 * bend * ss(250, 700, -z)
  return land + (-48 - land) * ss(e - 4, e + 14, -z)
}
const rollTSL = (x, z) => sin(x.mul(0.031).add(1.3)).mul(sin(z.mul(0.027).add(0.4))).mul(1.4) // the meadow's ±3 m swell
  .add(sin(x.mul(0.013).sub(z.mul(0.019)).add(2.1)).mul(0.9))
  .add(sin(x.mul(0.071).add(z.mul(0.053))).mul(0.45))
const groundTSL = Fn(([p]) => { // → vec2(height, cliff 0..1)
  const x = p.x, z = p.y
  const roll = rollTSL(x, z)
  const rise = smoothstep(55, 195, z.negate())
  const bend = smoothstep(-1440, -1660, x.add(sin(z.mul(0.03)).mul(40)))
  const e = sin(x.mul(0.011).add(0.7)).mul(14).add(sin(x.mul(0.037)).mul(6)).add(222).add(bend.mul(400))
  const land = roll.mul(rise.mul(-0.5).add(1)).add(sin(x.mul(0.02)).mul(3).add(25).mul(rise)).sub(bend.mul(smoothstep(250, 700, z.negate())).mul(19))
  const cliff = smoothstep(e.sub(4), e.add(14), z.negate())
  return vec2(mix(land, float(-48), cliff), cliff)
})

// uint avalanche hash of an integer cell → [0,1); sin-fract hashes band at large cell indices.
const hash = Fn(([c, salt]) => {
  const h0 = int(c.x).toUint().mul(374761393).bitXor(int(c.y).toUint().mul(668265263)).bitXor(uint(salt).mul(1274126177))
  const h1 = h0.bitXor(h0.shiftRight(13)).mul(1274126177)
  return h1.bitXor(h1.shiftRight(16)).toFloat().mul(1 / 4294967296)
})
const lowNoise = (p, a, b) => sin(p.x.mul(a).add(sin(p.y.mul(b)).mul(2))).mul(sin(p.y.mul(a * 1.2).add(sin(p.x.mul(b * 0.8)).mul(1.5)))).mul(0.5).add(0.5)

export async function createField(ctx) {
  const { THREE, scene, camera } = ctx

  const uTime = uniform(0), uCam = uniform(new THREE.Vector2()), uHero = uniform(new THREE.Vector3()), uSun = uniform(ctx.sunDir)
  const WIND = vec2(0.94, 0.34) // blowing across the view, left → right
  const uNight = uniform(0) // ctx.night, 0 day … 1 night: how much the tips give back the light they drank
  // ctx.aloft, 0 on foot … 1 from 70 m over the ground (the dragon's back): how much the ground wears its look from the air
  const uAloft = uniform(0), aloftAt = c => ss(20, 70, c.y - ctx.heightAt(c.x, c.z))
  // Gallery plinths: grass and flowers skip the keepClear circles bestiary pushes (it loads after field, so they are caught
  // at push time and shown to the blade shader through uClear). shortcut: 16 circles, bestiary only; ring/water/settlement
  // circles keep their own ground patches.
  const uClear = uniformArray(Array.from({ length: 16 }, () => new THREE.Vector4(1e6, 1e6, 0, 0)), 'vec4'), push0 = ctx.keepClear.push
  let nClear = 0
  ctx.keepClear.push = function (...cs) {
    if (new Error().stack.split('\n')[2]?.includes('/bestiary.js')) for (const c of cs) if (nClear < 16) uClear.array[nClear++].set(c.x, c.z, c.r, 0)
    return push0.apply(this, cs)
  }
  ctx.aloft = 0

  // Footstep light rings (Phase 6 world rule: pressure wakes the grass). A pool of RINGS slots (x, z, start time, strength);
  // each spreads to ~3 m over 2.2 s like a ripple: it eases in, its band widens (0.25 → 0.9 m) and dims as it goes, so it
  // never pops on or reads as a drawn line (Eddie: the first rings were "too harsh and not natural"). Spawned on the CPU in
  // update() from ctx.heroPos; the caller breaks it up blade by blade.
  const RINGS = 8, ringSlots = Array.from({ length: RINGS }, () => new THREE.Vector4(0, 0, -99, 0)), uRings = uniformArray(ringSlots, 'vec4')
  const ringGlow = w => {
    let g = float(0)
    for (let i = 0; i < RINGS; i++) {
      const R = uRings.element(i), age = uTime.sub(R.z), v = float(1).sub(saturate(age.div(2.2))) // 1 at the step → 0 at 2.2 s
      const rad = float(1).sub(v.mul(v)).mul(2.8).add(0.2), k = length(w.sub(R.xy)).sub(rad).div(rad.mul(0.24).add(0.2))
      g = g.add(exp(k.mul(k).negate()).mul(smoothstep(0, 0.2, age)).mul(v.mul(v)).mul(R.w))
    }
    return g
  }

  // Walkable ground, as [x0, x1, z0, z1] rects: the terrain square below, plus whatever a module that lays ground beyond
  // it pushes at its create (settlements' far tile), so flora and flyers read one list instead of copying extents by hand.
  const SIDE = 800
  ctx.ground = { rects: [[-SIDE / 2, SIDE / 2, -SIDE / 2, SIDE / 2]] }

  // Ground patches: six HalfFloat textures, each over a rect (x0, z0, size in m), texel = (metres added to the ground,
  // grass height ×, bare chalk 0..1, light ×). Slot 0 is ctx.groundPatch (src/ring.js fills it); ctx.addGroundPatch hands
  // out the rest, callable any time after create (water loads later). Overlaps combine: metres add, grass and light
  // multiply, bare takes the max. Outside its rect a patch changes nothing (a road cut to the border does not run on forever).
  const PN = 256, one = THREE.DataUtils.toHalfFloat(1), fromHalf = THREE.DataUtils.fromHalfFloat
  const makePatch = () => {
    const tex = new THREE.DataTexture(new Uint16Array(PN * PN * 4).map((_, i) => i % 2 ? one : 0), PN, PN, THREE.RGBAFormat, THREE.HalfFloatType)
    tex.magFilter = tex.minFilter = THREE.LinearFilter
    tex.needsUpdate = true
    return { tex, rect: new THREE.Vector3(0, 0, 1), size: PN }
  }
  const patches = Array.from({ length: 6 }, makePatch) // every slot costs a texture fetch per grass vertex
  let used = 1
  ctx.groundPatch = patches[0]
  ctx.addGroundPatch = (x0, z0, sizeM) => {
    // Table full: one clear error naming the caller, and a patch nobody samples, so the caller's create still finishes.
    const full = used === patches.length, p = full ? makePatch() : patches[used++]
    if (full) {
      const who = new Error().stack.split('\n')[2]?.match(/\/(\w+)\.js/)?.[1] ?? 'a module'
      const msg = `field: ground patch table full (${patches.length} slots) — ${who}.js's patch at (${x0}, ${z0}, ${sizeM} m) is not drawn`
      window.__errors.push(msg); console.warn(msg)
    }
    p.rect.set(x0, z0, sizeM)
    return p // { tex, size, rect }: write tex.image.data as ring does, then tex.needsUpdate = true
  }
  const uRects = patches.map(p => uniform(p.rect))
  const patchOne = (k, xz) => { // outside its own rect a patch reads neutral (a mask, not a branch: no If in the grass shader)
    const uv = xz.sub(uRects[k].xy).div(uRects[k].z)
    return mix(vec4(0, 1, 0, 1), texture(patches[k].tex, uv).level(0), step(0, uv.x).mul(step(0, uv.y)).mul(step(uv.x, 1)).mul(step(uv.y, 1)))
  }
  const patchAt = xz => patches.reduce((a, _, k) => { const s = patchOne(k, xz); return vec4(a.x.add(s.x), a.y.mul(s.y), a.z.max(s.z), a.w.mul(s.w)) }, vec4(0, 1, 0, 1))
  // CPU twin of the metres in the added patches, bilinear like the GPU. Slot 0 is left out: ring wraps ctx.heightAt with its own.
  const patchHeight = (x, z) => {
    let h = 0
    for (let k = 1; k < used; k++) {
      const { tex, rect } = patches[k], d = tex.image.data
      if (x < rect.x || z < rect.y || x > rect.x + rect.z || z > rect.y + rect.z) continue
      const u = (x - rect.x) / rect.z * PN - 0.5, v = (z - rect.y) / rect.z * PN - 0.5, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j
      const at = (a, b) => fromHalf(d[(Math.min(PN - 1, Math.max(0, b)) * PN + Math.min(PN - 1, Math.max(0, a))) * 4])
      h += (at(i, j) * (1 - fu) + at(i + 1, j) * fu) * (1 - fv) + (at(i, j + 1) * (1 - fu) + at(i + 1, j + 1) * fu) * fv
    }
    return h
  }
  const ownHeight = (x, z) => heightAt(x, z) + patchHeight(x, z)
  ctx.heightAt = ownHeight
  // ?carvetest=1: field carves a test dip through its own public hook — 20 m patch at (0, −30), −2 m, bare, no grass inside r 6.
  // ?carvetest=N adds N of them, 25 m apart going left, to fill the patch table (N = 6 overflows it: proves the error path).
  for (let n = 0; n < (+ctx.params.get('carvetest') || 0); n++) {
    const p = ctx.addGroundPatch(-10 - 25 * n, -40, 20), d = p.tex.image.data, put = THREE.DataUtils.toHalfFloat
    for (let j = 0; j < PN; j++) for (let i = 0; i < PN; i++) {
      const r = Math.hypot((i + 0.5) / PN * 20 - 10, (j + 0.5) / PN * 20 - 10), k = ss(6, 9.5, r), o = (j * PN + i) * 4
      d[o] = put(-2 * (1 - k)); d[o + 1] = put(k); d[o + 2] = put(1 - ss(5, 8, r))
    }
    p.tex.needsUpdate = true
  }
  // CPU twin of the grass gust below (front / ripple / gust): wind velocity on the ground plane in m/s, ~1 calm → 7 in a gust.
  // Cloth (src/springs.js) reads it so it moves with the grass. Keep in lockstep with the TSL lines.
  ctx.windAt = (x, z, t) => {
    const along = x * 0.94 + z * 0.34, across = -0.34 * x + 0.94 * z
    const front = Math.sin(along * 0.21 - t * 1.5 + Math.sin(across * 0.05 + t * 0.2) * 2.2)
    const ripple = Math.sin(along * 0.55 - t * 3.4 + across * 0.13)
    const v = 1 + 6 * ss(0.1, 1.0, front * 0.7 + ripple * 0.3)
    return new THREE.Vector2(0.94 * v, 0.34 * v)
  }

  const clearD = w => { let d = float(1e6); for (let i = 0; i < 16; i++) { const c = uClear.element(i); d = min(d, length(w.sub(c.xy)).sub(c.z)) } return d }
  // One grass layer: `side`² blades on a `cell` lattice round the camera, alive between fadeIn and fadeOut metres.
  // With `head` it is a flower layer instead: a sparser lattice where a cell holds a thin stem + star head with chance
  // `flowers`, so the 312k plain blades never pay for head vertices.
  function layer({ side, cell, segs, width, fadeIn, fadeOut, flowers = 0, head = 0, salt }) {
    const t = [], s = [], hd = []
    for (let i = 0; i <= segs; i++) t.push(i / segs, i / segs), s.push(-1, 1), hd.push(0, 0)
    // five-point star head: centre + 10 rim points
    if (head) for (let a = -1; a < 10; a++) { const rr = a < 0 ? 0 : a % 2 ? 0.42 : 1, an = a * Math.PI / 5 + Math.PI / 2; s.push(Math.cos(an) * rr), t.push((Math.sin(an) * rr + 1) / 2), hd.push(1) }
    const n = t.length, c0 = n - 11, idx = []
    for (let i = 0; i < segs; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
    if (head) for (let a = 0; a < 10; a++) idx.push(c0, c0 + 1 + a, c0 + 1 + (a + 1) % 10)
    const geo = new THREE.InstancedBufferGeometry() // must be Instanced: plain BufferGeometry ignores instanceCount
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(n * 3).map((_, i) => i % 3 === 1), 3))
    geo.setAttribute('aT', new THREE.Float32BufferAttribute(t, 1))
    geo.setAttribute('aSide', new THREE.Float32BufferAttribute(s, 1))
    geo.setAttribute('aHead', new THREE.Float32BufferAttribute(hd, 1))
    geo.setIndex(idx)
    const off = new Float32Array(side * side * 2)
    for (let j = 0, k = 0; j < side; j++) for (let i = 0; i < side; i++) off[k++] = (i - side / 2) * cell, off[k++] = (j - side / 2) * cell
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 2))
    geo.instanceCount = side * side

    // --- per blade, from its world cell
    const lattice = floor(uCam.div(cell)).mul(cell).add(attribute('aOffset', 'vec2'))
    const ci = floor(lattice.div(cell).add(0.5))
    const r = k => hash(ci, salt + k)
    const world = lattice.add(vec2(r(1), r(2)).sub(0.5).mul(cell))
    const g = groundTSL(world), pt = patchAt(world), ground = g.x.add(pt.x)
    const dist = length(world.sub(uCam))
    const fadeA = fadeIn > 0 ? smoothstep(fadeIn * 0.72, fadeIn, dist) : float(1)
    const keep = fadeA.mul(float(1).sub(smoothstep(fadeOut * 0.75, fadeOut, dist)))
      .mul(smoothstep(-36, -30, ground)).mul(float(1).sub(smoothstep(0.02, 0.2, g.y))) // no grass in the sea or down the cliff
      .mul(step(0, clearD(world))) // not through a gallery plinth
      .mul(uAloft.oneMinus()) // from the dragon's back a blade is under a pixel: the ground carries the meadow (meadowFar)
    const alive = step(r(3), keep)
    const patch = lowNoise(world, 0.11, 0.07), bloom = lowNoise(world.add(57), 0.045, 0.06)
    const under = head ? float(0) : step(r(4), 0.35) // short under-mat closes the gaps between tall crowns
    const fl = head ? step(r(6), bloom.mul(1.4).add(0.2).mul(flowers).mul(pt.y.mul(pt.y))) : float(0) // patchy wildflowers, few on trampled turf
    const H = mix(r(5).mul(0.45).add(0.6).mul(patch.mul(0.4).add(0.75)), r(5).mul(0.2).add(0.25), under)
      .mul(mix(float(1), r(13).mul(0.3).add(0.75), fl)).mul(alive).mul(pt.y).mul(head ? fl : 1) // flower heads sit at mixed depths in the grass; pt.y tramples

    // --- wind: two travelling fronts (not a uniform wobble) + a light per-blade flutter; push away from the hero
    const along = dot(world, WIND), across = dot(world, vec2(-0.34, 0.94))
    const front = sin(along.mul(0.21).sub(uTime.mul(1.5)).add(sin(across.mul(0.05).add(uTime.mul(0.2))).mul(2.2)))
    const ripple = sin(along.mul(0.55).sub(uTime.mul(3.4)).add(across.mul(0.13)))
    const gust = smoothstep(0.1, 1.0, front.mul(0.7).add(ripple.mul(0.3)))
    const flutter = sin(uTime.mul(4.1).add(r(7).mul(6.283))).mul(0.04)
    const yaw = r(8).mul(6.283)
    const toHero = world.sub(uHero.xz), pd = length(toHero)
    const push = float(1).sub(smoothstep(0.15, 0.8, pd)).mul(0.9)
    const lean0 = WIND.mul(gust.mul(0.38).add(0.05).add(flutter)).add(vec2(cos(yaw), sin(yaw)).mul(r(9).mul(0.18)))
      .add(toHero.div(pd.add(0.001)).mul(push))
    const lean = lean0.mul(min(float(1), float(0.9).div(length(lean0).add(1e-4)))) // lean is a fraction of blade length

    const tt = attribute('aT', 'float'), sd = attribute('aSide', 'float'), hh = attribute('aHead', 'float')
    const tc = world.sub(cameraPosition.xz), away = normalize(tc.add(1e-4))
    const camFace = vec2(away.y.negate(), away.x)
    const face = normalize(mix(vec2(sin(yaw), cos(yaw).negate()), camFace, 0.35))
    const tl = lean.mul(tt.mul(tt))
    const halfW = mix(float(1), float(0.12), smoothstep(0.6, 1, tt)).mul(mix(float(1), float(0.35), fl)).mul(width / 2)
    const stem = vec3(world.x.add(tl.x.mul(H)).add(face.x.mul(sd).mul(halfW)),
      ground.add(tt.sub(length(tl).mul(0.45)).mul(H)),
      world.y.add(tl.y.mul(H)).add(face.y.mul(sd).mul(halfW)))
    const hs = fl.mul(alive).mul(head)
    const tip = vec3(world.x.add(lean.x.mul(H)), ground.add(float(1).sub(length(lean).mul(0.45)).mul(H)), world.y.add(lean.y.mul(H)))
    // the star faces up and leans toward the camera, so it reads as a flower from the walking view, not a flat card
    const hy = tt.mul(2).sub(1).mul(hs)
    const headPos = tip.add(vec3(camFace.x.mul(sd).mul(hs).add(away.x.mul(hy).mul(0.8)), hy.mul(0.6), camFace.y.mul(sd).mul(hs).add(away.y.mul(hy).mul(0.8))))

    // --- colour, per vertex: dark teal root → jade or fresh yellow-green blade (in broad drifts) → pale gold tip
    const drift = lowNoise(world.add(31), 0.06, 0.04)
    // by day fresh spring green to the tips, as mix-day.png (hue ~70°, bright; gold tips read as straw), with a little blue
    // so the tone curve keeps some shading in it; by night the darker teal-jade the glow is tuned on (night.png)
    const tipCol = mix(mix(vec3(0.50, 0.55, 0.12), vec3(0.37, 0.53, 0.11), r(10).mul(patch)), mix(vec3(0.36, 0.33, 0.07), vec3(0.27, 0.34, 0.08), r(10).mul(patch)), uNight)
    const bodyCol = mix(mix(vec3(0.05, 0.19, 0.07), vec3(0.12, 0.29, 0.06), smoothstep(0.3, 0.75, drift)), mix(vec3(0.012, 0.09, 0.06), vec3(0.045, 0.15, 0.025), smoothstep(0.3, 0.75, drift)), uNight)
    const grassCol = mix(vec3(0.012, 0.045, 0.04), mix(bodyCol, tipCol, smoothstep(0.62, 1, tt)), smoothstep(0, 0.5, tt).max(smoothstep(15, 60, dist)))
      .mul(r(11).mul(0.3).add(0.85)).mul(lowNoise(world.add(13), 0.035, 0.05).mul(0.35).add(0.8)).mul(pt.w) // broad darker / lighter patches
    // small star flowers: mostly pale (white, blush pink, lilac), some warm gold and poppy red as in mix-day.png; gold heart
    const r12 = r(12)
    const petal = mix(mix(mix(vec3(0.86, 0.86, 0.8), vec3(0.92, 0.62, 0.7), step(0.45, r12)), vec3(0.72, 0.66, 0.92), step(0.62, r12)),
      mix(vec3(0.92, 0.66, 0.08), vec3(0.85, 0.16, 0.05), step(0.87, r12)), step(0.72, r12))
    const flowerCol = mix(petal, vec3(0.9, 0.55, 0.06), float(1).sub(step(0.01, length(vec2(sd, tt.mul(2).sub(1))))))
    const back = pow(saturate(dot(normalize(stem.sub(cameraPosition)), uSun)), 2).mul(tt.mul(tt)).mul(float(1).sub(hh))

    // --- glow: by day a gold sheen through the tips against the sun; by night the tips give back the day's light (teal → cyan),
    // a soft pool wakes round the hero's feet, and each footstep sends a ring of light out through the grass
    const tipW = smoothstep(0.45, 1, tt), sparkle = r(14)
    const nightTip = mix(vec3(0.03, 0.5, 0.4), vec3(0.25, 1.0, 0.9), sparkle).mul(tipW.mul(tipW).mul(pow(sparkle, 4).mul(1.3).add(0.1)))
    // rings and the pool only reach the near layers (a ring lives ≤ 2 s, so it never leaves the first 18 m)
    const wake = fadeIn ? float(0) : ringGlow(world).mul(sparkle.mul(1.1).add(0.25)).add(float(1).sub(smoothstep(0.3, 2.2, pd)).mul(0.3).mul(uNight)).mul(tt.mul(tt)) // light runs along the tips
    const wakeCol = mix(vec3(0.75, 0.68, 0.35), vec3(0.25, 1.0, 0.8), uNight)
    const glow = mix(
      vec3(1, 0.8, 0.38).mul(back).mul(sparkle.mul(0.3).add(0.12)).mul(float(1).sub(uNight)).add(nightTip.mul(uNight).mul(0.55)).add(wakeCol.mul(wake)),
      flowerCol.mul(uNight.mul(0.35)).add(wakeCol.mul(wake).mul(0.5)), hh)

    const m = new THREE.MeshLambertNodeMaterial({ side: THREE.DoubleSide })
    m.positionNode = mix(stem, headPos, hh)
    m.colorNode = varying(mix(grassCol, flowerCol, hh))
    // Up-ish normal tipped by the lean: the grass lights like the ground it covers, and gust fronts read as light waves.
    m.normalNode = normalize(cameraViewMatrix.mul(vec4(varying(normalize(vec3(lean.x.mul(tt).mul(0.7), 1, lean.y.mul(tt).mul(0.7)))), 0)).xyz)
    m.emissiveNode = varying(glow)
    const mesh = new THREE.Mesh(geo, m)
    mesh.frustumCulled = false
    mesh.receiveShadow = true
    return mesh
  }

  const layers = [
    layer({ side: 400, cell: 0.09, segs: 5, width: 0.028, fadeIn: 0, fadeOut: 18, salt: 0 }),
    layer({ side: 320, cell: 0.2, segs: 3, width: 0.07, fadeIn: 18, fadeOut: 32, salt: 100 }),
    layer({ side: 224, cell: 0.7, segs: 2, width: 0.15, fadeIn: 32, fadeOut: 80, salt: 200 }),
  ]
  const flowerLayers = [
    layer({ side: 92, cell: 0.4, segs: 3, width: 0.028, fadeIn: 0, fadeOut: 18, flowers: 0.55, head: 0.036, salt: 300 }),
    layer({ side: 110, cell: 0.6, segs: 2, width: 0.05, fadeIn: 18, fadeOut: 32, flowers: 0.6, head: 0.06, salt: 400 }),
    layer({ side: 104, cell: 1.6, segs: 1, width: 0.1, fadeIn: 32, fadeOut: 80, flowers: 0.35, head: 0.11, salt: 500 }),
  ]
  ctx.grass = { blades: new THREE.Group().add(...layers), flowers: new THREE.Group().add(...flowerLayers) } // e.g. water hides both for its mirror pass
  scene.add(ctx.grass.blades, ctx.grass.flowers)
  const grassMeshes = [...layers, ...flowerLayers]

  // --- the meadow from the air. Up there a blade is smaller than a pixel, so the ground under the blades must carry the
  // field's own look: the grass's jade / yellow-green drifts and broad light-dark patches (same noise as the blades), flower
  // drifts as colour, darker hollows, slopes that catch the sun or fall into shade, and wide warm and cool meadows.
  // Colours are the blades' own hues pulled greener (seen from above the gold tips no longer stack up into olive).
  const meadowFar = xz => {
    const dist = length(xz.sub(cameraPosition.xz)), fine = smoothstep(700, 200, dist), speckW = smoothstep(320, 140, dist)
    const wide = lowNoise(xz.add(97), 0.008, 0.006), drift = lowNoise(xz.add(31), 0.06, 0.04), patch = lowNoise(xz, 0.11, 0.07)
    const bloom = smoothstep(0.5, 0.9, lowNoise(xz.add(57), 0.045, 0.06)) // the blades' own flower drifts
    // the blades' colour as it reads from afar (mostly their tips), day and night, so no line shows where the blades end
    const jade = mix(vec3(0.1, 0.25, 0.07), vec3(0.045, 0.14, 0.05), uNight), fresh = mix(vec3(0.18, 0.31, 0.06), vec3(0.08, 0.19, 0.02), uNight)
    const gold = mix(vec3(0.29, 0.35, 0.08), vec3(0.15, 0.22, 0.03), uNight)
    const tuft = mx_fractal_noise_float(vec3(xz.mul(0.13), 0), 2, 2, 0.5).mul(fine) // 4–10 m tufts and clumps, gone before they alias
    const col = mix(mix(jade, fresh, smoothstep(0.2, 0.8, drift.mul(0.6).add(wide.mul(0.4)))), gold, smoothstep(0.55, 0.95, patch).mul(wide.mul(0.3).add(0.1)))
      .mul(tuft.mul(0.3).add(1))
      .mul(mix(float(0.7), float(1.08), smoothstep(-2.5, 2, rollTSL(xz.x, xz.y)))) // hollows darker, crowns catch the light
    // Flowers: within a drift, a head every few metres (white, gold, poppy, blush, as on foot) — dots from the air, a warm
    // tint once they are smaller than a pixel.
    const cell = floor(xz.div(2.6)), h = hash(cell, 700), at = vec2(hash(cell, 701), hash(cell, 702)).mul(1.8).add(0.4)
    const head = smoothstep(0.42, 0.26, length(xz.div(2.6).sub(cell).mul(2.6).sub(at))).mul(step(h, bloom.mul(0.55).add(0.04)))
    const hp = hash(cell, 703)
    const petal = mix(mix(vec3(0.8, 0.78, 0.68), vec3(0.85, 0.55, 0.05), step(0.4, hp)), mix(vec3(0.75, 0.16, 0.04), vec3(0.85, 0.45, 0.55), step(0.85, hp)), step(0.7, hp))
    const flowers = mix(mix(col, vec3(0.3, 0.25, 0.05), bloom.mul(0.25).mul(speckW.oneMinus())), petal, head.mul(speckW))
    const swell = p => lowNoise(p, 0.045, 0.03).mul(4).add(lowNoise(p.add(71), 0.1, 0.075).mul(1.5)) // a fake swell, metres
    const g = vec2(swell(xz.add(vec2(1.5, 0))).sub(swell(xz.sub(vec2(1.5, 0)))), swell(xz.add(vec2(0, 1.5))).sub(swell(xz.sub(vec2(0, 1.5))))).div(3)
    // the sun's share of the light (~3/4 by day) follows the swell's slope: Lambert relative to flat ground, 1 − g·L.xz / L.y
    const lit = mix(float(1), min(max(float(1).sub(dot(g, uSun.xz).div(max(uSun.y, 0.15)).mul(0.3)), 0), 1.5), smoothstep(-0.05, 0.1, uSun.y))
    return flowers.mul(lit.mul(0.75).add(0.25))
  }
  // Meadow ground from the terrain's vertex colour (grass green, or rock on steep faces: b/g 0.33 vs 0.86), grass × and bare.
  // w = 0 is the look on foot, unchanged; w = 1 the look from the air. Past the blades (they end at 80 m) the ground takes
  // the look from the air on foot too: bare terrain there read as a dark grey band across the distance.
  const groundColor = (vc, grass, bare, w) => {
    const d = length(positionWorld.xz.sub(cameraPosition.xz))
    const near = mix(float(0.45), float(1), smoothstep(6, 45, d)) // shade under the near grass
    const air = mix(meadowFar(positionWorld.xz).mul(grass.mul(0.15).add(0.85)), vc.mul(vc), saturate(vc.b.div(vc.g.add(1e-4)).sub(0.4).div(0.45)))
    return mix(mix(vc.mul(vc).mul(mix(float(1), near, grass)), air, max(w, smoothstep(50, 90, d))), vec3(0.46, 0.45, 0.4), bare)
  }
  // Other ground tiles (settlements' far tile and city) colour themselves with ctx.groundColor (and light with ctx.groundNormal)
  // so they match from the air.
  // Until one does, field's own ground fades back to the look on foot within 160 m of their rects (no colour seam).
  let shared = 0
  ctx.groundColor = (vc, grass, bare) => (shared++, groundColor(vc, grass, bare, uAloft))
  const uFade = uniform(0), uOther = uniformArray(Array.from({ length: 4 }, () => new THREE.Vector4(1e6, 1e6, 1e6, 1e6)), 'vec4')
  const airW = xz => {
    let k = float(1)
    for (let i = 0; i < 4; i++) {
      const R = uOther.element(i)
      k = min(k, smoothstep(0, 160, max(max(R.x.sub(xz.x), xz.x.sub(R.y)), max(R.z.sub(xz.y), xz.y.sub(R.w)))))
    }
    return uAloft.mul(mix(float(1), k, uFade))
  }

  // --- terrain: one mesh from heightAt; meadow green, rock on the cliff, darker under the near grass
  const tg = new THREE.PlaneGeometry(SIDE, SIDE, SIDE / 2, SIDE / 2).rotateX(-Math.PI / 2)
  const p = tg.attributes.position
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)))
  tg.computeVertexNormals()
  const c = new THREE.Color(), rock = new THREE.Color(0.3, 0.28, 0.24)
  const colourGround = g => { // vertex colour: meadow green, rock where steep, dark sea floor
    const p = g.attributes.position, n = g.attributes.normal, col = new Float32Array(p.count * 3)
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), v = 0.85 + 0.3 * (0.5 + 0.5 * Math.sin(x * 0.05 + Math.sin(z * 0.04) * 2) * Math.sin(z * 0.06))
      c.setRGB(0.2 * v, 0.27 * v, 0.09 * v).lerp(rock, ss(0.85, 0.6, n.getY(i)))
      if (p.getY(i) < -39) c.setRGB(0.16, 0.18, 0.17)
      c.toArray(col, i * 3)
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  }
  colourGround(tg)
  const tm = new THREE.MeshLambertNodeMaterial() // colour comes in colorNode as vc² (vertexColors: true squared it before; look kept)
  const tp = patchAt(positionWorld.xz)
  const dh = patches.reduce((a, _, k) => { // slope of the patch metres, each patch at its own texel step
    const e = uRects[k].z.div(PN), ph = o => patchOne(k, positionWorld.xz.add(o)).x
    return a.add(vec2(ph(vec2(e, 0)).sub(ph(vec2(e.negate(), 0))), ph(vec2(0, e)).sub(ph(vec2(0, e.negate())))).div(e.mul(2)))
  }, vec2(0, 0))
  const n0 = attribute('normal', 'vec3') // terrain sits at the origin: local = world
  tm.positionNode = positionLocal.add(vec3(0, patchAt(positionLocal.xz).x, 0))
  // From the air a meadow is a canopy of standing blades, not a lawn: its blades face a low sun and catch it, so the shading
  // normal leans toward the sun (by airW; on foot the real blades do this). Golden hour lights the land instead of dimming it.
  const canopy = (n, w) => normalize(cameraViewMatrix.mul(vec4(normalize(n).add(vec3(uSun.x, 0, uSun.z).mul(w.mul(0.5))), 0)).xyz)
  ctx.groundNormal = n => canopy(n, uAloft) // world normal → normalNode, for the tiles that use ctx.groundColor (same light from the air)
  tm.normalNode = canopy(vec3(n0.x.div(n0.y).sub(dh.x), 1, n0.z.div(n0.y).sub(dh.y)), airW(positionWorld.xz))
  tm.colorNode = groundColor(vertexColor().rgb, tp.y, tp.z, airW(positionWorld.xz)).mul(tp.w)
  const terrain = new THREE.Mesh(tg, tm)
  terrain.receiveShadow = true
  scene.add(terrain)

  // --- far land: the meadow runs on past the 800 m square into the haze in every direction (the sea fills the north), so
  // no end of the world shows from the air. Built on the first frame, once every module has shaped ctx.heightAt (settlements'
  // headland, Asterhaven's hill and coast). Under another module's ground tile (ctx.ground.rects) it lies sunk — 2 m by the
  // square, 6 m by 2.5 km, more than the depth buffer's step out there — so that tile always wins without z-fighting;
  // everywhere else it IS the ground, at its true height, so a sea that ends on it ends at a shore, never over a sunken
  // shelf. A skirt closes any step at the square's edge. Not walkable ground: flora never plants on it.
  const farMat = new THREE.MeshLambertNodeMaterial({ side: THREE.DoubleSide }) // double: the skirt is seen from outside
  farMat.colorNode = groundColor(vertexColor().rgb, float(1), float(0), airW(positionWorld.xz))
  farMat.normalNode = canopy(attribute('normal', 'vec3'), airW(positionWorld.xz)) // far land sits at the origin too
  function buildFar() {
    // the lower of field's own ground and the final ctx.heightAt: under the city's coast and the town's stream bed, and sea
    // (so skipped) under Crestwatch's headland, whose cliffs a coarse grid would otherwise cut through
    const H = (x, z) => Math.min(ownHeight(x, z), ctx.heightAt(x, z))
    const others = ctx.ground.rects.slice(1)
    // Sunk strictly inside a tile; its edges are grid lines (below), so the step down lies under the tile, never as a groove
    // in the open land beside it. An edge on the square's own boundary sinks too (only the square's terrain lies beyond it).
    const onSq = (x, z) => Math.abs(Math.abs(z) - SIDE / 2) < 0.5 && Math.abs(x) <= SIDE / 2 || Math.abs(Math.abs(x) - SIDE / 2) < 0.5 && Math.abs(z) <= SIDE / 2
    const under = (x, z) => { const m = onSq(x, z) ? -0.5 : 1; return others.some(([x0, x1, z0, z1]) => x > x0 + m && x < x1 - m && z > z0 + m && z < z1 - m) }
    const R = 3000, out = [], sink = (x, z) => under(x, z) ? 2 + 4 * ss(500, 2500, Math.hypot(x, z)) : 0
    // 20 m cells out to 1.6 km, so a coast (Asterhaven's drops 18 m in 60 m) reads as a shore, not a straight facet; ~150 m at the haze
    for (let v = SIDE / 2; v < R; v += 20 + Math.max(0, v - 1600) * 0.1) out.push(v)
    out.push(R)
    const ax = [...new Set([...out.map(v => -v), ...Array.from({ length: SIDE / 20 - 1 }, (_, i) => 20 - SIDE / 2 + 20 * i), ...out, ...others.flat()])]
      .filter(v => Math.abs(v) <= R).sort((a, b) => a - b), n = ax.length
    const pos = new Float32Array(n * n * 3), hs = new Float32Array(n * n), idx = []
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = ax[i], z = ax[j], k = j * n + i
      hs[k] = H(x, z); pos.set([x, hs[k] - sink(x, z), z], k * 3)
    }
    const inside = (a, b) => a >= -SIDE / 2 && b <= SIDE / 2
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1
      if (inside(ax[i], ax[i + 1]) && inside(ax[j], ax[j + 1])) continue // the field's own terrain
      if (Math.max(hs[a], hs[b], hs[c], hs[d]) < -38) continue // all under the sea
      idx.push(a, c, b, b, c, d)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    // skirt round the square: from the terrain's own edge (2 m steps, 5 cm proud) straight down below the far land
    const sp = [], si = [], sn = [], E = SIDE / 2
    const edge = [[-E, -E, 1, 0], [E, -E, 0, 1], [E, E, -1, 0], [-E, E, 0, -1]]
    for (const [x0, z0, dx, dz] of edge) for (let s = 0; s < SIDE; s += 2) {
      const x = x0 + dx * s, z = z0 + dz * s, x1 = x + dx * 2, z1 = z + dz * 2, h0 = H(x, z), h1 = H(x1, z1)
      if (Math.max(h0, h1) < -38) continue
      const o = sp.length / 3
      sp.push(x, h0 + 0.05, z, x1, h1 + 0.05, z1, x, h0 - sink(x, z) - 1, z, x1, h1 - sink(x1, z1) - 1, z1)
      sn.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0)
      si.push(o, o + 2, o + 1, o + 1, o + 2, o + 3)
    }
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3))
    sg.setAttribute('normal', new THREE.Float32BufferAttribute(sn, 3))
    sg.setIndex(si)
    for (const geo of [g, sg]) colourGround(geo), scene.add(new THREE.Mesh(geo, farMat))
    farTris = (idx.length + si.length) / 3
    // fade toward other modules' ground tiles until they colour themselves with ctx.groundColor
    others.slice(0, 4).forEach((r, i) => uOther.array[i].set(...r))
    uFade.value = shared ? 0 : 1
  }
  let farTris = 0

  // --- sea, far below the cliff: deep teal looking down, the sky in it toward the horizon (so it meets the haze softly), and
  // the sun's glitter as a gold path broken by small swells (its own term, not a GGX lobe, so it never burns white)
  const seaMat = new THREE.MeshLambertNodeMaterial()
  seaMat.colorNode = vec3(0.02, 0.085, 0.13)
  const sw = positionWorld.xz, V = normalize(cameraPosition.sub(positionWorld))
  const calm = smoothstep(900, 200, length(positionWorld.sub(cameraPosition))) // swells under a pixel alias: far off the glitter is one soft gold lane
  const wave = (a, b, f, t) => sin(sw.x.mul(a).add(sw.y.mul(b)).add(uTime.mul(t))).mul(f).mul(calm)
  const N = normalize(vec3(wave(0.21, 0.13, 0.05, 1.1).add(wave(0.67, -0.43, 0.035, -1.9)), 1, wave(-0.17, 0.29, 0.05, 1.3).add(wave(0.49, 0.71, 0.035, 2.3))))
  const glint = pow(max(dot(reflect(V.negate(), N), uSun), 0), mix(float(14), float(90), calm)).mul(mix(float(0.3), float(1), calm))
    .mul(smoothstep(-0.02, 0.08, uSun.y)).mul(float(1).sub(uNight))
  seaMat.emissiveNode = uniform(ctx.fogColor).mul(vec3(0.62, 0.8, 1)).mul(pow(float(1).sub(saturate(dot(normalView, positionViewDirection))), 5).mul(0.5).add(0.04)) // the bluer sky above the haze band
    .add(vec3(1.1, 0.72, 0.32).mul(glint.mul(0.9)))
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 3000).rotateX(-Math.PI / 2), seaMat)
  sea.position.set(0, -40, -1650)
  scene.add(sea)

  const blades = layers.reduce((a, l) => a + l.geometry.instanceCount, 0)
  const r2 = v => Math.round(v * 100) / 100
  const flowerCells = flowerLayers.reduce((a, l) => a + l.geometry.instanceCount, 0)
  window.__probes.field = () => ({ blades, flowerCells, h0: r2(heightAt(0, 0)), crest: r2(heightAt(0, -200)), sea: r2(heightAt(0, -320)),
    patches: used, ground: ctx.ground.rects, carve: r2(ctx.heightAt(0, -30)),
    night: r2(uNight.value), rings: ringSlots.filter(s => uTime.value - s.z < 2).length, stepRings,
    aloft: r2(uAloft.value), farTris, groundColorUsers: shared, fadeNearTiles: uFade.value })

  // A ring for every ~0.8 m walked (a footfall), a brighter one on landing, and at night a slow pulse while standing.
  const last = new THREE.Vector3(NaN, 0, 0)
  let slot = 0, walked = 0, still = 0, air = false, stepRings = 0
  const spawn = (t, amp) => { ringSlots[slot].set(ctx.heroPos.x, ctx.heroPos.z, t, amp); slot = (slot + 1) % RINGS; stepRings++ }
  function steps(dt, t) {
    const h = ctx.heroPos, d = Math.hypot(h.x - last.x, h.z - last.z), amp = 0.35 + 0.65 * ctx.night
    const up = h.y - ctx.heightAt(h.x, h.z) > 0.15
    if (!(d < 3)) walked = 0 // first frame or a teleport: no trail of rings across the map
    else if ((walked += d) >= 0.8) walked = still = 0, spawn(t, amp)
    if (air && !up) spawn(t, amp * 1.6), still = 0
    if (d < 0.3 * dt && !up && (still += dt) > 2.4) still = 0, ctx.night > 0.1 && spawn(t, 0.6 * ctx.night)
    air = up
    last.copy(h)
  }

  // Proof view: ?fieldcam=x,y,z,lookX,lookY,lookZ pins the main camera after every lane has moved it.
  const pin = ctx.params.get('fieldcam')?.split(',').map(Number)
  if (pin?.length === 6) scene.onBeforeRender = (r, s, c) => {
    if (c !== camera) return
    c.position.set(pin[0], pin[1], pin[2]); c.lookAt(pin[3], pin[4], pin[5]); c.updateMatrixWorld()
    uCam.value.set(pin[0], pin[2])
    ctx.aloft = uAloft.value = aloftAt(c.position) // sky reads it next frame
  }

  let built = false
  return {
    update(dt, t) {
      if (!built) built = true, buildFar()
      if (!pin) ctx.aloft = uAloft.value = aloftAt(camera.position) // last frame's camera: hero and ride move it after this
      uTime.value = t
      uNight.value = ctx.night
      uCam.value.set(camera.position.x, camera.position.z)
      uHero.value.copy(ctx.heroPos)
      for (const m of grassMeshes) m.visible = uAloft.value < 0.999 // gone, not just thinned to nothing, so flight pays no vertex cost
      steps(dt, t)
    },
  }
}
