// Wave F lane drift: things on the wind. Petals shed from bellflowers, leaves from the groves, seed tufts lifted out of the
// grass by gusts. Each tumbles (cupped / folded shapes, so one side is lit and one is not), follows ctx.windAt (the grass's
// wind), lands, and shrinks away. Three InstancedMeshes, scene-lit, CPU-steered (<= 130 pieces).
// ?drift=off removes them; ?drift=demo forces a steady gust and a dense fall in front of the camera (for shots).
import { MeshStandardNodeMaterial } from 'three/webgpu'

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const POOL = { petal: 70, leaf: 30, seed: 40 }
// Bellflower colours of refs/world/mix-day.png: lilac-violet and blush pink.
const PETAL = [[0.7, 0.58, 0.92], [0.78, 0.6, 0.95], [0.95, 0.68, 0.86], [0.98, 0.74, 0.8]]
const LEAF = [[0.55, 0.7, 0.18], [0.7, 0.72, 0.2], [0.85, 0.7, 0.2], [0.45, 0.62, 0.2]]
const R = 34 // spawn radius round the hero (m)

// Outline by rows along the length: half-width profile w(s), z(x) bends it (cup for a petal, fold for a leaf).
function blade(THREE, L, W, prof, bend) {
  const rows = 7, pos = [], idx = []
  for (let i = 0; i <= rows; i++) {
    const s = i / rows, w = W * prof(s)
    for (const sx of [-1, 1]) pos.push(sx * w, s * L - L / 2, bend(sx * prof(s), s) * L)
  }
  for (let i = 0; i < rows; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals()
  return g
}

export async function createDrift(ctx) {
  const { THREE, scene, heroPos, params, camera } = ctx
  const mode = params.get('drift')
  if (mode === 'off') return null
  const demo = mode === 'demo'
  const rnd = (a, b) => a + Math.random() * (b - a)
  const forced = { day: 0, dusk: 0.6, night: 1 }[params.get('tod')]
  const night = () => forced ?? ctx.night ?? 0

  const geos = {
    petal: blade(THREE, 0.2, 0.075, s => Math.sqrt(s) * Math.sqrt(1 - Math.pow(s, 2.6)), x => 0.35 * x * x),
    leaf: blade(THREE, 0.26, 0.07, s => Math.sin(Math.PI * Math.pow(s, 0.75)), x => -0.25 * Math.abs(x)),
  }
  { // seed tuft: a pale stalk with a fan of thin spokes
    const pos = [], idx = []
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), n = pos.length / 3
      pos.push(0, 0, 0, c * 0.05 - s * 0.004, s * 0.05, 0.03, c * 0.05 + s * 0.004, s * 0.05, 0.03)
      idx.push(n, n + 1, n + 2)
    }
    const n = pos.length / 3
    pos.push(-0.003, 0, 0, 0.003, 0, 0, 0, 0, -0.07); idx.push(n, n + 1, n + 2)
    geos.seed = new THREE.BufferGeometry()
    geos.seed.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geos.seed.setIndex(idx); geos.seed.computeVertexNormals()
  }
  const meshes = {}, pieces = []
  for (const k of Object.keys(POOL)) {
    const mat = new MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0, side: THREE.DoubleSide })
    const m = new THREE.InstancedMesh(geos[k], mat, POOL[k])
    m.frustumCulled = false; m.castShadow = true
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    const M0 = new THREE.Matrix4().makeScale(0, 0, 0), c = new THREE.Color(1, 1, 1)
    for (let i = 0; i < POOL[k]; i++) { m.setMatrixAt(i, M0); m.setColorAt(i, c); pieces.push({ k, i, m, on: false }) }
    scene.add(m); meshes[k] = m
  }

  const dir = new THREE.Vector3()
  const gy = (x, z) => ctx.heightAt(x, z)
  const wind = (x, z, t) => ctx.windAt?.(x, z, t) ?? { x: 1, y: 0.3 }
  const free = k => pieces.find(p => p.k === k && !p.on)
  // Where the camera looks, so the fall is where it is seen: weight a candidate by how far in front it is.
  const seen = (x, z) => { camera.getWorldDirection(dir); const dx = x - camera.position.x, dz = z - camera.position.z; return dx * dir.x + dz * dir.z > -3 }

  function launch(p, x, y, z, kind, t) {
    const c = new THREE.Color(...(kind === 'petal' ? PETAL : kind === 'leaf' ? LEAF : [[1, 0.98, 0.92]])[Math.floor(Math.random() * (kind === 'seed' ? 1 : 4))])
    p.m.setColorAt(p.i, c); p.m.instanceColor.needsUpdate = true
    Object.assign(p, { on: true, x, y, z, vx: 0, vz: 0, vy: kind === 'seed' ? 1.4 : 0, age: 0, landed: 0,
      life: kind === 'seed' ? rnd(9, 15) : 60, f: rnd(1.3, 2.6), ph: rnd(0, 6.3), ph2: rnd(0, 6.3), yaw: rnd(0, 6.3), spin: rnd(-2.5, 2.5),
      size: kind === 'seed' ? rnd(1.6, 2.4) : kind === 'leaf' ? rnd(0.8, 1.5) : rnd(0.7, 1.3) })
    const w = wind(x, z, t); p.vx = w.x * 0.3; p.vz = w.y * 0.3
  }

  const E = new THREE.Euler(0, 0, 0, 'YXZ'), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), M = new THREE.Matrix4()
  let acc = { petal: 0, leaf: 0, seed: 0 }, gust = 0, alive = 0
  const sq = Math.sqrt

  function spawn(dt, t, g, n) {
    const mul = (demo ? 4 : 1 + 6 * g) * (1 - 0.8 * ss(0.1, 0.9, n)) // few at night, a flurry in a gust
    acc.petal += dt * 0.9 * mul; acc.leaf += dt * 0.6 * mul; acc.seed += dt * (demo ? 5 : 7) * ss(0.25, 0.8, g) * (1 - n)
    const f = ctx.flora
    const bells = f ? f.solids.slice(0, f.solids.length - f.trees.length) : []
    for (let tries = 0; acc.petal >= 1 && tries < 6; tries++) {
      const b = bells[Math.floor(Math.random() * bells.length)]; if (!b) break
      if (Math.hypot(b.x - heroPos.x, b.z - heroPos.z) > R || !seen(b.x, b.z)) continue
      const p = free('petal'); if (!p) break
      const s = b.r / 1.6, a = rnd(0, 6.3), d = rnd(0.3, 1.0) * s
      launch(p, b.x + Math.cos(a) * d, gy(b.x, b.z) + rnd(1.6, 2.7) * s, b.z + Math.sin(a) * d, 'petal', t); acc.petal--
    }
    if (acc.petal > 2) acc.petal = 2
    const trees = (f?.trees ?? []).filter(T => Math.hypot(T.x - heroPos.x, T.z - heroPos.z) < T.r + 40)
    for (let tries = 0; acc.leaf >= 1 && tries < 4; tries++) {
      let x, y, z
      if (demo) { camera.getWorldDirection(dir); const d = rnd(4, 14), a = rnd(-0.5, 0.5), c = Math.cos(a), s = Math.sin(a); x = camera.position.x + (dir.x * c - dir.z * s) * d; z = camera.position.z + (dir.x * s + dir.z * c) * d; y = gy(x, z) + rnd(2.5, 5) }
      else {
        const T = trees[Math.floor(Math.random() * trees.length)]; if (!T) break
        const a = rnd(0, 6.3), d = T.r * 0.9 * sq(Math.random()); x = T.x + Math.cos(a) * d; z = T.z + Math.sin(a) * d
        y = gy(x, z) + (T.top - gy(T.x, T.z)) * rnd(0.4, 0.75)
      }
      const p = free('leaf'); if (!p) break
      launch(p, x, y, z, 'leaf', t); acc.leaf--
    }
    if (acc.leaf > 2) acc.leaf = 2
    for (let tries = 0; acc.seed >= 1 && tries < 6; tries++) {
      camera.getWorldDirection(dir)
      const a = Math.atan2(dir.x, dir.z) + rnd(-0.8, 0.8), d = rnd(3, 26), x = heroPos.x + Math.sin(a) * d, z = heroPos.z + Math.cos(a) * d
      const p = free('seed'); if (!p) break
      launch(p, x, gy(x, z) + 0.2, z, 'seed', t); acc.seed--
    }
    if (acc.seed > 2) acc.seed = 2
  }

  function update(dt, t) {
    const n = night(), w0 = wind(heroPos.x, heroPos.z, t), g = demo ? 1 : ss(2.2, 6, Math.hypot(w0.x, w0.y))
    gust = g
    spawn(dt, t, g, n)
    alive = 0
    for (const p of pieces) {
      if (!p.on) continue
      alive++
      p.age += dt
      const w = wind(p.x, p.z, t), kw = p.k === 'seed' ? 0.8 : p.k === 'leaf' ? 0.35 : 0.5, gh = gy(p.x, p.z)
      let sc = p.size
      if (!p.landed) {
        const r = 1 - Math.exp(-dt * 1.4)
        p.vx += (w.x * kw - p.vx) * r; p.vz += (w.y * kw - p.vz) * r
        // petals and leaves sink with a rocking pause; seeds shoot up with the gust then ease down
        const sink = p.k === 'seed' ? -0.22 + 1.4 * Math.exp(-p.age / 2.4) : -(p.k === 'leaf' ? 0.7 : 0.55) * (0.65 + 0.35 * Math.sin(p.age * p.f * 2 + p.ph))
        p.vy += (sink - p.vy) * (1 - Math.exp(-dt * 3))
        p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt
        if (p.y <= gh + 0.01 || (p.k === 'seed' && p.age > p.life)) {
          p.y = gh + (p.k === 'seed' ? 0.02 : 0.015); p.landed = 0.001
          if ((ctx.pond?.inside(p.x, p.z) ?? 0) > 0) p.landed = 1e3 // dropped on the water: gone
        }
      } else {
        p.landed += dt
        const k = p.k === 'seed' ? 1.5 : 7
        sc *= 1 - ss(k, k + 3.5, p.landed)
        if (p.landed > k + 3.5) { p.on = false; p.m.setMatrixAt(p.i, M.makeScale(0, 0, 0)); p.m.instanceMatrix.needsUpdate = true; continue }
      }
      const air = p.landed ? 0 : 1
      // flat on average (geometry's normal is +z, so -90 deg about x), rocking and yawing while it falls
      const rock = air * Math.min(1, p.age * 3) * (p.k === 'seed' ? 0.5 : 1.15)
      E.set(air * p.spin * p.age + p.yaw, -Math.PI / 2 + rock * Math.sin(p.age * p.f + p.ph), rock * Math.cos(p.age * p.f * 0.8 + p.ph2))
      if (p.k === 'seed') E.x = p.yaw + p.age * 0.8, E.y = -0.2 + 0.4 * Math.sin(p.age * 1.2 + p.ph), E.z = 0
      const lean = p.landed ? 0 : 0
      M.compose(P.set(p.x, p.y + lean, p.z), Q.setFromEuler(E), S.setScalar(sc))
      p.m.setMatrixAt(p.i, M)
    }
    for (const m of Object.values(meshes)) m.instanceMatrix.needsUpdate = true
  }

  window.__probes.drift = () => ({ alive, by: Object.fromEntries(Object.keys(POOL).map(k => [k, pieces.filter(p => p.k === k && p.on).length])), gust: +gust.toFixed(2), night: +night().toFixed(2), demo })
  return { update }
}
