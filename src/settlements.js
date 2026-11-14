// Lane settlements (PLAN.md Phase 6 "Lane settlements"): the town of Springwell, Castle Crestwatch and the far city of
// Asterhaven, assembled from public/models/world/town-kit.glb and castle-kit.glb. One InstancedMesh per (piece, material),
// so a kind of building costs its material count in draw calls however many of it stand. Windows glow by ctx.night,
// chimneys smoke, footprints go into ctx.keepClear, everything stands on ctx.heightAt. The haze is the sky's own fogNode
// on every material, so far walls fade into the same air as the land.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  uniform, attribute, vertexColor, vec2, vec3, vec4, float, sin, fract, floor, dot, mix, step, smoothstep, saturate, pow, max, min,
  length, normalize, cross, cameraPosition, materialColor, positionWorld, positionViewDirection, normalView, uv, mx_noise_float,
} from 'three/tsl'

const ss = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k) }
const lerp = (a, b, t) => a + (b - a) * t

// Where they stand. PLAN.md put Crestwatch at (−520, −240), but from the start that is 65° left of the view (the lens
// shows ±40°), and its CHECK wants it ahead-left as in mix-day.png. So it stands on a chalk headland the cliff throws north
// into the sea, ~390 m out and 17° left of the start view (clear of the Crest Stone and the egg), its castle hill rising
// from 42 m cliffs to 56 m under the keep, so it shows over the 25 m crest and out of the lip mist.
const KEEP = { x: -122, z: -390 }, NECK = { x: -112, z: -212 } // the headland's centre (the keep) and where it leaves the crest
const TOWN = { x: -70, z: 515 } // Springwell's square
const CITY = { x: -1500, z: 650 } // Asterhaven's palace hill

// Chimney smoke on the GPU — the recipe of src/landmarks.js (not exported there): each puff's age = fract(time + offset).
function smoke(THREE, tops, uT, uNight) {
  const N = 22, geo = new THREE.InstancedBufferGeometry(), s = new Float32Array(tops.length * N * 4)
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2))
  geo.setIndex([0, 1, 2, 0, 2, 3])
  tops.forEach((p, k) => { for (let i = 0; i < N; i++) s.set([p.x, p.y, p.z, i / N + k * 0.37], (k * N + i) * 4) })
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(s, 4))
  geo.instanceCount = tops.length * N
  const a = attribute('aS', 'vec4'), ph = fract(uT.mul(0.07).add(a.w))
  const wob = sin(a.w.mul(37)).mul(ph).mul(1.6)
  const c = a.xyz.add(vec3(ph.mul(8).add(wob), ph.mul(11), ph.mul(3).sub(wob))), size = ph.mul(4.5).add(0.7)
  const toCam = normalize(cameraPosition.sub(c)), right = normalize(cross(vec3(0, 1, 0), toCam)), up = cross(toCam, right), q = attribute('position', 'vec3')
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false })
  mat.positionNode = c.add(right.mul(q.x.mul(size))).add(up.mul(q.y.mul(size)))
  const r = saturate(float(1).sub(length(uv().sub(0.5).mul(2))))
  mat.colorNode = vec4(mix(vec3(0.82, 0.82, 0.84), vec3(0.32, 0.3, 0.42), uNight), r.mul(r).mul(sin(ph.mul(Math.PI))).mul(0.3))
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  return mesh
}

// Placements per kit piece → one InstancedMesh per (piece, material) under `group`, which stands at the settlement's centre
// (so each mesh has a real world position). Chimney tops and lamp centres (node extras) come back in world space.
function kit(THREE, src, group, swap) {
  const rows = new Map(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), tops = [], lights = []
  src.updateMatrixWorld(true)
  return {
    tops, lights,
    add(name, x, y, z, yaw = 0, s = 1) {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(Y, yaw), s.isVector3 ? s : new THREE.Vector3(s, s, s))
      if (!rows.has(name)) rows.set(name, [])
      rows.get(name).push(m)
      const ud = src.getObjectByName(name).userData
      for (const p of ud.smoke || []) tops.push(new THREE.Vector3(...p).applyMatrix4(m))
      for (const p of ud.light || []) lights.push(new THREE.Vector3(...p).applyMatrix4(m))
    },
    build({ shadow = false, block = false } = {}) {
      const toLocal = new THREE.Matrix4().makeTranslation(-group.position.x, -group.position.y, -group.position.z), t = new THREE.Matrix4()
      for (const [name, ms] of rows) {
        const node = src.getObjectByName(name), inv = node.matrixWorld.clone().invert()
        node.traverse(o => {
          if (!o.isMesh) return
          const rel = inv.clone().multiply(o.matrixWorld), im = new THREE.InstancedMesh(o.geometry, swap(o.material, name), ms.length)
          ms.forEach((m, i) => im.setMatrixAt(i, t.multiplyMatrices(toLocal, m).multiply(rel)))
          im.computeBoundingSphere()
          im.castShadow = shadow
          im.receiveShadow = true
          im.userData.cameraBlock = block
          group.add(im)
        })
      }
    },
  }
}

const curveOf = (THREE, pts) => new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal')
// Points every ~step metres along a curve: { x, z, tx, tz (unit tangent), s (arc length) }.
function sample(c, step) {
  const L = c.getLength(), n = Math.max(2, Math.ceil(L / step)), out = []
  for (let k = 0; k <= n; k++) {
    const u = k / n, p = c.getPointAt(u), t = c.getTangentAt(u)
    out.push({ x: p.x, z: p.z, tx: t.x, tz: t.z, s: u * L })
  }
  return out
}
const nearestS = (sm, s) => sm[Math.min(sm.length - 1, Math.max(0, Math.round(s / sm[sm.length - 1].s * (sm.length - 1))))]

// A strip `hw` either side of the samples; y(x, z, p) gives each vertex's height. uv = (−1…1 across, metres along).
function strip(THREE, sm, hw, y) {
  const pos = [], uvs = [], idx = []
  sm.forEach((p, k) => {
    for (const sd of [-1, 1]) { const x = p.x + p.tz * hw * sd, z = p.z - p.tx * hw * sd; pos.push(x, y(x, z, p), z); uvs.push(sd, p.s) }
    if (k) { const a = 2 * k - 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) }
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// A ground tile from ctx.heightAt, coloured like the field's terrain (field.js "terrain": vc² under the same Lambert);
// gb(x, z) → [grass ×, bare 0..1] as the field's ground patch would give; drop(x, z) sinks it under a finer tile.
function tile(THREE, ctx, x0, z0, w, d, step, mat, gb = () => [1, 0], drop = () => 0) {
  const g = new THREE.PlaneGeometry(w, d, Math.round(w / step), Math.round(d / step)).rotateX(-Math.PI / 2).translate(x0 + w / 2, 0, z0 + d / 2)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) p.setY(i, ctx.heightAt(p.getX(i), p.getZ(i)) - drop(p.getX(i), p.getZ(i)))
  g.computeVertexNormals()
  const n = g.attributes.normal, col = new Float32Array(p.count * 3), ab = new Float32Array(p.count * 2), c = new THREE.Color(), rock = new THREE.Color(0.3, 0.28, 0.24)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), v = 0.85 + 0.3 * (0.5 + 0.5 * Math.sin(x * 0.05 + Math.sin(z * 0.04) * 2) * Math.sin(z * 0.06))
    c.setRGB(0.2 * v, 0.27 * v, 0.09 * v).lerp(rock, ss(0.85, 0.6, n.getY(i))).toArray(col, i * 3)
    ab.set(gb(x, z), i * 2)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.setAttribute('aGB', new THREE.BufferAttribute(ab, 2))
  const m = new THREE.Mesh(g, mat)
  m.receiveShadow = true
  return m
}

export async function createSettlements(ctx) {
  const { THREE, scene } = ctx
  if (ctx.params.get('settlements') === '0') return null // A/B for fps and look
  const t0 = performance.now()
  const loader = new GLTFLoader()
  const [townKit, castleKit] = (await Promise.all(['town-kit', 'castle-kit'].map(n => loader.loadAsync(import.meta.env.BASE_URL + `models/world/${n}.glb`)))).map(g => g.scene)
  const uNight = uniform(0), uT = uniform(0), uSky = uniform(new THREE.Color().copy(ctx.fogColor))
  const bases = [] // every building's foot { x, y, z } for the probe: it must sit on ctx.heightAt
  const clear = (x, z, r) => ctx.keepClear.push({ x, z, r })

  // --- shared materials
  const lamp = vec3(1, 0.55, 0.2), uLamps = uniform(0), dusk = uLamps // 0 by day → 1 once the sun is low or the night has come (update)
  const glass = lit => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.3, metalness: 0 })
    m.colorNode = vec3(0.045, 0.04, 0.035)
    m.emissiveNode = lamp.mul(lit).mul(dusk)
    return m
  }
  const rnd = fract(sin(dot(floor(positionWorld.mul(vec3(0.55, 0.42, 0.55))), vec3(12.9898, 78.233, 37.719))).mul(43758.5453))
  const winMat = glass(step(0.1, rnd).mul(rnd.mul(2).add(3.4))) // 9 in 10 windows lit, each its own warmth, bright enough to carry through the night haze
  const lampMat = glass(float(5))
  const swaps = new Map() // kit material → ours
  const swap = (m, name) => m.name === 'window' ? (name === 'lantern' ? lampMat : winMat) : swaps.get(m) || m
  const groundMat = new THREE.MeshLambertNodeMaterial()
  {
    // field's own ground colour and light (the same on foot, its far meadow from the air), so no seam shows at a tile's edge
    const gb = attribute('aGB', 'vec2')
    groundMat.colorNode = ctx.groundColor(vertexColor().rgb, gb.x, gb.y)
    groundMat.normalNode = ctx.groundNormal(attribute('normal', 'vec3')) // tiles sit at the origin: object normal is world normal
  }
  const stoneOf = (src, name) => { let s; src.traverse(o => { if (o.isMesh && o.material.name === name) s = o.material }); return s }
  { // castle stone: paler, and lit a little by the haze itself, so a castle with the sun behind it still reads as pale
    // stone standing in bright air (mix-day.png) rather than a dark cut-out; the fill follows ctx.fogColor, so it fades at night
    const m = stoneOf(castleKit, 'stone')
    const n = new THREE.MeshStandardNodeMaterial({ map: m.map, normalMap: m.normalMap, normalScale: m.normalScale, roughness: m.roughness, metalness: 0, color: new THREE.Color(1.2, 1.17, 1.1) })
    n.emissiveNode = materialColor.mul(uSky).mul(0.32)
    swaps.set(m, n)
  }

  // ================= Springwell =================
  // The field's ground patch carries the town into the grass: terraces under the houses, the lanes and the square cut
  // level and bare, the Brightwater's channel carved. ctx.heightAt (and so the hero) reads the same metres.
  const X0 = -230, Z0 = 340, S = 320
  const P = ctx.addGroundPatch(X0, Z0, S), PN = P.tex.image.width, K = PN / S, N2 = PN * PN
  const xs = i => X0 + (i + 0.5) / K, zs = j => Z0 + (j + 0.5) / K
  const hb = new Float32Array(N2), t = new Float32Array(N2), grass = new Float32Array(N2).fill(1), bare = new Float32Array(N2)
  // the town climbs a low hill to the south; zero at the patch border
  const rise = (x, z) => 16 * ss(496, 592, z) * ss(658, 622, z) * ss(150, 95, Math.abs(x - TOWN.x))
  for (let j = 0; j < PN; j++) for (let i = 0; i < PN; i++) { const o = j * PN + i; hb[o] = ctx.heightAt(xs(i), zs(j)); t[o] = hb[o] + rise(xs(i), zs(j)) }
  const at = (g, x, z) => { // bilinear on a patch grid
    const u = Math.min(PN - 1.001, Math.max(0, (x - X0) * K - 0.5)), v = Math.min(PN - 1.001, Math.max(0, (z - Z0) * K - 0.5)), i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, o = j * PN + i
    return (g[o] * (1 - fu) + g[o + 1] * fu) * (1 - fv) + (g[o + PN] * (1 - fu) + g[o + PN + 1] * fu) * fv
  }
  // nearest-sample distance and arc length from every texel within R m of a sampled curve
  const reach = (sm, R) => {
    const d = new Float32Array(N2).fill(1e9), s = new Float32Array(N2), r = Math.ceil(R * K)
    for (const p of sm) {
      const ci = Math.floor((p.x - X0) * K), cj = Math.floor((p.z - Z0) * K)
      for (let j = Math.max(0, cj - r); j <= Math.min(PN - 1, cj + r); j++) for (let i = Math.max(0, ci - r); i <= Math.min(PN - 1, ci + r); i++) {
        const e = Math.hypot(xs(i) - p.x, zs(j) - p.z), o = j * PN + i
        if (e < d[o]) { d[o] = e; s[o] = p.s }
      }
    }
    return { d, s }
  }
  const smooth = (a, w) => a.map((_, k) => { let s = 0, n = 0; for (let q = Math.max(0, k - w); q <= Math.min(a.length - 1, k + w); q++) s += a[q], n++; return s / n })
  // level a road across its width to its own (smoothed) centreline height; bare and grassless on the way
  const road = (sm, hw, hc) => {
    const { d, s } = reach(sm, hw + 5), step = sm[1].s
    for (let o = 0; o < N2; o++) {
      if (d[o] > hw + 5) continue
      t[o] = lerp(t[o], hc[Math.round(s[o] / step)], ss(hw + 4.5, hw + 0.4, d[o]))
      grass[o] *= ss(hw - 0.2, hw + 0.7, d[o])
      bare[o] = Math.max(bare[o], 0.75 * ss(hw + 0.7, hw - 0.3, d[o]))
    }
  }

  const LANE = sample(curveOf(THREE, [[-108, 364], [-104, 395], [-96, 430], [-88, 461], [-83, 481], [-77, 500], [-72, 511]]), 0.6)
  const STREAM = sample(curveOf(THREE, [[34, 452], [6, 458], [-35, 465], [-86, 471], [-128, 480], [-168, 474], [-208, 482]]), 0.6)
  const STREETS = [[[-57, 506], [-25, 494], [14, 487]], [[-71, 529], [-74, 560], [-83, 598]]].map(p => sample(curveOf(THREE, p), 0.6))
  const LW = 2.3 // lane half-width

  // where the lane crosses the Brightwater: the bridge, level at the mean of its banks
  let sB = 0, best = 1e9
  for (const p of LANE) for (const q of STREAM) { const e = Math.hypot(p.x - q.x, p.z - q.z); if (e < best) best = e, sB = p.s }
  const B = nearestS(LANE, sB), laneH = smooth(LANE.map(p => at(t, p.x, p.z)), 14)
  const R = (laneH[Math.round((sB - 26) / LANE[1].s)] + laneH[Math.round((sB + 26) / LANE[1].s)]) / 2
  road(LANE, LW, laneH.map((h, k) => lerp(h, R, ss(40, 24, Math.abs(LANE[k].s - sB)))))
  // the square
  const hQ = at(t, TOWN.x, TOWN.z)
  for (let o = 0; o < N2; o++) {
    const e = Math.hypot(xs(o % PN) - TOWN.x, zs((o / PN) | 0) - TOWN.z)
    if (e > 20) continue
    t[o] = lerp(t[o], hQ, ss(20, 15, e)); grass[o] *= ss(14.5, 15.5, e); bare[o] = Math.max(bare[o], 0.75 * ss(15.5, 14.5, e))
  }
  for (const sm of STREETS) road(sm, LW, smooth(sm.map(p => at(t, p.x, p.z)), 14))

  // houses: [piece, street samples, s, side (+1 left of travel), offset]
  const box = name => new THREE.Box3().setFromObject(townKit.getObjectByName(name))
  const half = Object.fromEntries(['cottage_s', 'cottage_l', 'house', 'market', 'church', 'well', 'lantern'].map(n => {
    const b = box(n); return [n, [Math.max(-b.min.x, b.max.x), Math.max(-b.min.z, b.max.z)]]
  }))
  const [SE, SS] = STREETS
  // rows of houses packed shoulder to shoulder down a street side, fronts to the street (Springwell's 20 houses)
  const rand = (q => () => (q = (q * 1664525 + 1013904223) >>> 0) / 4294967296)(3)
  const placed = []
  const row = (sm, side, s0, s1, kinds) => {
    for (let s = s0, k = 0; ; k++) {
      const name = kinds[k % kinds.length], [hx, hz] = half[name]
      if (s + 2 * hx > s1) break
      const p = nearestS(sm, s + hx), nx = -p.tz * side, nz = p.tx * side, off = LW + 1.3 + hz
      placed.push({ name, x: p.x + nx * off, z: p.z + nz * off, yaw: Math.atan2(-nx, -nz) + (rand() - 0.5) * 0.06 }) // front (+Z) to the street
      s += 2 * hx + 0.6 + rand() * 1.8
    }
  }
  row(SE, 1, 3, 72, ['cottage_l', 'house', 'cottage_s', 'house', 'cottage_l', 'cottage_s', 'house']) // the riverside row
  row(SS, 1, 4, 70, ['house', 'cottage_s', 'cottage_l', 'house', 'cottage_s'])
  row(SS, -1, 4, 70, ['cottage_s', 'house', 'cottage_l', 'house'])
  row(LANE, -1, 62, 92, ['cottage_l', 'cottage_s'])
  placed.push({ name: 'market', x: TOWN.x - 20, z: TOWN.z + 3, yaw: Math.PI / 2 }, { name: 'well', x: TOWN.x + 2, z: TOWN.z + 1, yaw: 0.3 },
    { name: 'church', x: -36, z: 552, yaw: Math.atan2(TOWN.x - -36, TOWN.z - 552) })
  for (const b of placed) { // a terrace under each: level to its centre's height, grass off the footprint
    const [hx, hz] = half[b.name], c = Math.cos(b.yaw), s = Math.sin(b.yaw)
    b.y = at(t, b.x, b.z)
    const r = Math.ceil((Math.hypot(hx, hz) + 6) * K), ci = Math.floor((b.x - X0) * K), cj = Math.floor((b.z - Z0) * K)
    for (let j = Math.max(0, cj - r); j <= Math.min(PN - 1, cj + r); j++) for (let i = Math.max(0, ci - r); i <= Math.min(PN - 1, ci + r); i++) {
      const dx = xs(i) - b.x, dz = zs(j) - b.z, lx = dx * c - dz * s, lz = dx * s + dz * c, o = j * PN + i
      const out = Math.hypot(Math.max(Math.abs(lx) - hx - 0.8, 0), Math.max(Math.abs(lz) - hz - 0.8, 0))
      t[o] = lerp(t[o], b.y, ss(4.5, 0, out))
      grass[o] *= ss(-0.2, 0.5, Math.max(Math.abs(lx) - hx, Math.abs(lz) - hz))
    }
  }

  // the Brightwater: rises in a pool at its east end, runs west under the bridge; its surface steps down in 0.8 m weirs
  // (never above a bank, always 2.6 m under the bridge deck). shortcut: it ends 120 m west of the bridge (channel fades
  // out); carry it on when the Lanternwood / Mirrormere lanes build its course.
  const LS = STREAM[STREAM.length - 1].s, sBs = STREAM.reduce((a, q) => Math.hypot(q.x - B.x, q.z - B.z) < Math.hypot(a.x - B.x, a.z - B.z) ? q : a).s
  let lo = Infinity
  const Wl = STREAM.map(p => {
    lo = Math.min(lo, at(t, p.x, p.z) - 1.25, p.s > sBs - 20 ? R - 2.6 : Infinity)
    return Math.floor(lo / 0.8) * 0.8
  })
  const hwS = s => 7.5 + 5 * ss(16, 0, s), fade = s => 1 - ss(LS - 40, LS - 4, s)
  {
    const { d, s } = reach(STREAM, 20), step = STREAM[1].s
    for (let o = 0; o < N2; o++) {
      if (d[o] > 20) continue
      const k = Math.round(s[o] / step), hw = hwS(s[o]), f = fade(s[o]), bed = Wl[k] - 1.7
      t[o] = Math.min(t[o], lerp(t[o], lerp(bed, t[o], ss(hw, hw + 6.5, d[o])), f))
      grass[o] *= lerp(1, ss(hw + 2.5, hw + 5, d[o]), f)
      bare[o] = Math.max(bare[o], 0.3 * (1 - ss(hw + 2, hw + 4.5, d[o])) * f)
    }
  }
  for (const b of placed) b.y = at(t, b.x, b.z) // overlapping terraces can nudge a centre a few cm: stand on the final ground
  const put = THREE.DataUtils.toHalfFloat, PD = P.tex.image.data
  let edge = 0
  for (let o = 0; o < N2; o++) {
    PD.set([put(t[o] - hb[o]), put(grass[o]), put(bare[o]), put(1)], o * 4)
    const i = o % PN, j = (o / PN) | 0
    if (!i || !j || i === PN - 1 || j === PN - 1) edge = Math.max(edge, Math.abs(t[o] - hb[o]), 1 - grass[o], bare[o])
  }
  P.tex.needsUpdate = true

  // ground beyond the field's 800 m terrain: fine over the patch, coarse to the haze
  const inPatch = (x, z) => x > X0 && x < X0 + S && z < Z0 + S
  const gbAt = (x, z) => inPatch(x, z) ? [at(grass, x, z), at(bare, x, z)] : [1, 0]
  scene.add(tile(THREE, ctx, X0, 400, S, Z0 + S - 400, 2, groundMat, gbAt))
  scene.add(tile(THREE, ctx, -760, 400, 1400, 1100, 10, groundMat, undefined, (x, z) => x > X0 + 2 && x < X0 + S - 2 && z < Z0 + S - 2 ? 1.5 : 0))
  ctx.ground.rects.push([-760, 640, 400, 1500]) // that tile's extent, for whoever places things on the ground (flora)

  // the Brightwater's surface: the sky in it at a glance, deep teal looking down, streaks drifting downstream
  const water = new THREE.MeshStandardNodeMaterial({ roughness: 0.12, metalness: 0 })
  {
    const fres = pow(float(1).sub(saturate(dot(normalView, positionViewDirection))), 3)
    const sky = mix(uSky.mul(vec3(0.42, 0.66, 1.05)), uSky, fres.mul(fres)) // looking down it mirrors the higher, bluer sky
    const streak = pow(sin(uv().y.mul(0.9).add(uT.mul(1.4)).add(mx_noise_float(positionWorld.xz.mul(0.15)).mul(4))).mul(0.5).add(0.5), 24)
    water.colorNode = mix(vec3(0.01, 0.05, 0.065), sky, fres.mul(0.45).add(0.08)).add(streak.mul(0.05))
    water.emissiveNode = sky.mul(fres.mul(0.22).add(0.03))
  }
  const st = STREAM[1].s, lead = Array.from({ length: 12 }, (_, k) => ({ ...STREAM[0], x: STREAM[0].x - STREAM[0].tx * (24 - 2 * k), z: STREAM[0].z - STREAM[0].tz * (24 - 2 * k), s: 0 }))
  const surf = new THREE.Mesh(new THREE.BufferGeometry(), water)
  {
    const all = [...lead, ...STREAM], pos = [], uvs = [], idx = []
    all.forEach((p, k) => {
      const hw = hwS(p.s) + 6.8, y = Wl[Math.round(p.s / st)]
      for (const sd of [-1, 1]) { pos.push(p.x + p.tz * hw * sd, y, p.z - p.tx * hw * sd); uvs.push(sd, p.s) }
      if (k) { const a = 2 * k - 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) }
    })
    surf.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    surf.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    surf.geometry.setIndex(idx)
    surf.geometry.computeVertexNormals()
  }
  surf.receiveShadow = true
  scene.add(surf)

  // cobbles: the lane (not over the bridge), the streets, the square
  const cobble = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
  {
    // setts ~0.48 × 0.38 m in running bond, each its own shade, dark joints
    const p = positionWorld.xz.mul(vec2(2.1, 2.6)), q = vec2(p.x.add(floor(p.y).mul(0.5)), p.y), f = fract(q)
    const edge = min(min(f.x, f.x.oneMinus()), min(f.y, f.y.oneMinus()).mul(1.25)), h = fract(sin(dot(floor(q), vec2(127.1, 311.7))).mul(43758.5453))
    const tint = mx_noise_float(positionWorld.xz.mul(0.13)).mul(0.12).add(h.mul(0.35)).add(0.75)
    cobble.colorNode = mix(vec3(0.035, 0.03, 0.025), vec3(0.24, 0.215, 0.18).mul(tint), smoothstep(0.02, 0.11, edge))
  }
  const onGround = lift => (x, z) => ctx.heightAt(x, z) + lift
  const cobbles = [
    strip(THREE, LANE.filter(p => p.s < sB - 18.2), LW, onGround(0.06)), strip(THREE, LANE.filter(p => p.s > sB + 18.2), LW, onGround(0.06)),
    ...STREETS.map(sm => strip(THREE, sm, LW, onGround(0.06))),
    new THREE.CircleGeometry(15, 48).rotateX(-Math.PI / 2).translate(TOWN.x, 0, TOWN.z),
  ]
  { const p = cobbles[cobbles.length - 1].attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, ctx.heightAt(p.getX(i), p.getZ(i)) + 0.06) }
  const paved = new THREE.Mesh(mergeGeometries(cobbles), cobble)
  paved.geometry.computeVertexNormals()
  paved.receiveShadow = true
  scene.add(paved)

  // low dry-stone walls either side of the Holloway, the town kit's own masonry (uv = metres / 2.4, courses level)
  const stone = stoneOf(townKit, 'stone'), walls = []
  for (const side of [-1, 1]) for (let k = 6; k < LANE.length - 1; k += 5) {
    const a = LANE[k - 5], b = LANE[k]
    if (b.s > sB - 21 || a.s < 2) continue
    if (placed.some(h => Math.hypot(h.x - (a.x + b.x) / 2, h.z - (a.z + b.z) / 2) < Math.hypot(...half[h.name]) + 3)) continue // a house fronts the lane here
    const ax = a.x + a.tz * (LW + 0.6) * side, az = a.z - a.tx * (LW + 0.6) * side, bx = b.x + b.tz * (LW + 0.6) * side, bz = b.z - b.tx * (LW + 0.6) * side
    const ya = ctx.heightAt(ax, az), yb = ctx.heightAt(bx, bz), y0 = Math.min(ya, yb) - 0.5, y1 = (ya + yb) / 2 + 0.95, L = Math.hypot(bx - ax, bz - az) + 0.12
    const g = new THREE.BoxGeometry(L, y1 - y0, 0.55), gp = g.attributes.position, gn = g.attributes.normal, gu = g.attributes.uv
    for (let i = 0; i < gp.count; i++) {
      const ly = gp.getY(i) + (y0 + y1) / 2, lx = gp.getX(i) + a.s
      gu.setXY(i, Math.abs(gn.getY(i)) > 0.5 ? lx / 2.4 : (Math.abs(gn.getX(i)) > 0.5 ? gp.getZ(i) : lx) / 2.4, Math.abs(gn.getY(i)) > 0.5 ? gp.getZ(i) / 2.4 : ly / 2.4)
    }
    walls.push(g.rotateY(Math.atan2(-(bz - az), bx - ax)).translate((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2))
  }
  const wallMesh = new THREE.Mesh(mergeGeometries(walls), stone)
  wallMesh.castShadow = wallMesh.receiveShadow = true
  scene.add(wallMesh)

  // the buildings, the bridge, the lanterns
  const townG = new THREE.Group()
  townG.position.set(TOWN.x, 0, TOWN.z)
  scene.add(townG)
  const T = kit(THREE, townKit, townG, swap)
  for (const b of placed) { T.add(b.name, b.x, b.y, b.z, b.yaw); bases.push(b); clear(b.x, b.z, Math.hypot(...half[b.name]) + 1.5) }
  const bYaw = Math.atan2(-B.tz, B.tx)
  for (const k of [-1, 0, 1]) T.add('bridge', B.x + B.tx * 12 * k, R, B.z + B.tz * 12 * k, bYaw)
  const lanterns = []
  const lantern = (x, z) => { const y = ctx.heightAt(x, z); T.add('lantern', x, y, z, 0); bases.push({ x, y, z, name: 'lantern' }); lanterns.push([x, y, z]) }
  for (let s = 8, side = 1; s < LANE[LANE.length - 1].s - 6; s += 13, side = -side) {
    if (Math.abs(s - sB) < 24) continue
    const p = nearestS(LANE, s); lantern(p.x + p.tz * (LW + 1.4) * side, p.z - p.tx * (LW + 1.4) * side)
  }
  for (const k of [-1, 1]) for (const side of [-1, 1]) lantern(B.x + B.tx * 20 * k + B.tz * 3.2 * side, B.z + B.tz * 20 * k - B.tx * 3.2 * side)
  for (let a = 0.4; a < 6.28; a += Math.PI / 2) lantern(TOWN.x + 13 * Math.cos(a), TOWN.z + 13 * Math.sin(a))
  for (const sm of STREETS) for (let s = 10, side = 1; s < sm[sm.length - 1].s; s += 17, side = -side) { const p = nearestS(sm, s); lantern(p.x + p.tz * (LW + 0.9) * side, p.z - p.tx * (LW + 0.9) * side) }
  T.build({ shadow: true, block: true })
  scene.add(smoke(THREE, T.tops, uT, uNight))
  for (const sm of [LANE, ...STREETS]) for (let k = 0; k < sm.length; k += 10) clear(sm[k].x, sm[k].z, LW + 1.5)
  for (let k = 0; k < STREAM.length; k += 10) clear(STREAM[k].x, STREAM[k].z, hwS(STREAM[k].s) + 4)
  clear(TOWN.x, TOWN.z, 17)

  // trees: cypresses up among the houses, round trees along the water and over the hill (one draw call each)
  const treeMat = new THREE.MeshLambertNodeMaterial()
  treeMat.colorNode = vertexColor().rgb
  const painted = (g, f) => { const p = g.attributes.position, c = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) c.set(f(p.getX(i), p.getY(i), p.getZ(i)), i * 3); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g.toNonIndexed() }
  const lump = (g, k) => { g.deleteAttribute('uv'); g = mergeVertices(g); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = 1 + k * Math.sin(x * 2.1 + y * 1.3) * Math.sin(z * 1.9 - y * 0.7); p.setXYZ(i, x * n, y * n, z * n) } g.computeVertexNormals(); return g }
  const cypress = painted(lump(new THREE.LatheGeometry([[0, 0], [0.8, 0.5], [1.25, 2.4], [1.15, 5], [0.75, 7.4], [0.25, 9.4], [0, 10.2]].map(([r, y]) => new THREE.Vector2(r, y)), 9), 0.1),
    (x, y) => [0.025 + 0.012 * y / 10, 0.06 + 0.035 * y / 10, 0.02])
  const roundTree = mergeGeometries([
    painted(new THREE.CylinderGeometry(0.22, 0.36, 3.4, 6).translate(0, 1.7, 0), () => [0.09, 0.06, 0.035]),
    painted(lump(new THREE.IcosahedronGeometry(2.9, 2), 0.16).scale(1, 0.85, 1).translate(0, 5.2, 0), (x, y) => [0.05 + 0.02 * (y - 3), 0.11 + 0.03 * (y - 3), 0.025]),
    painted(lump(new THREE.IcosahedronGeometry(2, 2), 0.2).translate(1.6, 6.6, 0.8), (x, y) => [0.07, 0.15, 0.03]),
  ].map(g => { if (g.attributes.uv) g.deleteAttribute('uv'); return g }))
  const trees = [[], []]
  for (let gx = X0 + 18; gx < X0 + S - 18; gx += 7) for (let gz = Z0 + 18; gz < Z0 + S - 18; gz += 7) {
    const x = gx + (rand() - 0.5) * 6, z = gz + (rand() - 0.5) * 6, dT = Math.hypot(x - TOWN.x, z - TOWN.z)
    if (dT > 165) continue
    let dS = 1e9
    for (let k = 0; k < STREAM.length; k += 8) dS = Math.min(dS, Math.hypot(STREAM[k].x - x, STREAM[k].z - z) - hwS(STREAM[k].s))
    const nearHouse = placed.some(h => Math.hypot(h.x - x, h.z - z) < Math.hypot(...half[h.name]) + 9)
    const pr = 0.04 + (dS > 9 && dS < 18 ? 0.35 : 0) + (z > 585 ? 0.4 : 0) + (nearHouse ? 0.22 : 0)
    if (rand() > pr || dS < 8 || at(grass, x, z) < 0.98) continue
    if (placed.some(h => Math.hypot(h.x - x, h.z - z) < Math.hypot(...half[h.name]) + 1.5) || lanterns.some(([lx, , lz]) => Math.hypot(lx - x, lz - z) < 2.5)) continue
    trees[nearHouse || (z > 585 && rand() < 0.4) ? 0 : 1].push([x, z])
  }
  // one InstancedMesh per tree kind under a settlement group (cypress 0, round 1)
  const plant = (group, list, k) => {
    const im = new THREE.InstancedMesh(k ? roundTree : cypress, treeMat, list.length), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0)
    list.forEach(([x, z], i) => {
      const sc = 0.75 + rand() * 0.6
      im.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x - group.position.x, ctx.heightAt(x, z) - 0.2, z - group.position.z), q.setFromAxisAngle(Y, rand() * 6.28), new THREE.Vector3(sc, sc * (0.85 + rand() * 0.3), sc)))
      clear(x, z, 2.5)
    })
    im.computeBoundingSphere()
    im.castShadow = im.receiveShadow = true
    group.add(im)
  }
  trees.forEach((list, k) => plant(townG, list, k))

  // warm pools of lamplight on the ground at night
  const poolMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })
  {
    const r = saturate(float(1).sub(length(uv().sub(0.5).mul(2))))
    poolMat.colorNode = vec4(lamp.mul(r.mul(r).mul(0.55).mul(dusk)), 1)
  }
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), poolMat, lanterns.length)
  lanterns.forEach(([x, y, z], i) => pools.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, y + 0.12, z), new THREE.Quaternion(), new THREE.Vector3(10, 1, 10))))
  pools.computeBoundingSphere()
  scene.add(pools)

  // ================= Castle Crestwatch =================
  // The headland: a chalk plateau at 44 m on sheer white-grey cliffs, its neck running back to the crest. It joins
  // ctx.heightAt (the higher of it and the land), so the hero, the dragon and the camera all stand on it.
  const crag = (x, z) => {
    const dx = NECK.x - KEEP.x, dz = NECK.z - KEEP.z, L2 = dx * dx + dz * dz
    const u = Math.min(1, Math.max(0, ((x - KEEP.x) * dx + (z - KEEP.z) * dz) / L2)), d = Math.hypot(x - KEEP.x - u * dx, z - KEEP.z - u * dz)
    const a = Math.atan2(z - KEEP.z, x - KEEP.x)
    const Rr = lerp(76, 30, ss(0.15, 0.8, u)) * (1 + 0.09 * Math.sin(3 * a + 1.2) + 0.05 * Math.sin(7 * a + 0.4) + 0.025 * Math.sin(17 * a))
    const top = lerp(42 + 14 * ss(Rr * 0.95, Rr * 0.3, d), 22, ss(0.45, 1, u)) // a green hill on the cliffs, highest under the keep
    const e = (d - Rr) / 24
    if (e >= 1) return -1e9
    if (e <= 0) return top
    return lerp(top, -52, Math.pow(e + 0.05 * Math.sin(e * 9.4), 0.85)) // two ledges in the face
  }
  const landAt = ctx.heightAt
  const hill = (x, z) => { // Asterhaven's hill, and its coast dropping west to the sea
    const d = Math.hypot(x - CITY.x, z - CITY.z)
    return d > 1400 ? 0 : 46 * Math.exp(-((d / 175) ** 2)) - 18 * ss(-1690, -1750, x + 20 * Math.sin(z * 0.013)) * ss(1100, 700, Math.abs(z - CITY.z))
  }
  // the bridge deck is ground too: 36 m along the lane, 4.4 m wide, level at R (he used to fall through into the stream)
  // shortcut: one height per (x, z), so wading under the arches pops him onto the deck; give the hero a y-aware ground if the stream bed becomes a path
  const deck = (x, z) => { const dx = x - B.x, dz = z - B.z; return Math.abs(dx * B.tx + dz * B.tz) < 18 && Math.abs(dx * B.tz - dz * B.tx) < 2.2 ? R : -1e9 }
  ctx.heightAt = (x, z) => Math.max(landAt(x, z), crag(x, z), deck(x, z)) + hill(x, z)

  {
    const x0 = KEEP.x - 112, z0 = KEEP.z - 108, w = 224, d = NECK.z + 8 - z0
    const g = new THREE.PlaneGeometry(w, d, w / 2, Math.round(d / 2)).rotateX(-Math.PI / 2).translate(x0 + w / 2, 0, z0 + d / 2)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) p.setY(i, Math.max(-56, crag(p.getX(i), p.getZ(i))))
    g.computeVertexNormals()
    const n = g.attributes.normal, col = new Float32Array(p.count * 3), c = new THREE.Color()
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), x = p.getX(i), z = p.getZ(i), band = 0.85 + 0.12 * Math.sin(y * 1.7 + Math.sin(x * 0.2 + z * 0.13) * 1.5) + 0.06 * Math.sin(y * 5.3)
      c.setRGB(0.47 * band, 0.46 * band, 0.42 * band).lerp(new THREE.Color(0.13, 0.14, 0.13), ss(-20, -45, y)) // chalk, wet and dark at the foot
      c.lerp(new THREE.Color(0.06, 0.11, 0.03), ss(0.62, 0.86, n.getY(i))) // turf on top and on the ledges
      c.toArray(col, i * 3)
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const m = new THREE.MeshLambertNodeMaterial()
    m.colorNode = vertexColor().rgb
    const mesh = new THREE.Mesh(g, m)
    mesh.receiveShadow = true
    scene.add(mesh)
  }

  const castleG = new THREE.Group()
  castleG.position.set(KEEP.x, 0, KEEP.z)
  scene.add(castleG)
  const C = kit(THREE, castleKit, castleG, swap)
  const cy = (x, z) => ctx.heightAt(KEEP.x + x, KEEP.z + z)
  const piece = (name, x, z, yaw = 0, s = 1) => { const y = cy(x, z); C.add(name, KEEP.x + x, y, KEEP.z + z, yaw, s); bases.push({ x: KEEP.x + x, y, z: KEEP.z + z, name }) }
  // the curtain: gatehouse to the land (+z), seven towers round the keep, wall runs between them
  const towers = [['tower_round', -28, 42, 5.5], ['tower_round', -52, 10, 5.5], ['tower_square', -46, -30, 4.5], ['tower_round', -10, -52, 5.5],
    ['tower_round', 30, -44, 5.5], ['tower_square', 54, -8, 4.5], ['tower_round', 42, 38, 5.5]]
  const ring = [[-10, 44, 0], ...towers.map(([, x, z, r]) => [x, z, r]), [10, 44, 0]]
  piece('gatehouse', 0, 44)
  for (const [name, x, z] of towers) piece(name, x, z, Math.atan2(x, z))
  for (let k = 0; k < ring.length - 1; k++) {
    const [ax, az, ar] = ring[k], [bx, bz, br] = ring[k + 1], L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L
    const len = L - ar - br + 1, n = Math.max(1, Math.round(len / 10)), sx = len / n / 10
    let yaw = Math.atan2(-uz, ux)
    if (-uz * (ax + bx) + ux * (az + bz) < 0) yaw += Math.PI // local +Z (the merlons) must face out
    for (let i = 0; i < n; i++) {
      const f = (ar - 0.5 + (i + 0.5) * len / n) / L, x = ax + (bx - ax) * f, z = az + (bz - az) * f
      piece('wall', x, z, yaw, new THREE.Vector3(sx, 1, 1))
    }
  }
  piece('keep', 0, -6)
  const keepY = cy(0, -6)
  for (const [x, y, z] of [[-7, 34, 9.2], [7, 34, 9.2]]) C.add('banner', KEEP.x + x, keepY + y, KEEP.z + z - 6)
  for (const x of [-6.5, 6.5]) C.add('banner', KEEP.x + x, cy(0, 44) + 21, KEEP.z + 51.2)
  C.build({ block: true })
  clear(KEEP.x, KEEP.z, 80)
  { // trees on the castle hill outside the curtain, none on the cliff lip or across the road from the gate
    const list = [[], []]
    for (let k = 0; k < 90; k++) {
      const a = rand() * Math.PI * 2, r = 58 + rand() * 20, lx = r * Math.cos(a), lz = r * Math.sin(a), x = KEEP.x + lx, z = KEEP.z + lz
      if ((lz > 30 && Math.abs(lx) < 12) || [0, 1.6, 3.2, 4.7].some(b => crag(x + 4 * Math.cos(b), z + 4 * Math.sin(b)) < 38)) continue
      list[rand() < 0.3 ? 0 : 1].push([x, z])
    }
    list.forEach((l, k) => plant(castleG, l, k))
  }

  // the beacon on the keep: the one warm light on the north cliffs
  const beaconMat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
  {
    const r = saturate(float(1).sub(length(uv().sub(0.5).mul(2))))
    const flick = sin(uT.mul(13)).mul(0.08).add(sin(uT.mul(7.3)).mul(0.07)).add(1)
    beaconMat.colorNode = vec4(vec3(1, 0.36, 0.07).mul(pow(r, 1.8)).mul(uNight.mul(7).add(0.1)).mul(flick), 1)
  }
  const beacon = new THREE.Sprite(beaconMat)
  beacon.position.set(KEEP.x, keepY + 44, KEEP.z - 6 + 9)
  beacon.scale.setScalar(13)
  scene.add(beacon)

  // the road from the gate along the neck and down the crest toward the meadow
  {
    const roadSm = sample(curveOf(THREE, [[KEEP.x, KEEP.z + 52], [KEEP.x + 8, KEEP.z + 110], [NECK.x, NECK.z], [-104, -186], [-84, -158]]), 2)
    const m = new THREE.MeshLambertNodeMaterial({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    m.colorNode = vec3(0.3, 0.26, 0.2).mul(mx_noise_float(positionWorld.xz.mul(0.4)).mul(0.1).add(1))
    const mesh = new THREE.Mesh(strip(THREE, roadSm, 2.4, onGround(0.15)), m)
    mesh.receiveShadow = true
    scene.add(mesh)
  }

  // ================= Asterhaven (far detail) =================
  // A walled hill of a few hundred merged houses climbing to a domed palace, ships in the bay below. Seen across the island
  // at 1.5 km+, so houses are plain boxes with gable roofs and window quads, all in one mesh.
  const rng = (s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)(7)
  const pos = [], nor = [], col = [], glow = []
  const quad = (a, b, c, d, rgb, gl = 0) => { // corners counter-clockwise seen from outside
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize()
    for (const v of [a, b, c, a, c, d]) pos.push(v.x, v.y, v.z), nor.push(n.x, n.y, n.z), col.push(...rgb), glow.push(gl)
  }
  const V = (x, y, z) => new THREE.Vector3(x, y, z)
  let houses = 0
  const cityHouse = (x, z, yaw, w, d, h, wall, roof) => {
    const y = ctx.heightAt(x, z), c = Math.cos(yaw), s = Math.sin(yaw), y0 = y - 3, y1 = y + h, y2 = y1 + d * 0.42
    const P3 = (lx, ly, lz) => V(x + lx * c + lz * s, ly, z - lx * s + lz * c)
    const hw = w / 2, hd = d / 2
    quad(P3(-hw, y0, hd), P3(hw, y0, hd), P3(hw, y1, hd), P3(-hw, y1, hd), wall) // front
    quad(P3(hw, y0, -hd), P3(-hw, y0, -hd), P3(-hw, y1, -hd), P3(hw, y1, -hd), wall)
    quad(P3(hw, y0, hd), P3(hw, y0, -hd), P3(hw, y2, 0), P3(hw, y1, hd), wall) // gable ends (quad + its triangle)
    quad(P3(hw, y0, -hd), P3(hw, y1, -hd), P3(hw, y2, 0), P3(hw, y2, 0), wall)
    quad(P3(-hw, y0, -hd), P3(-hw, y0, hd), P3(-hw, y2, 0), P3(-hw, y1, -hd), wall)
    quad(P3(-hw, y0, hd), P3(-hw, y1, hd), P3(-hw, y2, 0), P3(-hw, y2, 0), wall)
    quad(P3(-hw - 0.3, y1 - 0.2, hd + 0.4), P3(hw + 0.3, y1 - 0.2, hd + 0.4), P3(hw + 0.3, y2, 0), P3(-hw - 0.3, y2, 0), roof)
    quad(P3(hw + 0.3, y1 - 0.2, -hd - 0.4), P3(-hw - 0.3, y1 - 0.2, -hd - 0.4), P3(-hw - 0.3, y2, 0), P3(hw + 0.3, y2, 0), roof)
    for (let f = 1; f * 3.2 < h; f++) for (const lx of [-hw * 0.45, hw * 0.45]) for (const sd of [1, -1]) {
      const wy = y1 - h + f * 3.2 - 1.6
      if (wy < y + 0.8) continue
      quad(P3(lx - 0.45 * sd, wy, (hd + 0.05) * sd), P3(lx + 0.45 * sd, wy, (hd + 0.05) * sd), P3(lx + 0.45 * sd, wy + 1.3, (hd + 0.05) * sd), P3(lx - 0.45 * sd, wy + 1.3, (hd + 0.05) * sd), [0.03, 0.03, 0.03], 1)
    }
    bases.push({ x, y, z, name: 'city' })
    houses++
  }
  for (let r = 66; r < 250; r += 11) for (let a = rng() * 0.2; a < Math.PI * 2; a += 11.5 / r * (0.85 + rng() * 0.3)) {
    if (r > 196 && Math.abs(Math.atan2(Math.sin(a), Math.cos(a)) - Math.PI) > 0.9 && Math.abs(Math.atan2(Math.sin(a), Math.cos(a)) + Math.PI) > 0.9) continue // outside the wall only the harbour quarter (west)
    if (r > 190 && r < 206) continue // the wall
    if (rng() > 0.55) continue
    const x = CITY.x + r * Math.cos(a), z = CITY.z + r * Math.sin(a)
    if (ctx.heightAt(x, z) < 1) continue // not in the sea
    const k = rng(), wall = [0.5 + 0.12 * k, 0.45 + 0.1 * k, 0.36 + 0.06 * k], roof = rng() < 0.7 ? [0.42, 0.13 + 0.05 * k, 0.07] : [0.17, 0.19, 0.23]
    cityHouse(x, z, -a + Math.PI / 2 + (rng() - 0.5) * 0.3, 6 + rng() * 4, 7 + rng() * 4, 6 + rng() * 5 + (190 - Math.min(r, 190)) * 0.04, wall, roof)
  }
  // ships riding in the bay: hull, three masts, sails
  for (let k = 0; k < 7; k++) {
    const x = CITY.x - 290 - (k % 3) * 45 - rng() * 20, z = CITY.z - 120 + k * 42 + rng() * 10, yaw = rng() * 6.28, c = Math.cos(yaw), s = Math.sin(yaw)
    const P3 = (lx, ly, lz) => V(x + lx * c + lz * s, ly, z - lx * s + lz * c), hull = [0.17, 0.11, 0.07], sail = [0.8, 0.78, 0.7]
    quad(P3(-13, -1.5, 3.5), P3(13, -1.5, 3.5), P3(13, 3, 3.5), P3(-13, 3, 3.5), hull)
    quad(P3(13, -1.5, -3.5), P3(-13, -1.5, -3.5), P3(-13, 3, -3.5), P3(13, 3, -3.5), hull)
    quad(P3(-13, 3, 3.5), P3(13, 3, 3.5), P3(13, 3, -3.5), P3(-13, 3, -3.5), [0.25, 0.18, 0.12])
    for (const mx of [-7, 0, 7]) {
      quad(P3(mx - 0.3, 3, 0.3), P3(mx + 0.3, 3, 0.3), P3(mx + 0.3, 24, 0.3), P3(mx - 0.3, 24, 0.3), hull)
      for (const [y0, y1, w] of [[6, 13, 5], [14, 20, 4]]) for (const sd of [1, -1]) quad(P3(mx - w * sd, y0, 0.4 * sd), P3(mx + w * sd, y0, 0.4 * sd), P3(mx + w * 0.85 * sd, y1, 0.4 * sd), P3(mx - w * 0.85 * sd, y1, 0.4 * sd), sail)
    }
    quad(P3(-13.2, 4, 0.6), P3(-13.2, 4, -0.6), P3(-13.2, 5.2, -0.6), P3(-13.2, 5.2, 0.6), [0.03, 0.03, 0.03], 1) // stern lamp
  }
  {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(glow, 1))
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0, side: THREE.DoubleSide })
    const gl = attribute('aGlow', 'float')
    m.colorNode = vertexColor().rgb
    m.emissiveNode = lamp.mul(gl.mul(step(0.25, rnd)).mul(dusk).mul(3))
    scene.add(new THREE.Mesh(g, m))
  }
  // the city's ground, its bay, its wall, its palace
  scene.add(tile(THREE, ctx, CITY.x - 700, CITY.z - 600, 1200, 1200, 10, groundMat))
  ctx.ground.rects.push([CITY.x - 700, CITY.x + 500, CITY.z - 600, CITY.z + 600]) // so field's far land sinks under it
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2400).rotateX(-Math.PI / 2), new THREE.MeshStandardNodeMaterial({ color: 0x2f5a66, roughness: 0.3 }))
  sea.position.set(CITY.x - 1500, -1.5, CITY.z)
  scene.add(sea)
  const cityG = new THREE.Group()
  cityG.position.set(CITY.x, 0, CITY.z)
  scene.add(cityG)
  const A = kit(THREE, castleKit, cityG, swap)
  const ap = (name, x, z, yaw = 0, s = 1) => { const y = ctx.heightAt(x, z); A.add(name, x, y, z, yaw, s); bases.push({ x, y, z, name }) }
  for (let k = 0; k < 126; k++) {
    const a = k / 126 * Math.PI * 2, x = CITY.x + 198 * Math.cos(a), z = CITY.z + 198 * Math.sin(a)
    if (k % 9 === 0) ap('tower_round', x, z, -a + Math.PI / 2)
    else ap('wall', x, z, -a - Math.PI / 2 + Math.PI, new THREE.Vector3(1.0, 1, 1))
  }
  ap('keep', CITY.x - 18, CITY.z, Math.PI / 2) // the palace: its hall to the meadow side (east), the dome beside it
  for (const [x, z] of [[-46, -34], [-46, 34], [52, -36], [52, 36]]) ap('tower_round', CITY.x + x, CITY.z + z)
  A.build()
  const domeMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0 })
  domeMat.colorNode = vec3(0.78, 0.72, 0.6)
  domeMat.emissiveNode = vec3(1, 0.7, 0.4).mul(dusk.mul(0.35))
  const topY = ctx.heightAt(CITY.x + 26, CITY.z)
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(14, 15, 22, 32).translate(0, 11, 0), stoneOf(castleKit, 'stone'))
  const dome = new THREE.Mesh(new THREE.SphereGeometry(14.5, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 22, 0), domeMat)
  for (const o of [drum, dome]) { o.position.set(CITY.x + 26, topY - 2, CITY.z); scene.add(o) }
  clear(CITY.x, CITY.z, 260)

  const createMs = Math.round(performance.now() - t0)
  const r2 = v => Math.round(v * 100) / 100
  window.__probes.settlements = () => {
    let gap = 0, worst = null
    for (const b of bases) { const e = Math.abs(b.y - ctx.heightAt(b.x, b.z)); if (e > gap) gap = e, worst = b.name }
    return {
      bridge: { x: +B.x.toFixed(1), z: +B.z.toFixed(1), tx: +B.tx.toFixed(3), tz: +B.tz.toFixed(3), deck: +R.toFixed(2), bed: +landAt(B.x, B.z).toFixed(2) },
      settlements: 3, springwell: { houses: placed.filter(b => !['market', 'well', 'church'].includes(b.name)).length, trees: trees.map(l => l.length), lanterns: lanterns.length, chimneys: T.tops.length, bridgeDeck: r2(R), water: [r2(Wl[0]), r2(Wl[Wl.length - 1])], patchEdge: r2(edge) },
      crestwatch: { at: [KEEP.x, KEEP.z], plateau: r2(cy(0, 0)), towers: towers.length, bearingDeg: r2(Math.atan2(-KEEP.x, -KEEP.z + 6) * 180 / Math.PI) },
      asterhaven: { at: [CITY.x, CITY.z], houses }, bases: bases.length, maxBaseGap: r2(gap), worst, night: r2(uNight.value), lamps: r2(uLamps.value), createMs,
    }
  }

  return {
    update(dt, tt) {
      uT.value = tt
      uNight.value = ctx.night
      uLamps.value = Math.max(ss(0.03, 0.45, ctx.night), ss(0.26, 0.08, ctx.sunDir.y))
      uSky.value.copy(ctx.fogColor)
    },
  }
}
