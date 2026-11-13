// Lane flora-place — PLAN.md Phase 6. Bell flowers and spiral ferns in drifts round the meadow's edges (the lake shore, the
// rock's apron, the ring's rim, round the groves), vine-tree groves on the rises, and a composed set framing the start view
// as in refs/world/mix-day.png. One InstancedMesh per model; each frame the CPU keeps only the instances near and in view,
// and feeds each a low-passed ctx.windAt so the plants lean into the same gusts the grass shows. Glow = mask² × ctx.night.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { uniform, vec3, float, attribute, vertexColor, positionLocal, positionWorld, cameraPosition, normalize, dot, smoothstep, mix, clamp } from 'three/tsl'

// glow: emissive colour at full night × power; day: the bells keep a little of it by day (they leak the light they drink);
// lift / trans: sunlight through the leaves by day, all round / when looking toward the sun (×1.5 where the mask is);
// tint: base colour the leaves drift toward under the moon; lean: m the top moves per m/s of wind (× height² along the
// plant); vine: the same for the tree's vines, growing toward their tips; tau: s the plant lags the wind; far: draw range m;
// foot: m (× scale) round the base that must stand on ground — the reach of leaves and bells, a tree's trunk and buttresses.
const KINDS = {
  bellflower: { glow: [1.0, 0.5, 0.14], power: 1.6, day: 0.25, lift: 0.06, trans: 0.25, lean: 0.06, tau: 0.6, far: 260, scale: [0.8, 1.45], foot: 2.8 },
  fern: { glow: [0.6, 0.28, 1.0], power: 1.5, lift: 0.06, trans: 0.15, tint: [0.2, 0.1, 0.36], lean: 0.035, tau: 0.35, far: 180, scale: [1.0, 1.6], foot: 1.4 },
  vinetree: { glow: [0.25, 1.0, 0.65], power: 1.4, lift: 0.04, trans: 0.2, lean: 0.006, vine: 0.09, tau: 1.6, far: 4000, scale: [0.9, 1.25], foot: 8 },
}
// The start view (hero at the origin looking −Z, the rock and lake to the right, the castle 17° left): a giant tree on
// the crest at the left, placed and turned so no vine crosses the castle or the egg, beside Crestwatch's road and beyond
// the dragon's figure-eight, which flies ~15 m up (a nearer tree could not miss all three); bells down the left edge and
// in the left foreground, ferns in both foreground corners, a few bells along the right shore. [kind, x, z, scale, yaw°]
const FRAME = [
  ['vinetree', -121, -180, 1.5, 5],
  ['bellflower', -4.2, -1.5, 1.35, 120], ['bellflower', -6.5, -6, 1.15, 150], ['bellflower', -5, -12, 0.95, 90],
  ['bellflower', -9, -19, 1.2, 160], ['bellflower', -12, -30, 1.0, 130], ['bellflower', -10.5, -44, 1.3, 170],
  ['bellflower', 8, -14, 1.0, 20], ['bellflower', 11, -22, 1.2, 40], ['bellflower', 14, -31, 0.9, 10],
  ['fern', -2.9, 0.6, 1.25, 30], ['fern', -4.6, -3.2, 1.0, 200], ['fern', 3.1, 0.3, 1.4, 250], ['fern', 5.2, -4.5, 1.1, 80],
  ['fern', -7.5, -15, 1.2, 10], ['fern', 9.5, -10, 1.0, 300],
]
const R = 560 // flora grows within this many metres of the start
const OPEN = (x, z) => Math.abs(x) < 9 && z > -75 && z < 25 // the start meadow the hero walks into stays open
// shortcut: the meadow end of Crestwatch's road (settlements.js) typed in here; read a road list if settlements publishes one
const ROAD = [[-84, -158], [-94, -172], [-104, -186], [-110, -200]]
const rnd = (s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)(11)

export async function createFlora(ctx) {
  const { THREE, scene, camera } = ctx
  if (ctx.params.get('flora') === '0') return null // A/B for fps and look
  const loader = new GLTFLoader()
  const names = Object.keys(KINDS)
  const geos = Object.fromEntries((await Promise.all(names.map(n => loader.loadAsync(`${import.meta.env.BASE_URL}models/flora/${n}.glb`))))
    .map((g, i) => { let geo; g.scene.traverse(o => { if (o.isMesh) geo = o.geometry }); return [names[i], geo] }))

  // Ground rects [x0, x1, z0, z1]: field's 800 m terrain plus whatever later modules push (settlements' far tile).
  const inGround = (x, z) => ctx.ground.rects.some(([a, b, c, d]) => x > a && x < b && z > c && z < d)
  // The square of half-side r round (x, z) is on ground when its four corners are (exact for rects that join edge to edge).
  const onGround = (x, z, r) => inGround(x - r, z - r) && inGround(x + r, z - r) && inGround(x - r, z + r) && inGround(x + r, z + r)
  console.assert((ctx.ground.rects.length < 2 || onGround(0, 400, 8)) && !onGround(437, 305, 8) && !onGround(-403, -200, 8) && !onGround(395, 395, 8), 'flora: onGround')

  const H = (x, z) => ctx.heightAt(x, z)
  function free(x, z, r, slope, foot = r) {
    if (Math.hypot(x, z) > R || !onGround(x, z, foot)) return false
    for (const c of ctx.keepClear) if (Math.hypot(x - c.x, z - c.z) < c.r + r) return false
    for (const t of lists.vinetree) if (Math.hypot(x - t.x, z - t.z) < 8 * t.s + r) return false // trunk and buttresses
    for (const [a, b] of ROAD) if (Math.hypot(x - a, z - b) < 6 + r) return false
    if (ctx.pond && ctx.pond.inside(x, z) > 0) return false
    if (H(x, z) < -5) return false // the sea below the cliff
    const s = Math.hypot(H(x + 2, z) - H(x - 2, z), H(x, z + 2) - H(x, z - 2)) / 4
    return s < slope
  }

  const lists = Object.fromEntries(names.map(n => [n, []]))
  const add = (kind, x, z, s, yaw) => lists[kind].push({ x, z, s, yaw })
  for (const [k, x, z, s, yaw] of FRAME) add(k, x, z, s, yaw * Math.PI / 180)
  const pick = k => { const [a, b] = KINDS[k].scale; return a + (b - a) * rnd() }

  // Groves on the rises: grid points standing above the mean of a 45 m ring round them, best first, 170 m apart;
  // none within 100 m of the start or in its vista (−28° … +40° of straight ahead) or across the dragon's figure-eight, which flies ~15 m up.
  const bearing = (x, z) => Math.atan2(x, -z) * 180 / Math.PI
  const cand = []
  for (let gx = -R; gx <= R; gx += 30) for (let gz = -R; gz <= R; gz += 30) {
    const x = gx + (rnd() - 0.5) * 20, z = gz + (rnd() - 0.5) * 20, b = bearing(x, z)
    if ((b > -28 && b < 40) || Math.hypot(x, z) < 100) continue // and none round the start: a canopy reaches ~34 m
    if (x > -150 && x < 40 && z > -150 && z < -45) continue
    if (!free(x, z, 16, 0.12)) continue
    let ring = 0, low = 0
    for (let a = 0; a < 8; a++) { const h = H(x + 45 * Math.cos(a * Math.PI / 4), z + 45 * Math.sin(a * Math.PI / 4)); ring += h / 8; low = Math.min(low, h) }
    const rise = H(x, z) - ring
    if (rise > 0.4 && low > -5) cand.push({ x, z, rise: rise + rnd() }) // low: a cliff lip is not a rise
  }
  cand.sort((a, b) => b.rise - a.rise)
  const groves = []
  for (const c of cand) {
    if (groves.length === 7) break
    if (groves.some(g => Math.hypot(g.x - c.x, g.z - c.z) < 170)) continue
    groves.push(c)
    add('vinetree', c.x, c.z, pick('vinetree'), rnd() * 6.28)
    for (let i = 0, n = 1 + Math.floor(rnd() * 3), tries = 0; i < n && tries < 20; tries++) {
      const a = rnd() * 6.28, d = 26 + rnd() * 12, x = c.x + d * Math.cos(a), z = c.z + d * Math.sin(a)
      if (free(x, z, 16, 0.12) && lists.vinetree.every(t => Math.hypot(t.x - x, t.z - z) > 24)) add('vinetree', x, z, pick('vinetree'), rnd() * 6.28), i++
    }
  }
  const trees = lists.vinetree

  // Drifts: a centre on a rim (2–12 m outside a keepClear circle: shore, rock, ring, houses), round a tree, or anywhere
  // (weighted toward the start); then a clump of 3–9 round it, spaced so heads do not merge.
  const rims = ctx.keepClear.filter(c => Math.hypot(c.x, c.z) < 400), rimW = rims.reduce((a, c) => a + c.r, 0)
  const rim = () => { let w = rnd() * rimW; return rims.find(c => (w -= c.r) < 0) || rims[0] } // big features (lake, rock, ring) draw more
  function drifts(kind, n, spread, gap) {
    const list = lists[kind]
    for (let d = 0, tries = 0; d < n && tries < n * 30; tries++) {
      const m = rnd()
      let cx, cz
      if (m < 0.45 && rims.length) { const c = rim(), a = rnd() * 6.28, r = c.r + 2 + rnd() * 10; cx = c.x + r * Math.cos(a); cz = c.z + r * Math.sin(a) }
      else if (m < 0.7 && trees.length) { const t = trees[Math.floor(rnd() * trees.length)], a = rnd() * 6.28, r = t.s * (9 + rnd() * 20); cx = t.x + r * Math.cos(a); cz = t.z + r * Math.sin(a) }
      else { const a = rnd() * 6.28, r = R * rnd() ** 1.6; cx = r * Math.sin(a); cz = -r * Math.cos(a) }
      if (OPEN(cx, cz) || !free(cx, cz, 1, 0.35)) continue
      d++
      for (let i = 0, k = 3 + Math.floor(rnd() * 7); i < k; i++) {
        const x = cx + (rnd() + rnd() - 1) * spread, z = cz + (rnd() + rnd() - 1) * spread
        if (OPEN(x, z) || !free(x, z, 0.5, 0.35, KINDS[kind].foot * KINDS[kind].scale[1]) || list.some(p => Math.abs(p.x - x) < gap && Math.abs(p.z - z) < gap)) continue
        add(kind, x, z, pick(kind), rnd() * 6.28)
      }
    }
  }
  drifts('bellflower', 140, 7, 2.2)
  drifts('fern', 160, 5, 1.3)

  // One InstancedMesh per kind; per-instance aBend (m/s of wind, low-passed + the plant's own sway) bends it.
  const uNight = uniform(0), uDay = uniform(1), uSun = uniform(new THREE.Vector3())
  const back = smoothstep(0.2, 1, dot(normalize(positionWorld.sub(cameraPosition)), uSun)) // looking through a leaf at the sun
  const kinds = names.map(name => {
    const cfg = KINDS[name], geo = geos[name].clone(), list = lists[name]
    geo.computeBoundingBox(); geo.computeBoundingSphere()
    const top = geo.boundingBox.max.y, bs = geo.boundingSphere
    const bend = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 2), 2).setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('aBend', bend)
    const vc = vertexColor(), mask = geo.attributes._glow ? attribute('_glow', 'float') : vc.a, m2 = mask.mul(mask)
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: name === 'vinetree' ? 0.85 : 0.6, metalness: 0, side: THREE.DoubleSide })
    mat.colorNode = cfg.tint ? mix(vc.rgb, vec3(...cfg.tint), uNight.mul(0.55)) : vc.rgb
    const through = vc.rgb.mul(back.mul(cfg.trans).add(cfg.lift)).mul(mask.mul(0.5).add(1)).mul(uDay)
    mat.emissiveNode = vec3(...cfg.glow).mul(m2).mul(uNight.mul(cfg.power).add(uDay.mul(cfg.day || 0))).add(through)
    const y = attribute('position', 'vec3').y, hn = y.div(top)
    let k = hn.mul(hn).mul(cfg.lean)
    if (cfg.vine) k = k.add(mask.mul(clamp(float(20).sub(y).div(16), 0, 1)).mul(cfg.vine)) // vines swing more toward their tips
    const b = attribute('aBend', 'vec2')
    mat.positionNode = positionLocal.add(vec3(b.x, 0, b.y).mul(k))
    const mesh = new THREE.InstancedMesh(geo, mat, list.length)
    mesh.frustumCulled = false // culled per instance below
    mesh.castShadow = mesh.receiveShadow = true
    scene.add(mesh)
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), S = new THREE.Vector3(), P = new THREE.Vector3()
    for (const p of list) {
      p.y = H(p.x, p.z)
      p.m = M.compose(P.set(p.x, p.y, p.z), q.setFromAxisAngle(Y, p.yaw), S.setScalar(p.s)).toArray()
      p.cy = p.y + bs.center.y * p.s; p.r = (bs.radius + Math.hypot(bs.center.x, bs.center.z)) * p.s
      p.wx = p.wz = 0; p.f = 1.1 + rnd() * 1.4; p.ph = rnd() * 6.28
    }
    return { name, cfg, mesh, bend, list, top }
  })

  const frustum = new THREE.Frustum(), PV = new THREE.Matrix4(), sphere = new THREE.Sphere()
  function update(dt, t) {
    uNight.value = ctx.night
    uSun.value.copy(ctx.sunDir)
    uDay.value = THREE.MathUtils.clamp(ctx.sunDir.y * 4 + 0.35, 0, 1) * (1 - ctx.night) // the sun's strength on the leaves
    frustum.setFromProjectionMatrix(PV.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    const cx = camera.position.x, cz = camera.position.z
    for (const K of kinds) {
      const a = 1 - Math.exp(-dt / K.cfg.tau), arr = K.mesh.instanceMatrix.array, bb = K.bend.array
      let n = 0
      for (const p of K.list) {
        const w = ctx.windAt(p.x, p.z, t)
        p.wx += (w.x - p.wx) * a; p.wz += (w.y - p.wz) * a
        const d = Math.hypot(p.x - cx, p.z - cz)
        if (d - p.r > K.cfg.far) continue
        if (d > 25 + p.r && !frustum.intersectsSphere(sphere.set(sphere.center.set(p.x, p.cy, p.z), p.r * 1.2))) continue
        const f = Math.sin(t * p.f + p.ph) * (0.5 + 0.12 * Math.hypot(p.wx, p.wz)) // its own sway, livelier in a gust
        for (let i = 0; i < 16; i++) arr[n * 16 + i] = p.m[i]
        bb[n * 2] = p.wx - 0.34 * f; bb[n * 2 + 1] = p.wz + 0.94 * f
        n++
      }
      K.mesh.count = n
      K.mesh.instanceMatrix.needsUpdate = K.bend.needsUpdate = true
    }
  }
  update(0, 0)
  // For whoever flies or walks among them (the dragon's figure-eight is ~15 m up; a tree stands 29–40 m): trunk, canopy, top.
  // treeMesh: the vinetree InstancedMesh (its instances re-order every frame); m: each tree's own matrix (column-major array).
  const VT = kinds.find(K => K.name === 'vinetree')
  // solids: where the hero cannot walk (hero.js pushes him out). A bellflower's stem and the leaves round it at body height
  // (1.6 m at scale 1, from its mesh), a vinetree's trunk core (3.6 m; its fins reach 11 m, he walks between them).
  ctx.flora = { treeMesh: VT.mesh, trees: trees.map(t => ({ x: t.x, z: t.z, r: 27 * t.s, top: t.y + VT.top * t.s, m: t.m })),
    solids: [...lists.bellflower.map(b => ({ x: b.x, z: b.z, r: 1.6 * b.s })), ...trees.map(t => ({ x: t.x, z: t.z, r: 3.6 * t.s }))] }

  // Every base against the live ground (heightAt may be re-wrapped after create): max |base − heightAt| in metres.
  window.__probes.flora = () => {
    let gap = 0, off = 0 // off: plants whose footprint leaves the ground (heightAt answers over the void too, so gap cannot see that)
    for (const K of kinds) for (const p of K.list) gap = Math.max(gap, Math.abs(p.y - ctx.heightAt(p.x, p.z))), off += !onGround(p.x, p.z, K.cfg.foot * p.s)
    return {
      ...Object.fromEntries(kinds.map(K => [K.name, K.list.length])), drawn: kinds.map(K => K.mesh.count),
      groves: groves.length, trees: lists.vinetree.map(t => [Math.round(t.x), Math.round(t.z)]), maxBaseGap: +gap.toFixed(3), offGround: off, night: +ctx.night.toFixed(2),
      cam: [camera.position.x, camera.position.y, camera.position.z].map(v => +v.toFixed(1)),
    }
  }
  return { update }
}
