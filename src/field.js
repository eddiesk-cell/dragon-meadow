// Lane field — terrain, GPU grass, wildflowers, sea. Contract: PLAN.md §Contract.
// Grass pattern borrowed from wanderlight/src/life/grass.js: blades on lattices that follow the camera,
// identity hashed from the integer world cell, so the field stays nailed down as the tile slides.
import {
  Fn, uniform, attribute, varying, vec2, vec3, vec4, float, int, uint,
  floor, sin, cos, mix, smoothstep, step, saturate, length, normalize, dot, pow, min,
  cameraPosition, cameraViewMatrix, positionWorld, vertexColor,
} from 'three/tsl'

const ss = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k) }

// The ground is written twice — JS (ctx.heightAt, terrain mesh) and TSL (grass roots). Keep them in lockstep.
// Rolling ±3 m round the start; climbs to a ~25 m crest by z = −195; cliff lip near z ≈ −222…−242; sea floor −48.
function heightAt(x, z) {
  const roll = 1.4 * Math.sin(x * 0.031 + 1.3) * Math.sin(z * 0.027 + 0.4) + 0.9 * Math.sin(x * 0.013 - z * 0.019 + 2.1) + 0.45 * Math.sin(x * 0.071 + z * 0.053)
  const rise = ss(55, 195, -z), e = 222 + 14 * Math.sin(x * 0.011 + 0.7) + 6 * Math.sin(x * 0.037)
  const land = roll * (1 - 0.5 * rise) + (25 + 3 * Math.sin(x * 0.02)) * rise
  return land + (-48 - land) * ss(e - 4, e + 14, -z)
}
const groundTSL = Fn(([p]) => { // → vec2(height, cliff 0..1)
  const x = p.x, z = p.y
  const roll = sin(x.mul(0.031).add(1.3)).mul(sin(z.mul(0.027).add(0.4))).mul(1.4)
    .add(sin(x.mul(0.013).sub(z.mul(0.019)).add(2.1)).mul(0.9))
    .add(sin(x.mul(0.071).add(z.mul(0.053))).mul(0.45))
  const rise = smoothstep(55, 195, z.negate())
  const e = sin(x.mul(0.011).add(0.7)).mul(14).add(sin(x.mul(0.037)).mul(6)).add(222)
  const land = roll.mul(rise.mul(-0.5).add(1)).add(sin(x.mul(0.02)).mul(3).add(25).mul(rise))
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
  ctx.heightAt = heightAt

  const uTime = uniform(0), uCam = uniform(new THREE.Vector2()), uHero = uniform(new THREE.Vector3()), uSun = uniform(ctx.sunDir)
  const WIND = vec2(0.94, 0.34) // blowing across the view, left → right
  // CPU twin of the grass gust below (front / ripple / gust): wind velocity on the ground plane in m/s, ~1 calm → 7 in a gust.
  // Cloth (src/springs.js) reads it so it moves with the grass. Keep in lockstep with the TSL lines.
  ctx.windAt = (x, z, t) => {
    const along = x * 0.94 + z * 0.34, across = -0.34 * x + 0.94 * z
    const front = Math.sin(along * 0.21 - t * 1.5 + Math.sin(across * 0.05 + t * 0.2) * 2.2)
    const ripple = Math.sin(along * 0.55 - t * 3.4 + across * 0.13)
    const v = 1 + 6 * ss(0.1, 1.0, front * 0.7 + ripple * 0.3)
    return new THREE.Vector2(0.94 * v, 0.34 * v)
  }

  // One grass layer: `side`² blades on a `cell` lattice round the camera, alive between fadeIn and fadeOut metres.
  function layer({ side, cell, segs, width, fadeIn, fadeOut, flowers, head, salt }) {
    const t = [], s = [], hd = []
    for (let i = 0; i <= segs; i++) t.push(i / segs, i / segs), s.push(-1, 1), hd.push(0, 0)
    for (let a = 0; a < 6; a++) s.push(Math.cos(a * Math.PI / 3)), t.push((Math.sin(a * Math.PI / 3) + 1) / 2), hd.push(1) // hexagon flower head; collapses to nothing on plain blades
    const n = t.length, idx = []
    for (let i = 0; i < segs; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
    for (let a = 1; a < 5; a++) idx.push(n - 6, n - 6 + a, n - 5 + a)
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
    const g = groundTSL(world), ground = g.x
    const dist = length(world.sub(uCam))
    const fadeA = fadeIn > 0 ? smoothstep(fadeIn * 0.72, fadeIn, dist) : float(1)
    const keep = fadeA.mul(float(1).sub(smoothstep(fadeOut * 0.75, fadeOut, dist)))
      .mul(smoothstep(-36, -30, ground)).mul(float(1).sub(smoothstep(0.02, 0.2, g.y))) // no grass in the sea or down the cliff
    const alive = step(r(3), keep)
    const patch = lowNoise(world, 0.11, 0.07), bloom = lowNoise(world.add(57), 0.045, 0.06)
    const under = step(r(4), 0.35) // short under-mat closes the gaps between tall crowns
    const fl = step(r(6), bloom.mul(1.4).add(0.2).mul(flowers)).mul(float(1).sub(under)) // patchy wildflowers
    const H = mix(r(5).mul(0.45).add(0.6).mul(patch.mul(0.4).add(0.75)), r(5).mul(0.2).add(0.25), under)
      .mul(mix(float(1), r(13).mul(0.3).add(0.75), fl)).mul(alive) // flower heads sit at mixed depths in the grass

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
    const tc = world.sub(cameraPosition.xz)
    const camFace = normalize(vec2(tc.y.negate(), tc.x).add(1e-4))
    const face = normalize(mix(vec2(sin(yaw), cos(yaw).negate()), camFace, 0.35))
    const tl = lean.mul(tt.mul(tt))
    const halfW = mix(float(1), float(0.12), smoothstep(0.6, 1, tt)).mul(mix(float(1), float(0.35), fl)).mul(width / 2)
    const stem = vec3(world.x.add(tl.x.mul(H)).add(face.x.mul(sd).mul(halfW)),
      ground.add(tt.sub(length(tl).mul(0.45)).mul(H)),
      world.y.add(tl.y.mul(H)).add(face.y.mul(sd).mul(halfW)))
    const hs = fl.mul(alive).mul(head)
    const tip = vec3(world.x.add(lean.x.mul(H)), ground.add(float(1).sub(length(lean).mul(0.45)).mul(H)), world.y.add(lean.y.mul(H)))
    const headPos = tip.add(vec3(camFace.x.mul(sd).mul(hs), tt.mul(2).sub(1).mul(hs), camFace.y.mul(sd).mul(hs)))

    // --- colour, worked out per vertex: dark root → muted green → lighter yellow-green tip; flowers white / yellow / orange-red
    const tipCol = mix(vec3(0.42, 0.45, 0.15), vec3(0.5, 0.45, 0.2), r(10).mul(patch).mul(0.7))
    const grassCol = mix(vec3(0.03, 0.06, 0.05), mix(vec3(0.15, 0.21, 0.075), tipCol, smoothstep(0.35, 1, tt)), smoothstep(0, 0.5, tt).max(smoothstep(15, 60, dist)))
      .mul(r(11).mul(0.3).add(0.85)).mul(lowNoise(world.add(13), 0.035, 0.05).mul(0.35).add(0.8)) // broad darker / lighter patches
    const r12 = r(12)
    const flowerCol = mix(mix(vec3(0.82, 0.82, 0.76), vec3(0.88, 0.62, 0.1), step(0.6, r12)), vec3(0.8, 0.22, 0.06), step(0.8, r12))
    const back = pow(saturate(dot(normalize(stem.sub(cameraPosition)), uSun)), 3).mul(pow(tt, 1.5)).mul(float(1).sub(hh))

    const m = new THREE.MeshLambertNodeMaterial({ side: THREE.DoubleSide })
    m.positionNode = mix(stem, headPos, hh)
    m.colorNode = varying(mix(grassCol, flowerCol, hh))
    // Up-ish normal tipped by the lean: the grass lights like the ground it covers, and gust fronts read as light waves.
    m.normalNode = normalize(cameraViewMatrix.mul(vec4(varying(normalize(vec3(lean.x.mul(tt).mul(0.7), 1, lean.y.mul(tt).mul(0.7)))), 0)).xyz)
    m.emissiveNode = varying(tipCol.mul(back).mul(0.35)) // light through the thin tips when looking toward the sun
    const mesh = new THREE.Mesh(geo, m)
    mesh.frustumCulled = false
    mesh.receiveShadow = true
    scene.add(mesh)
    return mesh
  }

  const layers = [
    layer({ side: 400, cell: 0.09, segs: 5, width: 0.028, fadeIn: 0, fadeOut: 18, flowers: 0.035, head: 0.024, salt: 0 }),
    layer({ side: 320, cell: 0.2, segs: 3, width: 0.07, fadeIn: 18, fadeOut: 32, flowers: 0.05, head: 0.04, salt: 100 }),
    layer({ side: 224, cell: 0.7, segs: 2, width: 0.15, fadeIn: 32, fadeOut: 80, flowers: 0.07, head: 0.075, salt: 200 }),
  ]

  // --- terrain: one mesh from heightAt; meadow green, rock on the cliff, darker under the near grass
  const tg = new THREE.PlaneGeometry(800, 800, 400, 400).rotateX(-Math.PI / 2)
  const p = tg.attributes.position
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)))
  tg.computeVertexNormals()
  const nrm = tg.attributes.normal, col = new Float32Array(p.count * 3), c = new THREE.Color(), rock = new THREE.Color(0.3, 0.28, 0.24)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), v = 0.85 + 0.3 * (0.5 + 0.5 * Math.sin(x * 0.05 + Math.sin(z * 0.04) * 2) * Math.sin(z * 0.06))
    c.setRGB(0.2 * v, 0.27 * v, 0.09 * v).lerp(rock, ss(0.85, 0.6, nrm.getY(i)))
    if (p.getY(i) < -39) c.setRGB(0.16, 0.18, 0.17)
    c.toArray(col, i * 3)
  }
  tg.setAttribute('color', new THREE.BufferAttribute(col, 3))
  const tm = new THREE.MeshLambertNodeMaterial({ vertexColors: true })
  tm.colorNode = vertexColor().mul(mix(float(0.45), float(1), smoothstep(6, 45, length(positionWorld.xz.sub(cameraPosition.xz)))))
  const terrain = new THREE.Mesh(tg, tm)
  terrain.receiveShadow = true
  scene.add(terrain)

  // --- sea, far below the cliff
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 3000).rotateX(-Math.PI / 2), new THREE.MeshStandardNodeMaterial({ color: 0x3f6378, roughness: 0.35 }))
  sea.position.set(0, -40, -1650)
  scene.add(sea)

  const blades = layers.reduce((a, l) => a + l.geometry.instanceCount, 0)
  const r2 = v => Math.round(v * 100) / 100
  window.__probes.field = () => ({ blades, h0: r2(heightAt(0, 0)), crest: r2(heightAt(0, -200)), sea: r2(heightAt(0, -320)) })

  // Proof view: ?fieldcam=x,y,z,lookX,lookY,lookZ pins the main camera after every lane has moved it.
  const pin = ctx.params.get('fieldcam')?.split(',').map(Number)
  if (pin?.length === 6) scene.onBeforeRender = (r, s, c) => {
    if (c !== camera) return
    c.position.set(pin[0], pin[1], pin[2]); c.lookAt(pin[3], pin[4], pin[5]); c.updateMatrixWorld()
    uCam.value.set(pin[0], pin[2])
  }

  return {
    update(dt, t) {
      uTime.value = t
      uCam.value.set(camera.position.x, camera.position.z)
      uHero.value.copy(ctx.heroPos)
    },
  }
}
