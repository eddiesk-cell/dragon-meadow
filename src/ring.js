// Lane ring — the Old Ring: a chalk bowl carved into the meadow, a barrow mound, eleven standing stones, pooled mist.
// Contract: PLAN.md Phase 3 (ctx.ring) and WORLD.md "The first monster". Ground shape, trampled grass, bare chalk and
// contact shade go to the field through ctx.groundPatch (one texture the grass and terrain read).
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  vertexColor, positionLocal, positionWorld, positionView, uniform, vec3, float, smoothstep, saturate, length, mx_fractal_noise_float,
  viewportDepthTexture, perspectiveDepthToViewZ, cameraNear, cameraFar, cameraPosition,
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
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 }) // vertex colour via colorNode (vertexColors: true would square it)
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
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 2.3), new THREE.MeshBasicNodeMaterial({ color: 0x050605 }))
  hole.position.set(door.x - D.x * 0.25, doorY + 0.85, door.y - D.y * 0.25)
  hole.rotation.y = dyaw
  group.add(hole)
  scene.add(group)

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

  // --- mist: five thin layers pooled on the floor. Each fades where the bank or mound rises through it and, per pixel,
  // where it nears whatever is behind it (scene depth), so no layer ever draws a hard line across a stone or the grass.
  const uT = uniform(0), uMist = uniform(1), mistCol = ctx.fogColor.clone().multiplyScalar(1.1)
  const bank = d => DEPTH * ss(RF, RR, d)
  const sceneZ = perspectiveDepthToViewZ(viewportDepthTexture(), cameraNear, cameraFar)
  const soft = saturate(positionView.z.sub(sceneZ).div(1.6)).mul(smoothstep(2, 8, length(positionWorld.sub(cameraPosition))))
  const mists = [0.25, 0.7, 1.25, 1.9, 2.7].map((y, i) => {
    let rOut = RF; while (rOut < RR + 4 && bank(rOut) < y + 0.3) rOut += 0.25
    let rIn = 0; while (rIn < MR && mound(rIn) > y - 0.2) rIn += 0.25
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false })
    const dc = length(positionWorld.xz.sub(vec3(C.x, 0, C.z).xz))
    const drift = vec3(positionWorld.x.mul(0.06).sub(uT.mul(0.1)), positionWorld.z.mul(0.06).sub(uT.mul(0.035)), float(i * 3.1).add(uT.mul(0.02)))
    const wisp = smoothstep(-0.35, 0.65, mx_fractal_noise_float(drift, 4))
    m.colorNode = vec3(mistCol.r, mistCol.g, mistCol.b)
    m.opacityNode = wisp.mul(soft).mul(smoothstep(rIn, rIn + 2.5, dc)).mul(float(1).sub(smoothstep(rOut - 5, rOut, dc))).mul(uMist).mul([0.26, 0.22, 0.17, 0.11, 0.06][i])
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
      uMist.value += (ctx.ring.mist - uMist.value) * Math.min(1, dt * 0.8)
      for (const m of mists) m.visible = uMist.value > 0.01
    },
  }
}
