// Lane ring — the Old Ring: a chalk bowl carved into the meadow, a barrow mound, eleven standing stones, pooled mist.
// Contract: PLAN.md Phase 3 (ctx.ring) and WORLD.md "The first monster". Ground shape, trampled grass, bare chalk and
// contact shade go to the field through ctx.groundPatch (one texture the grass and terrain read).
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  vertexColor, positionLocal, positionWorld, positionView, uniform, vec2, vec3, float, smoothstep, length, mx_fractal_noise_float,
  viewportDepthTexture, perspectiveDepthToViewZ, cameraNear, cameraFar, cameraPosition, select, exp, abs, max, min, sqrt, dot, mix,
  attribute, mx_noise_float, sin, uv,
} from 'three/tsl'

const ss = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k) }
const lerp = (a, b, k) => a + (b - a) * k
const hash3 = (x, y, z) => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
function noise3(x, y, z) { // value noise, [0,1)
  const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), u = x - X, v = y - Y, w = z - Z
  const a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v), c = w * w * (3 - 2 * w)
  const l = (i, j, k) => hash3(X + i, Y + j, Z + k)
  return lerp(lerp(lerp(l(0, 0, 0), l(1, 0, 0), a), lerp(l(0, 1, 0), l(1, 1, 0), a), b),
    lerp(lerp(l(0, 0, 1), l(1, 0, 1), a), lerp(l(0, 1, 1), l(1, 1, 1), a), b), c)
}
const fbm = (x, y, z, o = 4) => { let s = 0, a = 0.5; for (let i = 0; i < o; i++, a *= 0.5) s += a * noise3(x, y, z), x *= 2.03, y *= 2.03, z *= 2.03; return s / (1 - a * 2 + a) }
let seed = 7
const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296

// One weathered sarsen: a rounded slab (superellipsoid) tapered to an uneven crown, broken by fracture planes (flat
// chipped faces with crisp, softly shaded edges), then lumped and grained by noise. Coloured grey with pale lichen crust,
// gold lichen specks, chalk splash and damp moss at the foot, dark in the pits. Local origin at the bottom centre, metres.
function stoneGeo(THREE, w, h, t) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 22).deleteAttribute('normal').deleteAttribute('uv'))
  const p = g.attributes.position, col = new Float32Array(p.count * 3), o = rand() * 500
  const slant = (rand() - 0.5) * 0.6, E = 0.45 + rand() * 0.2, pw = v => Math.sign(v) * Math.abs(v) ** E
  const taper = 0.05 + rand() * 0.25, crown = 0.12 + rand() * 0.25, bend = (rand() - 0.5) * 0.5, twist = (rand() - 0.5) * 0.6, ph = rand() * 6
  const cuts = Array.from({ length: 13 }, () => { // random fracture planes: the convex shape left between them is the rock
    const n = new THREE.Vector3(rand() - 0.5, rand() * 0.8 - 0.3, rand() - 0.5).normalize()
    return { n, o: (0.62 + rand() * 0.26 + Math.max(0, n.y) * 0.25) * Math.hypot(n.x * w, n.y * h, n.z * t) / 2 } // tops lose less
  })
  const q = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), y01 = (pw(y) + 1) / 2
    const k = (1 - taper * y01 - crown * ss(0.8, 1, y01) ** 2) * (1 + 0.1 * Math.sin(y01 * 4.5 + ph)) // tapers, bulges, rounds over at the crown
    const tw = twist * y01, ax = pw(x) * w / 2 * k, az = pw(z) * t / 2 * k * (1 - 0.12 * y01)
    q.set(ax * Math.cos(tw) - az * Math.sin(tw) + bend * y01 * y01, y01 * h, ax * Math.sin(tw) + az * Math.cos(tw))
    q.y += slant * q.x * ss(0.55, 1, y01)
    q.y -= h / 2
    for (const c of cuts) { const s = q.dot(c.n) - c.o; if (s > 0) q.addScaledVector(c.n, -s) }
    q.y += h / 2
    const X = q.x, Y = q.y, Z = q.z
    const n1 = fbm(X * 0.45 + o, Y * 0.4, Z * 0.45, 3), n2 = fbm(X * 2.4 + o, Y * 2.4, Z * 2.4, 3), n3 = noise3(X * 9 + o, Y * 9, Z * 9)
    const d = (n1 - 0.5) * 0.24 + (n2 - 0.5) * 0.07 + (n3 - 0.5) * 0.02 - 0.05 * ss(0.64, 0.8, n2) // lumps, grain, pits
    const sz = 0.6 + 0.4 * (w + t) / 2
    p.setXYZ(i, X + x * d * sz, Y + y * d * 0.5 * sz, Z + z * d * sz)
    // colour (linear): grey sarsen mottled → pale lichen crust → gold specks → chalk splash and damp moss at the foot → dark pits
    const lich = ss(0.48, 0.64, fbm(X * 1.3 + o, Y * 1.3, Z * 1.3 + 9, 3)) * ss(0.2, 1.2, Y), gold = ss(0.74, 0.8, noise3(X * 4 + o, Y * 4, Z * 4)) * 0.7
    const m = 0.78 + 0.4 * n2, streak = 0.86 + 0.2 * noise3(X * 6 + o, Y * 0.45, Z * 6)
    const mix3 = (c, to, a) => { c[0] = lerp(c[0], to[0], a); c[1] = lerp(c[1], to[1], a); c[2] = lerp(c[2], to[2], a) }
    const c = [0.29 * m, 0.285 * m, 0.26 * m]
    mix3(c, [0.48, 0.49, 0.43], lich * 0.75)
    mix3(c, [0.5, 0.4, 0.17], gold)
    mix3(c, [0.52, 0.5, 0.44], ss(0.7, 0.15, Y) * ss(0.45, 0.65, n1) * 0.7)
    mix3(c, [0.08, 0.11, 0.04], ss(0.45, 0.05, Y) * ss(0.35, 0.55, n2) * 0.7)
    const shade = streak * (0.55 + 0.45 * ss(-0.07, 0.04, d))
    col[i * 3] = c[0] * shade; col[i * 3 + 1] = c[1] * shade; col[i * 3 + 2] = c[2] * shade
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.computeVertexNormals()
  return g
}

export async function createRing(ctx) {
  const { THREE, scene, camera, params } = ctx
  const C = new THREE.Vector3(325, 0, 180), RF = 19, RR = 33, LIP = 0.7, MR = 11, MH = 3.4, DEPTH = 4
  const base = ctx.heightAt
  let rim = 0
  for (let a = 0; a < 48; a++) rim += base(C.x + RR * Math.cos(a / 48 * 6.283), C.z + RR * Math.sin(a / 48 * 6.283)) / 48
  const floorY = rim - DEPTH
  C.y = floorY
  const D = new THREE.Vector2(-C.x, -C.z).normalize() // the barrow door faces the way the hero comes in from the start
  const doorR = 9.6, door = new THREE.Vector2(C.x + D.x * doorR, C.z + D.y * doorR)

  // A scar of bare chalk where the troll ripped its club out of the ring (slot 7 is empty).
  const slot = k => Math.atan2(D.y, D.x) + (k + 0.5) * Math.PI / 6
  const scar = new THREE.Vector2(C.x + 22 * Math.cos(slot(7)), C.z + 22 * Math.sin(slot(7)))
  // Height offset added to the field's ground: level floor + mound inside, blended out at the rim, a low lip, the scar pit.
  const mound = d => MH * (1 - ss(2.5, MR, d))
  const behind = (x, z) => { const a = (x - door.x) * D.x + (z - door.y) * D.y + 2.6, b = -(x - door.x) * D.y + (z - door.y) * D.x; return 1.4 * Math.exp(-((a / 1.5) ** 2) - (b / 2.1) ** 2) } // turf over the capstone
  const off = (x, z) => {
    const dx = x - C.x, dz = z - C.z, d = Math.hypot(dx, dz)
    if (d > RR + 9) return 0
    const pit = -0.35 * (1 - ss(0.3, 1.5, Math.hypot(x - scar.x, z - scar.y)))
    return (floorY + mound(d) + behind(x, z) - base(x, z)) * (1 - ss(RF, RR, d)) + LIP * Math.exp(-(((d - RR - 1) / 2.5) ** 2)) + pit
  }
  ctx.heightAt = (x, z) => base(x, z) + off(x, z)

  // --- stones: twelve slots on a 22 m ring (door gap between slots 11 and 0), slot 7 empty, three fallen
  // Phase 6 (ring-night.png): moss creeps up from the turf (per-vertex 'moss', see mossify); thin veins run through it,
  // soft green by day, glowing cyan-green at night (the world rule: plants give back the day's light), pulsing slowly upward.
  const uT = uniform(0), uNight = uniform(0)
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 }) // vertex colour via colorNode (vertexColors: true would square it)
  const P = positionLocal, moss = attribute('moss', 'float')
  const n1 = mx_noise_float(P.mul(1.3)), n2 = mx_noise_float(P.mul(3.7).add(11))
  const line = (n, w) => float(1).sub(smoothstep(w * 0.3, w, abs(n)))
  const vein = max(line(n1, 0.05), line(n2, 0.035).mul(0.6)).mul(smoothstep(0.2, 0.7, moss))
  mat.colorNode = mix(vertexColor(), vec3(0.07, 0.14, 0.04), moss.mul(0.8)).mul(mx_fractal_noise_float(P.mul(7), 3).mul(0.22).add(1)) // fine grain close up
    .add(vec3(0.05, 0.09, 0.02).mul(vein))
  const pulse = sin(uT.mul(0.9).sub(P.y.mul(1.7)).add(n1.mul(4))).mul(0.3).add(0.85)
  mat.emissiveNode = mix(vec3(0.1, 1, 0.75), vec3(0.35, 1, 0.35), n2.mul(0.5).add(0.5)).mul(vein.mul(2.2).mul(pulse).add(moss.mul(0.05))).mul(uNight)
  const foot = [] // footprints for the ground patch: { c: Vector2, u: Vector2, a, b }
  const stones = [], group = new THREE.Group()
  const place = (geo, x, z, yaw, opts = {}) => {
    const m = new THREE.Mesh(geo, mat)
    m.castShadow = m.receiveShadow = true
    m.position.set(x, 0, z)
    m.rotation.set(opts.tilt || 0, yaw, opts.lean || 0, 'YXZ')
    group.add(m)
    return m
  }
  // Per-vertex moss in world space (after placing): climbs up to ~2.4 m from the turf in tongues, and caps up-facing tops.
  const mossify = m => {
    m.updateMatrixWorld(true)
    const p = m.geometry.attributes.position, nr = m.geometry.attributes.normal, a = new Float32Array(p.count), v = new THREE.Vector3(), n = new THREE.Vector3()
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); n.fromBufferAttribute(nr, i).transformDirection(m.matrixWorld)
      const f = fbm(v.x * 0.9, v.y * 0.9, v.z * 0.9, 3)
      a[i] = Math.max(ss(2.4, 0.2, v.y - ctx.heightAt(v.x, v.z) + (f - 0.5) * 3.2), ss(0.5, 0.85, n.y) * ss(0.45, 0.6, f))
    }
    m.geometry.setAttribute('moss', new THREE.BufferAttribute(a, 1))
  }
  const FALLEN = new Set([2, 5, 9])
  for (let k = 0; k < 12; k++) {
    if (k === 7) continue
    const th = slot(k) + (rand() - 0.5) * 0.12, r = 22 + (rand() - 0.5) * 1.6
    const x = C.x + r * Math.cos(th), z = C.z + r * Math.sin(th)
    const tangent = new THREE.Vector2(-Math.sin(th), Math.cos(th))
    const fallen = FALLEN.has(k)
    const h = fallen ? 3.2 + rand() * 1.2 : 3.0 + rand() * 1.5, w = 1.2 + rand() * 0.8, t = fallen ? 1 + rand() * 0.3 : 0.7 + rand() * 0.4
    const geo = stoneGeo(THREE, w, h, t)
    if (!fallen) {
      // broad face to the centre, leaning a few degrees; sunk 0.45 m below the lowest ground under its foot
      const yaw = -th + Math.PI / 2 + (rand() - 0.5) * 0.3
      const m = place(geo, x, z, yaw, { lean: (rand() - 0.5) * 0.16, tilt: (rand() - 0.5) * 0.12 })
      let gy = Infinity
      for (const [a, b] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) gy = Math.min(gy, ctx.heightAt(x + tangent.x * a * w / 2 + Math.cos(th) * b * t / 2, z + tangent.y * a * w / 2 + Math.sin(th) * b * t / 2))
      m.position.y = gy - 0.45
      foot.push({ c: new THREE.Vector2(x, z), u: new THREE.Vector2(Math.cos(-yaw), Math.sin(-yaw)), a: w / 2, b: t / 2 })
      stones.push({ pos: new THREE.Vector3(x, gy, z), radius: Math.max(w, t) / 2 + 0.15, height: h - 0.45, fallen: false, mesh: m })
    } else {
      // toppled in or out of the ring: lying on its broad face, half sunk
      const yaw = -th + (rand() - 0.5) * 0.9
      geo.translate(0, -h / 2, 0)
      const m = place(geo, x, z, yaw, { lean: Math.PI / 2 + (rand() - 0.5) * 0.1, tilt: Math.PI / 2 })
      m.position.y = ctx.heightAt(x, z) + t * 0.12 // a little over half its bulk below the turf
      const u = new THREE.Vector2(Math.cos(-yaw), Math.sin(-yaw))
      foot.push({ c: new THREE.Vector2(x, z), u, a: h / 2, b: w / 2 })
      stones.push({ pos: new THREE.Vector3(x, ctx.heightAt(x, z), z), radius: h / 2, height: t * 0.55, fallen: true, mesh: m })
    }
  }

  // --- the barrow's portal: two side slabs and a capstone at the mound's foot, a dark doorway between them
  const Dn = new THREE.Vector2(-D.y, D.x), doorY = ctx.heightAt(door.x, door.y), dyaw = Math.atan2(D.x, D.y)
  for (const s of [-1, 1]) { // side slabs run back into the mound
    const g = stoneGeo(THREE, 2.6, 2.3, 0.55)
    const x = door.x + Dn.x * s * 1.15 - D.x * 1.1, z = door.y + Dn.y * s * 1.15 - D.y * 1.1
    const m = place(g, x, z, dyaw + Math.PI / 2 + s * 0.06)
    m.position.y = Math.min(doorY, ctx.heightAt(x, z)) - 0.35
    foot.push({ c: new THREE.Vector2(x, z), u: D.clone(), a: 1.3, b: 0.3 })
  }
  for (const s of [-1, 1]) { // facade stones flank the door, turned out a little: a shallow forecourt
    const g = stoneGeo(THREE, 1.7, 2.7, 0.7)
    const x = door.x + Dn.x * s * 2.5 + D.x * 0.3, z = door.y + Dn.y * s * 2.5 + D.y * 0.3
    place(g, x, z, dyaw + s * 0.35).position.y = ctx.heightAt(x, z) - 0.4
    foot.push({ c: new THREE.Vector2(x, z), u: Dn.clone(), a: 0.85, b: 0.35 })
  }
  const cap = stoneGeo(THREE, 3.4, 0.6, 2.9)
  cap.translate(0, -0.3, 0)
  place(cap, door.x - D.x * 1.1, door.y - D.y * 1.1, dyaw + 0.04, { tilt: 0.05 }).position.y = doorY + 2.05
  // The doorway: black by day, at night gold lamplight from deep inside, brightest low and centred, with a lantern flicker.
  const uDoor = uniform(0), hm = new THREE.MeshBasicNodeMaterial()
  const core = smoothstep(0.8, 0, length(uv().sub(vec2(0.5, 0.15)).mul(vec2(1.3, 0.8))))
  hm.colorNode = mix(vec3(0.0035, 0.004, 0.0035), vec3(1, 0.55, 0.16).mul(core.mul(2.4).add(0.12)), uDoor)
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 2.3), hm)
  hole.position.set(door.x - D.x * 0.25, doorY + 0.85, door.y - D.y * 0.25)
  hole.rotation.y = dyaw
  group.add(hole)
  const doorLight = new THREE.PointLight(0xffa040, 0, 14, 2) // spills out over the forecourt and the portal stones
  doorLight.position.set(door.x + D.x * 0.8, doorY + 1, door.y + D.y * 0.8)
  const bowlLight = new THREE.PointLight(0x40ffc8, 0, 34, 1.2) // the glowing mist lights the stones' inner faces and the fighters
  bowlLight.position.set(C.x, floorY + 1.5, C.z)
  group.add(doorLight, bowlLight)
  for (const m of group.children) if (m.material === mat) mossify(m)
  scene.add(group)
  ctx.keepClear.push({ x: C.x, z: C.z, r: RR + 2 })

  // --- ground patch: 80 m square round the centre → field grass + terrain (ctx.groundPatch, src/field.js)
  const gp = ctx.groundPatch, N = gp.size, S = 80, x0 = C.x - S / 2, z0 = C.z - S / 2, cell = S / N
  const sdf = (f, x, z) => {
    const px = x - f.c.x, pz = z - f.c.y, qa = Math.abs(px * f.u.x + pz * f.u.y) - f.a, qb = Math.abs(-px * f.u.y + pz * f.u.x) - f.b
    return Math.hypot(Math.max(qa, 0), Math.max(qb, 0)) + Math.min(Math.max(qa, qb), 0)
  }
  const data = gp.tex.image.data, half = THREE.DataUtils.toHalfFloat
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = x0 + (i + 0.5) * cell, z = z0 + (j + 0.5) * cell, d = Math.hypot(x - C.x, z - C.z)
    const n = fbm(x * 0.13, 3.7, z * 0.13, 3)
    // grass: trampled short on the floor (≈0.2), longer on the mound, full height up the bank
    let grass = d < MR ? 0.55 : lerp(0.16 + 0.12 * n, 1, ss(21, 27, d))
    // bare chalk: scuffs on the floor, a worn forecourt before the door (bank streaks read as puddles from the rim: left out)
    const n2 = fbm(x * 0.5, 7.1, z * 0.5, 2)
    let chalk = d < 21 && d > MR ? ss(0.6, 0.72, n) * 0.7 : 0
    const along = (x - door.x) * D.x + (z - door.y) * D.y, across = Math.abs(-(x - door.x) * D.y + (z - door.y) * D.x)
    if (along > -0.5) chalk += (1 - ss(0.8, 2.2, across + along * 0.2)) * (1 - ss(2.5, 6, along)) * ss(0.2, 0.5, n2 + 0.2)
    chalk += 1 - ss(0.4, 1.6, Math.hypot(x - scar.x, z - scar.y))
    let light = 1
    for (const f of foot) {
      const s = sdf(f, x, z)
      if (s > 2) continue
      grass = Math.min(grass, ss(-0.05, 0.9, s) * 0.5 + 0.5 * ss(0.6, 2, s)) // none under the stone, short round its foot
      light = Math.min(light, 0.6 + 0.4 * ss(-0.1, 0.9, s))            // contact shade
    }
    if (along < 0.6 && along > -2.5 && across < 1.1) light = Math.min(light, 0.25) // inside the portal
    chalk = ss(0.3, 0.6, chalk) // sharp edged: turf or bare chalk, never grey mud between
    grass *= 1 - chalk
    chalk *= 0.72 + 0.28 * noise3(x * 1.7, 2.2, z * 1.7) // mottled, so it never reads as a sheet of water
    const k = (j * N + i) * 4
    data[k] = half(off(x, z)); data[k + 1] = half(grass); data[k + 2] = half(chalk); data[k + 3] = half(light)
  }
  gp.rect.set(x0, z0, S)
  gp.tex.needsUpdate = true

  // --- mist: one height-fog volume pooled in the bowl. Density falls off exponentially above the floor and is integrated
  // in closed form along each view ray (from 2 m out to whatever the ray hits, clipped to a cylinder round the bowl), so
  // it has no surface and no edge: it reads the same from the rim, at eye level in the fight, or edge-on.
  const uMist = uniform(1), uMistCol = uniform(new THREE.Color()), TEAL = new THREE.Color(0.05, 0.6, 0.42) // day: the haze; night: glowing teal
  const MRAD = RR + 3, H = 0.75, SIG = 0.26 // cylinder radius, scale height (m), density at the floor (/m)
  const sceneZ = perspectiveDepthToViewZ(viewportDepthTexture(), cameraNear, cameraFar)
  const ray = positionWorld.sub(cameraPosition), tExit = length(ray), v = ray.div(tExit)
  const tHit = tExit.mul(sceneZ.div(positionView.z)) // distance to the scene along this ray
  const oc = cameraPosition.xz.sub(vec2(C.x, C.z)), a = max(dot(v.xz, v.xz), 1e-4), b = dot(oc, v.xz)
  const tIn = b.negate().sub(sqrt(max(b.mul(b).sub(a.mul(dot(oc, oc).sub(MRAD * MRAD))), 0))).div(a)
  const t0 = max(tIn, 2), t1 = max(min(tExit, tHit), t0)
  const hAt = t => cameraPosition.y.add(v.y.mul(t)).sub(floorY).div(H) // height above the floor in scale heights
  const y0 = hAt(t0), y1 = hAt(t1), dy = y1.sub(y0)
  const mean = select(abs(dy).lessThan(1e-3), exp(y0.negate()), exp(y0.negate()).sub(exp(y1.negate())).div(dy)) // mean density
  // wisps: drifting noise sampled at three points on the ray, weighted by the density there
  let nw = float(0), ws = float(0)
  for (const f of [0.2, 0.55, 0.9]) {
    const p = cameraPosition.add(v.mul(mix(t0, t1, f))), w = exp(hAt(mix(t0, t1, f)).negate()).add(1e-4)
    nw = nw.add(w.mul(mx_fractal_noise_float(vec3(p.x.mul(0.06).sub(uT.mul(0.1)), p.z.mul(0.06).sub(uT.mul(0.035)), p.y.mul(0.3).add(uT.mul(0.02))), 3)))
    ws = ws.add(w)
  }
  const wisp = mix(0.35, 1.4, smoothstep(-0.35, 0.65, nw.div(ws)))
  const mm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, side: THREE.BackSide })
  mm.colorNode = uMistCol
  mm.opacityNode = float(1).sub(exp(mean.mul(t1.sub(t0)).mul(SIG).mul(wisp).negate())).mul(uMist).min(0.85)
  const mist = new THREE.Mesh(new THREE.CylinderGeometry(MRAD, MRAD, 16, 64, 1), mm)
  mist.position.set(C.x, floorY + 7, C.z) // floor - 1 m to floor + 15 m
  mist.renderOrder = 2
  scene.add(mist)

  ctx.ring = {
    center: C, radius: 22,
    stones: stones.map(({ mesh, ...s }) => s),
    barrow: { pos: C.clone(), radius: MR, height: MH, door: new THREE.Vector3(door.x + D.x * 1.5, 0, door.y + D.y * 1.5).setY(ctx.heightAt(door.x + D.x * 1.5, door.y + D.y * 1.5)), doorDir: new THREE.Vector3(D.x, 0, D.y) },
    mist: 1, // 0..1: the monster lane clears it when the troll falls
  }
  let lip = 0
  for (let a = 0; a < 48; a++) lip += ctx.heightAt(C.x + (RR + 1) * Math.cos(a / 48 * 6.283), C.z + (RR + 1) * Math.sin(a / 48 * 6.283)) / 48
  const bowlDepth = lip - ctx.heightAt(C.x + D.x * 15 + Dn.x * 6, C.z + D.y * 15 + Dn.y * 6) // rim lip to the floor
  window.__probes.ring = () => ({ stones: stones.length, fallen: stones.filter(s => s.fallen).length, bowlDepth: +bowlDepth.toFixed(2), mist: +uMist.value.toFixed(2) })

  // Proof view: ?ring=1 pins the camera on the rim behind the door path, looking in.
  if (params.get('ring')) {
    const eye = new THREE.Vector3(C.x + D.x * 35, 0, C.z + D.y * 35)
    eye.y = ctx.heightAt(eye.x, eye.z) + 5
    const prev = scene.onBeforeRender
    scene.onBeforeRender = function (r, s, c, ...rest) {
      prev.call(this, r, s, c, ...rest)
      if (c !== camera) return
      c.position.copy(eye); c.lookAt(C.x + D.x * 3, floorY + 0.6, C.z + D.y * 3); c.updateMatrixWorld()
    }
  }

  return {
    update(dt, t) {
      uT.value = t
      const nt = ctx.night
      uNight.value = nt
      uMistCol.value.copy(ctx.fogColor).multiplyScalar(1.1).lerp(TEAL, nt)
      const flick = 0.88 + 0.12 * noise3(t * 3.1, 0.5, 1.5)
      uDoor.value = nt * flick
      doorLight.intensity = 30 * nt * flick
      bowlLight.intensity = 25 * nt * uMist.value
      uMist.value += (ctx.ring.mist - uMist.value) * Math.min(1, dt * 0.8)
      mist.visible = uMist.value > 0.01
    },
  }
}
