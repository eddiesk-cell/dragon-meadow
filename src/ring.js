// Lane ring — the Old Ring: a chalk bowl carved into the meadow, a barrow mound, eleven standing stones, pooled mist.
// Contract: PLAN.md Phase 3 (ctx.ring) and WORLD.md "The first monster". Ground shape, trampled grass, bare chalk and
// contact shade go to the field through ctx.groundPatch (one texture the grass and terrain read).
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { vertexColor, positionLocal, positionWorld, uniform, vec3, float, smoothstep, length, mx_fractal_noise_float } from 'three/tsl'

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

// One weathered sarsen: a rounded slab (superellipsoid), tapered to a rounded crown, lumped and chipped by noise,
// coloured with lichen, moss at the foot, chalk splash and dark crevices. Local origin at the bottom centre, metres.
function stoneGeo(THREE, w, h, t) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 22).deleteAttribute('normal').deleteAttribute('uv'))
  const p = g.attributes.position, col = new Float32Array(p.count * 3), o = rand() * 500, slant = (rand() - 0.5) * 0.5
  const E = 0.38, pw = v => Math.sign(v) * Math.abs(v) ** E
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), y01 = (pw(y) + 1) / 2
    const k = 1 - 0.22 * y01 - 0.45 * ss(0.72, 1, y01) ** 2 // tapers, then rounds over at the crown
    let X = pw(x) * w / 2 * k, Z = pw(z) * t / 2 * k * (1 - 0.15 * y01), Y = y01 * h + slant * X * ss(0.6, 1, y01)
    const n1 = fbm(X * 0.55 + o, Y * 0.45, Z * 0.55, 3), n2 = fbm(X * 2.2 + o, Y * 2.2, Z * 2.2, 3), n3 = noise3(X * 8 + o, Y * 8, Z * 8)
    const d = (n1 - 0.5) * 0.3 + (n2 - 0.5) * 0.1 + (n3 - 0.5) * 0.025 - 0.06 * ss(0.62, 0.8, n2) // lumps, chips, grain, pits
    p.setXYZ(i, X + x * d, Y + y * d * 0.6, Z + z * d)
    // colour (linear): grey sarsen, mottled → pale lichen crust → gold lichen specks → damp moss low → dark pits
    const lich = ss(0.5, 0.66, fbm(X * 1.1 + o, Y * 1.1, Z * 1.1 + 9, 3)), gold = ss(0.7, 0.78, noise3(X * 3.5 + o, Y * 3.5, Z * 3.5))
    const m = 0.7 + 0.55 * n2, streak = 0.82 + 0.25 * noise3(X * 5 + o, Y * 0.5, Z * 5)
    let r = 0.27 * m, gg = 0.26 * m, b = 0.23 * m
    r = lerp(r, 0.48, lich * 0.75); gg = lerp(gg, 0.5, lich * 0.75); b = lerp(b, 0.42, lich * 0.75)
    r = lerp(r, 0.55, gold * 0.85); gg = lerp(gg, 0.4, gold * 0.85); b = lerp(b, 0.1, gold * 0.85)
    const moss = ss(0.9, 0.2, Y) * ss(0.4, 0.6, n1) * 0.8
    r = lerp(r, 0.07, moss); gg = lerp(gg, 0.1, moss); b = lerp(b, 0.035, moss)
    const shade = streak * (0.45 + 0.55 * ss(-0.08, 0.05, d))
    col[i * 3] = r * shade; col[i * 3 + 1] = gg * shade; col[i * 3 + 2] = b * shade
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
  const off = (x, z) => {
    const dx = x - C.x, dz = z - C.z, d = Math.hypot(dx, dz)
    if (d > RR + 9) return 0
    const pit = -0.35 * (1 - ss(0.3, 1.5, Math.hypot(x - scar.x, z - scar.y)))
    return (floorY + mound(d) - base(x, z)) * (1 - ss(RF, RR, d)) + LIP * Math.exp(-(((d - RR - 1) / 2.5) ** 2)) + pit
  }
  ctx.heightAt = (x, z) => base(x, z) + off(x, z)

  // --- stones: twelve slots on a 22 m ring (door gap between slots 11 and 0), slot 7 empty, three fallen
  const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 })
  mat.colorNode = vertexColor().mul(mx_fractal_noise_float(positionLocal.mul(7), 3).mul(0.22).add(1)) // fine grain close up
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
  const FALLEN = new Set([2, 5, 9])
  for (let k = 0; k < 12; k++) {
    if (k === 7) continue
    const th = slot(k) + (rand() - 0.5) * 0.12, r = 22 + (rand() - 0.5) * 1.6
    const x = C.x + r * Math.cos(th), z = C.z + r * Math.sin(th)
    const tangent = new THREE.Vector2(-Math.sin(th), Math.cos(th))
    const fallen = FALLEN.has(k)
    const h = fallen ? 3 + rand() * 1.3 : 2.5 + rand() * 1.5, w = 1.0 + rand() * 0.6, t = 0.55 + rand() * 0.35
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
      m.position.y = ctx.heightAt(x, z) - t * 0.05
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
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 2.3), new THREE.MeshBasicNodeMaterial({ color: 0x050605 }))
  hole.position.set(door.x - D.x * 0.25, doorY + 0.85, door.y - D.y * 0.25)
  hole.rotation.y = dyaw
  group.add(hole)
  scene.add(group)

  // --- ground patch: 80 m square round the centre → field grass + terrain (ctx.groundPatch, src/field.js)
  const gp = ctx.groundPatch, N = gp.size, S = 80, x0 = C.x - S / 2, z0 = C.z - S / 2, cell = S / N
  const H = new Float32Array(N * N)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = off(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell)
  const sdf = (f, x, z) => {
    const px = x - f.c.x, pz = z - f.c.y, qa = Math.abs(px * f.u.x + pz * f.u.y) - f.a, qb = Math.abs(-px * f.u.y + pz * f.u.x) - f.b
    return Math.hypot(Math.max(qa, 0), Math.max(qb, 0)) + Math.min(Math.max(qa, qb), 0)
  }
  const data = gp.tex.image.data, half = THREE.DataUtils.toHalfFloat
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = x0 + (i + 0.5) * cell, z = z0 + (j + 0.5) * cell, d = Math.hypot(x - C.x, z - C.z)
    const sx = (H[j * N + Math.min(i + 1, N - 1)] - H[j * N + Math.max(i - 1, 0)]) / (2 * cell), sz = (H[Math.min(j + 1, N - 1) * N + i] - H[Math.max(j - 1, 0) * N + i]) / (2 * cell)
    const slope = Math.hypot(sx + (base(x + 0.5, z) - base(x - 0.5, z)), sz + (base(x, z + 0.5) - base(x, z - 0.5)))
    const n = fbm(x * 0.13, 3.7, z * 0.13, 3)
    // grass: trampled short on the floor (≈0.3), a little longer on the mound, full height up the bank
    let grass = d < MR ? 0.55 : lerp(0.28 + 0.15 * n, 1, ss(21, 27, d))
    // bare chalk: scuffs on the floor, streaks where the bank is steep, the path from the door out through the gap
    let chalk = (d < 21 ? ss(0.6, 0.72, n) * 0.7 : 0) + ss(0.32, 0.55, slope) * ss(0.35, 0.6, fbm(x * 0.4, 1.3, z * 0.4, 2))
    const along = (x - door.x) * D.x + (z - door.y) * D.y, across = Math.abs(-(x - door.x) * D.y + (z - door.y) * D.x)
    if (along > -0.5 && d < RR + 6) chalk += (1 - ss(0.5, 1.4 + along * 0.02, across)) * (0.85 - ss(14, RR + 6, d) * 0.6) * (0.75 + 0.5 * n)
    chalk += 1 - ss(0.4, 1.6, Math.hypot(x - scar.x, z - scar.y))
    let light = 1
    for (const f of foot) {
      const s = sdf(f, x, z)
      if (s > 2) continue
      grass = Math.min(grass, ss(-0.05, 0.9, s) * 0.5 + 0.5 * ss(0.6, 2, s)) // none under the stone, short round its foot
      light = Math.min(light, 0.45 + 0.55 * ss(-0.1, 1.2, s))          // contact shade
    }
    if (along < 0.6 && along > -2.5 && across < 1.1) light = Math.min(light, 0.25) // inside the portal
    chalk = Math.min(1, chalk)
    grass *= 1 - chalk * 0.85
    const k = (j * N + i) * 4
    data[k] = half(H[j * N + i]); data[k + 1] = half(grass); data[k + 2] = half(chalk); data[k + 3] = half(light)
  }
  gp.rect.set(x0, z0, S)
  gp.tex.needsUpdate = true

  // --- mist: four soft layers pooled on the floor, each fading where the ground or the mound rises through it
  const uT = uniform(0), uMist = uniform(1), mistCol = ctx.fogColor.clone().multiplyScalar(1.12)
  const bank = d => DEPTH * ss(RF, RR, d)
  const mists = [0.3, 0.85, 1.5, 2.3].map((y, i) => {
    let rOut = RF; while (rOut < RR + 4 && bank(rOut) < y + 0.3) rOut += 0.25
    let rIn = 0; while (rIn < MR && mound(rIn) > y - 0.2) rIn += 0.25
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false })
    const dc = length(positionWorld.xz.sub(vec3(C.x, 0, C.z).xz))
    const drift = vec3(positionWorld.x.mul(0.07).sub(uT.mul(0.12)), positionWorld.z.mul(0.07).sub(uT.mul(0.04)), float(i * 3.1).add(uT.mul(0.02)))
    const wisp = smoothstep(-0.25, 0.6, mx_fractal_noise_float(drift, 4))
    m.colorNode = vec3(mistCol.r, mistCol.g, mistCol.b)
    m.opacityNode = wisp.mul(smoothstep(rIn, rIn + 2.5, dc)).mul(float(1).sub(smoothstep(rOut - 4, rOut, dc))).mul(uMist).mul([0.42, 0.34, 0.24, 0.14][i])
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(rOut, 96).rotateX(-Math.PI / 2), m)
    mesh.position.set(C.x, floorY + y, C.z)
    mesh.renderOrder = 2 + i
    scene.add(mesh)
    return mesh
  })

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
    const eye = new THREE.Vector3(C.x + D.x * 38, 0, C.z + D.y * 38)
    eye.y = ctx.heightAt(eye.x, eye.z) + 3.2
    const prev = scene.onBeforeRender
    scene.onBeforeRender = function (r, s, c, ...rest) {
      prev.call(this, r, s, c, ...rest)
      if (c !== camera) return
      c.position.copy(eye); c.lookAt(C.x, floorY + 1.2, C.z); c.updateMatrixWorld()
    }
  }

  return {
    update(dt, t) {
      uT.value = t
      uMist.value += (ctx.ring.mist - uMist.value) * Math.min(1, dt * 0.8)
      for (const m of mists) m.visible = uMist.value > 0.01
    },
  }
}
