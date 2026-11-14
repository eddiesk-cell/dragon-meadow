// Lane roam — the bestiary's 13 creatures live in the world, each at one fixed home: they stand, look about, now and then
// amble a few metres inside a small home radius and stop. They never attack, chase or react to the sword; near the hero
// they turn to look and will not walk into him (and he cannot walk through them). Costs nothing with ?bestiary=1 or ?roam=off.
// ?roam=<id> puts the hero 5-24 m south (and 1-5 m east) of that creature (the hero faces -z) so it can be photographed; the same spot works
// as ?at=<x>,<z> (probe roam: view.at). Gallery table, props and the ribmites' scuttle follow src/bestiary.js.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createSprings } from './springs.js'
import { scuttle, makeRope, chain } from './bestiary.js'

const RIG = 1.8, STRIDE = 1.6 // models are rigged at 1.80 m; the Walk clips are cut for a 1.6 m/s stride on that rig (tools/hero/motion.py)
const SLOW = 0.5 // walk at half the clip's stride speed, with the walk clip at half rate, so the feet still match the ground
const LOAD = 200, SHOW = 300, LIVE = 150 // metres from the hero: start loading, hide beyond, animate within
// id, name, nearest existing place, home x, z, height m, options {walk/idle clip, real (glb is true scale), swarm, water, prop [glb, bone], v m/s}
// short: [grass height x, radius m] a soft patch of short grass (a field ground patch, bilinear so it fades over ~3 m) round the home of the two
// little ones lost in waist-high grass; they stay inside it. Homes are 40 m+ apart, off the pond, ring, town and flora's solids (the probe checks).
const ROAM = [
  ['chalk-hob', 'Chalk Hob', 'spawn meadow, ahead-left of the start', 4, -20, 1.3, { walk: 'Crouch Walk', short: [0.5, 5] }],
  ['old-glim', 'Old Glim', 'the pond (Mirrormere)', 22, -56, 16, { real: true, idle: 'Swim', water: true, back: 18, side: 0 }],
  ['stiltstalker', 'Stiltstalker', 'pond east shore', 60, -26, 2.8, { prop: ['reed-spear', 'rightHand'] }],
  ['wreckback', 'Wreckback', 'open meadow north of the rock island (Undercliff)', 111.6, -68.5, 2.2],
  ['driftwight', 'The Driftwight', 'foot of the crest cliff (Undercliff)', 10, -182.5, 3.2],
  ['gapshrike', 'The Gapshrike', 'crest, high rocky ground (Greyspine)', -35.3, -196.4, 2.4],
  ['scarhorn', 'Scarhorn', 'crest, high rocky ground (Greyspine)', 140, -190, 2.6],
  ['rime-warden', 'The Rime Warden', 'west crest, high bare ground (Wyrmcrown)', -220, -190, 4.5],
  ['ribmite', 'Ribmites', 'open ground east of the pond (Redwaste)', 190, 50, 0.3, { scale: 3.5, swarm: 24, v: 0.4, short: [0.3, 5] }],
  ['marrowkeeper', 'The Marrowkeeper', 'open ground west (Redwaste)', -180, 40, 3.5],
  ['lantern-cap', 'Lantern-cap', 'vine-tree grove south of the start (Lanternwood)', 22, 272, 1.6],
  ['rootbinder', 'The Rootbinder', 'vine-tree grove south-west (Lanternwood)', -266.7, 171.8, 4.0],
  ['tolling-warden', 'The Tolling Warden', 'north of Springwell, over the stream (Bellholm)', -20, 415, 3.4, { prop: ['anchor', 'rightHand', 'rope'] }],
]
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a))
const rnd = (a, b) => a + Math.random() * (b - a)

export async function createRoam(ctx) {
  const { THREE, scene, params, heroPos } = ctx
  const mode = params.get('roam')
  if (mode === 'off' || params.get('bestiary') === '1') return null
  const loader = new GLTFLoader(), v = new THREE.Vector3()
  const url = p => import.meta.env.BASE_URL + p
  const ground = (x, z) => ctx.heightAt(x, z)
  const extent = root => { // lowest/highest vertex in the current pose, world space
    root.updateMatrixWorld(true)
    let lo = Infinity, hi = -Infinity, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    root.traverse(o => {
      if (!o.isMesh) return
      o.skeleton?.update()
      for (let i = 0, n = o.geometry.attributes.position.count; i < n; i += 4) { // shortcut: every 4th vertex, 4x cheaper on the main thread; the foot may read a few cm high
        o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld)
        if (v.y < lo) lo = v.y
        if (v.y > hi) hi = v.y
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z)
      }
    })
    return [lo, hi, x1 - x0, z1 - z0]
  }

  const its = ROAM.map(([id, name, place, x, z, size, o = {}]) => {
    const s = o.scale ?? (o.real ? 1 : size / RIG)
    return { id, name, place, hx: x, hz: z, x, z, size, o, s, R: o.water ? 0 : o.short ? o.short[1] + 1 : Math.min(18, Math.max(10, SLOW * STRIDE * s * 12)), // wander radius: room for walks of 5-12 s; the little ones stay on their short-grass patch
      body: o.water ? 1.3 : o.swarm ? 2 : 0.35, // hero cannot come closer than this + 0.3; set from the real body width at load
      pad: size >= 2.5 ? 4 : 1, rate: 1, dist: 0, walks: [], lift: 0, calT: 0, stretch: 0, ph: 0,
      half: o.water ? size / 2 - 1.3 : 0, // Old Glim is a 16 m capsule, the others a circle
      speed: o.v || SLOW * STRIDE * s, yaw: Math.PI + rnd(-0.6, 0.6), look: 0, mode: 'idle', t: id === mode ? 7 : rnd(1, 4), force: id === mode, // the ?roam=<id> one stands still for 7 s, then ambles, so a photo and one 8 s later show it move
      tx: 0, tz: 0, back: o.back ?? Math.min(24, Math.max(5, size * 2.2)), side: o.side ?? Math.min(5, size * 0.5 + 1), // the hero stands south and a little east, so it is beside him in the view, not behind his back
     
      loaded: false, clip: '-', obs: [] }
  })
  const find = id => its.find(i => i.id === id)
  const target = find(mode)
  // where to photograph one from: `back` m in front of it along the hero's heading (?yaw=deg, 0 faces -z; 180 puts the sun behind the camera), `side` m to his right
  const yawR = (+params.get('yaw') || 0) * Math.PI / 180
  // the water creature is photographed from the nearest bank along the heading, not from the water
  const back = it => { if (!it.o.water) return it.back; for (let d = 10; d < 80; d += 0.5) if ((ctx.pond?.inside(it.hx + Math.sin(yawR) * d, it.hz + Math.cos(yawR) * d) ?? -9) < -1) return d + 1.5; return it.back }
  const spot = it => { const b = back(it); return [it.hx + Math.sin(yawR) * b + Math.cos(yawR) * it.side, it.hz + Math.cos(yawR) * b - Math.sin(yawR) * it.side] }
  if (target && !params.get('at')) { const [x, z] = spot(target); heroPos.set(x, ground(x, z), z) }
  // short grass: a ground patch (field.js, bilinear, so it fades softly) whose grass height eases from h at the home to 1 over 5 m past a ragged r
  const ss = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k) }
  for (const it of its) if (it.o.short) {
    const [h, r] = it.o.short, S = 28, P = ctx.addGroundPatch(it.hx - S / 2, it.hz - S / 2, S), N = P.tex.image.width, d = P.tex.image.data
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const dx = (i + 0.5) / N * S - S / 2, dz = (j + 0.5) / N * S - S / 2, a = Math.atan2(dz, dx), re = r * (1 + 0.25 * (0.5 * Math.sin(3 * a + it.hx) + 0.5 * Math.sin(5 * a + it.hz))) // a ragged edge: trampled, not mown
      d[(j * N + i) * 4 + 1] = THREE.DataUtils.toHalfFloat(h + (1 - h) * ss(re, re + 5, Math.hypot(dx, dz))) }
    P.tex.needsUpdate = true
  }
  const lowest = obj => { // the anchor's lowest vertex above the ground under it
    let c = Infinity
    obj.updateMatrixWorld(true)
    obj.traverse(o => {
      if (!o.isMesh) return
      o.skeleton?.update()
      for (let i = 0, n = o.geometry.attributes.position.count; i < n; i += 3) { o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld); c = Math.min(c, v.y - ground(v.x, v.z)) }
    })
    return c
  }
  const stretchOf = r => { // worst link stretch now (|length / rest length - 1|)
    r.bone.getWorldPosition(v)
    return Math.max(...r.pts.map((p, k) => Math.abs(p.distanceTo(k ? r.pts[k - 1] : v) / r.lens[k] - 1)))
  }

  // --- loading: one at a time, nearest first, only within LOAD of the hero (or the ?roam=<id> one)
  let loading = false, nextLoad = 0 // one load at a time, 1.5 s apart, so no frame takes two creatures' worth of parsing and first draws
  const slide = it => { // if the home is on something it must keep off, move it to the nearest free spot (and say how far)
    if (it.o.water || !blocked(it, it.hx, it.hz)) return
    const [x0, z0] = [it.hx, it.hz]
    search: for (let r = 0.5; r < 60; r += 0.5) for (let k = 0; k < 24; k++) {
      const x = x0 + r * Math.sin(k * 0.2618), z = z0 + r * Math.cos(k * 0.2618)
      if (!blocked(it, x, z) && ground(x, z) > -0.3) { it.hx = it.x = x; it.hz = it.z = z; break search }
    }
    it.moved = [...(it.moved ?? [0, 0])].map((m, i) => +(m + [it.hx - x0, it.hz - z0][i]).toFixed(1))
  }
  const load = async it => {
    const { id, o, s } = it
    const gltf = await loader.loadAsync(url(`models/bestiary/${id}.glb`)), model = gltf.scene, root = new THREE.Group()
    it.lamps = []
    model.traverse(m => {
      if (!m.isMesh) return
      m.castShadow = m.receiveShadow = true; m.frustumCulled = false
      if (m.material.name === 'glim-lamps') { it.lamps.push(m.material); it.lampMesh = m } // Old Glim's flank lamps glow at night
    })
    root.add(model); root.scale.setScalar(s)
    // what this creature must keep off (the no-go circles, flora's solids, the pond) and, if its home is on one of them, the nearest free spot instead
    const near = c => !c.roam && Math.hypot(c.x - it.hx, c.z - it.hz) < c.r + it.R + it.size + 44
    it.obs = [...ctx.keepClear.filter(near), ...(ctx.flora?.solids ?? []).filter(near)]
    if (!o.water && !o.swarm) it.body = Math.max(0.35, it.size * 0.3) // a first guess for the search; the real width is measured below
    slide(it)
    const gy = ground(it.hx, it.hz)
    root.position.set(it.hx, gy, it.hz); scene.add(root)
    if (o.swarm) { // ribmites: rigid beetles whose legs walk in a tripod gait in the shader (attributes _leg, _legt)
      scuttle(model)
      model.traverse(m => { if (m.isMesh) m.material.emissive = new THREE.Color(0x6a1a08) }) // a warm glow so the swarm reads against the grass at distance
      it.swarmR = 3.2 / s
      for (let k = 1; k < o.swarm; k++) {
        const c = model.clone(), r = 3.2 / s * Math.sqrt(k / o.swarm), a = k * 2.4 // spread over a 3.2 m radius
        c.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); c.rotation.y = a * 1.7; c.userData = { ph: rnd(0, 6.28), hd: a * 1.7 }; root.add(c)
      }
    }
    const mixer = new THREE.AnimationMixer(model), actions = {}
    for (const c of gltf.animations) actions[c.name] = mixer.clipAction(c)
    it.actions = actions; it.mixer = mixer; it.root = root; it.model = model; it.cur = null
    it.idleN = o.idle || 'Idle'; it.walkN = o.walk || 'Walk'
    play(it, it.idleN); mixer.update(0.4) // let the fade-in finish, else this measures the rest pose
    const [lo, hi, wx, wz] = extent(root)
    if (!o.water && !o.swarm) { it.body = Math.max(0.35, 0.5 * Math.max(wx, wz)); slide(it); root.position.set(it.hx, ground(it.hx, it.hz), it.hz) } // the hero is blocked by the real body width (the warden's fists span 2.5 m); a home too close to a solid for that width moves on
    it.footY = lo - gy; it.h = hi - lo // the body's idle pose's lowest vertex above/below the ground: undone every frame so the feet stand on it
    if (it.lampMesh) { // Old Glim floats with her lamp line at the waterline: the mean height of the lamps above the ground at rest
      let sum = 0, n = 0
      it.lampMesh.updateMatrixWorld(true); it.lampMesh.skeleton?.update()
      for (let i = 0, c = it.lampMesh.geometry.attributes.position.count; i < c; i += 2) { it.lampMesh.getVertexPosition(i, v).applyMatrix4(it.lampMesh.matrixWorld); sum += v.y; n++ }
      it.lampDy = sum / n - gy
    }
    if (it.actions[it.walkN] || it.actions.Walk) this_gait(it)
    if (o.prop) { // held in the hand, its grip at the bone; slid up through the hand if it would reach under the ground (a spear's butt)
      const p = (await loader.loadAsync(url(`models/props/${o.prop[0]}.glb`))).scene, bone = model.getObjectByName(o.prop[1])
      p.traverse(m => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false } })
      if (o.prop[2] === 'rope') { // the anchor hangs on its chain from the fist (bestiary.js's rope), lying on the open ground: no plinth rim
        model.add(p); it.rope = makeRope({ p, bone, s, top: gy, x: it.hx, z: it.hz, rad: 1e3, root }); it.rope.iter = 40; it.rope.floor = (x, z) => ground(x, z) + it.lift; it.anchor = p // iter: solver passes (12 stretched the links 22% on a walking fist); lift: set from the anchor's measured lowest point
      } else {
        const pivot = new THREE.Group(); model.add(pivot); pivot.add(p); model.updateMatrixWorld(true)
        p.position.sub(model.worldToLocal(p.getObjectByName('grip').getWorldPosition(new THREE.Vector3())))
        pivot.position.copy(model.worldToLocal(bone.getWorldPosition(new THREE.Vector3()))); model.updateMatrixWorld(true)
        const below = gy - extent(p)[0]
        if (below > 0) p.position.y += below / s
        pivot.updateMatrixWorld(true); bone.attach(pivot)
  
      }
    }
    it.springs = it.id === 'rootbinder' ? await createSprings(ctx, { model, prefix: 'spring_crown', kind: 'root', probe: 'crown' }) : null
    it.loaded = true
  }
  // The walk clip's real ground speed: with the clip's time set by hand, the lower ankle's backward speed (the planted foot) over one loop,
  // median of the stance samples, at clip rate 1. A creature then moves at exactly gs x rate, so the planted foot does not skate. Of the Walk,
  // Crouch Walk and Run clips it uses the one whose speed comes nearest the pace wanted (SLOW x the hero's stride x size), at a rate within 0.6-1.3.
  const this_gait = it => {
    const feet = ['leftFoot', 'rightFoot'].map(n => it.model.getObjectByName(n)), want = it.o.v || SLOW * STRIDE * it.s, f = [new THREE.Vector3(), new THREE.Vector3()]
    if (!feet[0] || !feet[1]) return
    let best = null
    for (const name of new Set([it.o.walk, 'Walk', 'Crouch Walk'].filter(n => n && it.actions[n]))) {
      const act = it.actions[name], D = act.getClip().duration, N = 32, z = [], low = []
      it.mixer.stopAllAction(); act.reset().play()
      for (let i = 0; i <= N; i++) {
        act.time = D * i / N; it.mixer.update(0); it.model.updateMatrixWorld(true)
        feet.forEach((b, k) => b.getWorldPosition(f[k]))
        z.push([f[0].z, f[1].z]); low.push(f[0].y < f[1].y ? 0 : 1)
      }
      const v = []
      for (let i = 0; i < N; i++) { const k = low[i]; v.push(-(z[i + 1][k] - z[i][k]) / (D / N)) }
      v.sort((a, b) => a - b)
      const gs = Math.max(0.02, v[v.length >> 1]), rate = Math.min(1.3, Math.max(0.6, want / gs)), err = Math.abs(gs * rate - want) / want + (name === it.o.walk || name === 'Walk' ? 0 : 0.02)
      if (!best || err < best.err) best = { name, gs, rate, err, speed: gs * rate }
    }
    it.mixer.stopAllAction(); it.cur = null
    if (best) { // the walk clip reaches lower than the idle pose (the Rime Warden's toes sank 0.27 m): its own ground line, a low quartile of the lowest vertex over the cycle
      const act = it.actions[best.name], D = act.getClip().duration, lows = []
      act.reset().play()
      for (let i = 0; i < 16; i++) { act.time = D * i / 16; it.mixer.update(0); lows.push(extent(it.root)[0] - it.root.position.y) }
      it.lowW = lows; it.footYW = Math.min(...lows); it.mixer.stopAllAction() // the low point at 16 moments of the step: a single line left it in the air for a third of each step
    }
    if (best) { it.walkN = best.name; it.rate = best.rate; it.speed = best.speed; it.gait = { footY: +it.footY.toFixed(2), footYW: +it.footYW.toFixed(2), clip: best.name, footMs: +best.gs.toFixed(2), rate: +best.rate.toFixed(2), moveMs: +best.speed.toFixed(2) } }
    play(it, it.idleN); it.mixer.update(0.4)
  }
  const lowAt = it => { const c = it.actions[it.walkN], u = (c.time / c.getClip().duration % 1) * 16, i = Math.floor(u) % 16; return it.lowW[i] + (it.lowW[(i + 1) % 16] - it.lowW[i]) * (u - Math.floor(u)) }
  const play = (it, n) => {
    const act = it.actions[n]
    if (!act || act === it.cur) return // the ribmites have no clips
    act.reset().fadeIn(0.3).play(); act.timeScale = n === it.walkN ? it.rate : 1; it.cur?.fadeOut(0.3)
    it.cur = act; it.clip = n
  }

  // --- where a creature may stand
  // no foot IK, so on a slope a foot sinks or floats by slope x its distance from the body's centre: they keep to ground gentler than 0.12 (review r4)
  const steep = (it, x, z) => Math.hypot(ground(x + 1, z) - ground(x - 1, z), ground(x, z + 1) - ground(x, z - 1)) / 2 > Math.min(0.12, 0.12 / (it.body || 1)) // a wide body needs flatter ground (the Rime Warden sank 0.19 m on a 0.117 slope)
  const blocked = (it, x, z) => it.obs.some(c => Math.hypot(x - c.x, z - c.z) < c.r + it.body + it.pad) || (ctx.pond?.inside(x, z) ?? 0) > -1.5 || steep(it, x, z)
  const okStep = (it, x0, z0, x1, z1) => {
    for (let k = 1; k <= 4; k++) {
      const x = x0 + (x1 - x0) * k / 4, z = z0 + (z1 - z0) * k / 4, g = ground(x, z)
      if (blocked(it, x, z) || g < -0.3 || Math.abs(g - ground(x0, z0)) > 0.35 * Math.hypot(x1 - x0, z1 - z0) * k / 4 + 0.15) return false
    }
    return true
  }
  const amble = it => { // a spot 5-12 s of walking away, inside the home radius, clear of obstacles and of the hero
    for (let n = 0; n < 20; n++) {
      const a = rnd(0, 6.28), d = it.speed * rnd(5, 12) * (n < 10 ? 1 : 0.5), x = it.x + Math.sin(a) * d, z = it.z + Math.cos(a) * d
      if (Math.hypot(x - it.hx, z - it.hz) <= it.R && Math.hypot(x - heroPos.x, z - heroPos.z) > it.body + 4 && okStep(it, it.x, it.z, x, z)) { it.tx = x; it.tz = z; return true }
    }
    return false
  }
  const rest = (it, lo = 3, hi = 7) => {
    if (it.mode === 'walk') { it.walks.push({ s: +(ctx.time - it.w0).toFixed(1), m: +Math.hypot(it.x - it.wx, it.z - it.wz).toFixed(1) }); if (it.walks.length > 8) it.walks.shift() }
    it.mode = 'idle'; it.t = rnd(lo, hi); play(it, it.idleN) }

  const stepIt = (it, dt, d) => {
    const hx = heroPos.x, hz = heroPos.z, turn = (to, rate) => { it.yaw += Math.sign(wrap(to - it.yaw)) * Math.min(Math.abs(wrap(to - it.yaw)), rate * dt) }
    it.t -= dt
    if (it.o.water) { // Old Glim swims a slow loop round the pond's deep middle, head along the path
      it.ph += dt * 1.2 / 6; it.x = it.hx + 6 * Math.sin(it.ph); it.z = it.hz + 6 * Math.cos(it.ph); it.yaw = Math.atan2(Math.cos(it.ph), -Math.sin(it.ph))
    }
    else if (it.mode === 'idle') {
      if (d < 14) turn(Math.atan2(hx - it.x, hz - it.z), 1.1) // it turns to look at him
      else turn(it.look, 0.8)
      if (it.t <= 0) {
        if (it.o.swarm || it.force || Math.random() < 0.55) { it.force = false; if (amble(it)) { it.mode = 'turn'; it.t = 6 } else rest(it) }
        else { it.look = it.yaw + rnd(-1.4, 1.4); it.t = rnd(3, 7) }
      }
    } else if (it.mode === 'turn') { // faces its goal in place before walking, so it never skates sideways
      const to = Math.atan2(it.tx - it.x, it.tz - it.z); turn(to, 2); if (Math.abs(wrap(to - it.yaw)) < 0.3) { it.mode = 'walk'; it.t = 25; it.w0 = ctx.time; it.wx = it.x; it.wz = it.z; play(it, it.walkN) } else if (it.t <= 0) rest(it)
    } else { // walk
      turn(Math.atan2(it.tx - it.x, it.tz - it.z), 2.2)
      const nx = it.x + Math.sin(it.yaw) * it.speed * dt, nz = it.z + Math.cos(it.yaw) * it.speed * dt, dn = Math.hypot(nx - hx, nz - hz)
      // it stops short of him (about 2 m) and when its next step is not ground it may stand on
      if ((dn < it.body + 2 && dn < d) || !okStep(it, it.x, it.z, nx, nz)) rest(it, 2, 4)
      else { it.dist += it.speed * dt; it.x = nx; it.z = nz; if (Math.hypot(it.tx - it.x, it.tz - it.z) < 0.4 || it.t <= 0) rest(it) }
    }
  }
  const push = it => { // he cannot walk through it: out of its circle (Old Glim: its capsule along her body)
    let cx = it.x, cz = it.z
    if (it.half) { const ax = Math.sin(it.yaw), az = Math.cos(it.yaw), k = Math.max(-it.half, Math.min(it.half, (heroPos.x - it.x) * ax + (heroPos.z - it.z) * az)); cx += ax * k; cz += az * k }
    const ex = heroPos.x - cx, ez = heroPos.z - cz, d = Math.hypot(ex, ez), r = it.body + 0.3
    if (d < r && d > 1e-6) { heroPos.x = cx + ex / d * r; heroPos.z = cz + ez / d * r }
  }

  window.__probes.roam = () => ({
    loaded: its.filter(i => i.loaded).length, total: its.length,
    creatures: its.map(i => {
      const nearest = Math.min(...its.filter(j => j !== i).map(j => Math.hypot(j.hx - i.hx, j.hz - i.hz)))
      const x = i.x, z = i.z
      return {
        id: i.id, place: i.place, home: [i.hx, i.hz], at: [+x.toFixed(1), +z.toFixed(1)], dist: +Math.hypot(heroPos.x - x, heroPos.z - z).toFixed(1),
        state: !i.loaded || !i.root.visible ? 'hidden' : i.mode === 'turn' ? 'idle' : i.mode, clip: i.clip, loaded: i.loaded,
        inWater: (ctx.pond?.inside(i.hx, i.hz) ?? 0) > 0, inNoGo: ctx.keepClear.filter(c => !c.roam && Math.hypot(i.hx - c.x, i.hz - c.z) < c.r).length,
        nearestHomeM: +nearest.toFixed(1), groundY: +ground(i.hx, i.hz).toFixed(2), footYcm: i.loaded ? +(i.footY * 100).toFixed(1) : null, heightM: i.loaded ? +i.h.toFixed(2) : null,
        gait: i.gait, walkedM: +i.dist.toFixed(1), slidHomeM: i.moved, blocked: i.loaded && !i.o.water ? blocked(i, i.hx, i.hz) || blocked(i, i.x, i.z) : null,
        speed: +i.speed.toFixed(2), body: +i.body.toFixed(2), walks: i.walks, view: { at: spot(i).map(n => +n.toFixed(1)), yaw: Math.round(yawR * 180 / Math.PI) },
        rope: i.rope && { stretch: +i.stretch.toFixed(3), maxStretch: +(i.maxStretch ?? 0).toFixed(3), walkStretch: +(i.walkStretch ?? 0).toFixed(3), lift: +i.lift.toFixed(2), anchorClearM: i.loaded ? +lowest(i.anchor).toFixed(3) : null },
      }
    }),
  })

  // the lower ankle's position in the creature's own frame (m, +z forward), for measuring the planted foot's speed against the ground speed
  window.__probes.roamFoot = id => {
    const it = find(id), f = ['leftFoot', 'rightFoot'].map(n => it.model.getObjectByName(n)), p = f.map(b => it.root.worldToLocal(b.getWorldPosition(v.clone())))
    const k = f[0].getWorldPosition(v.clone()).y < f[1].getWorldPosition(v.clone()).y ? 0 : 1
    return { z: p[k].z * it.s, low: k, x: it.x, zw: it.z, mode: it.mode, t: ctx.time }
  }

  return {
    update(dt, t) {
      if (ctx.roamOff) { for (const it of its) if (it.loaded) it.root.visible = false; return } // runtime off switch (set ctx.roamOff = true): same as ?roam=off, for in-page fps A/B
      const hx = heroPos.x, hz = heroPos.z
      if (!loading && ctx.time > nextLoad) {
        let best = null, bd = LOAD
        for (const it of its) if (!it.loaded && !it.failed) { const d = Math.hypot(it.hx - hx, it.hz - hz); if (d < bd || it === target) best = it, bd = it === target ? -1 : d }
        if (best) { loading = true; load(best).catch(e => { best.failed = true; window.__errors.push(`roam: ${best.id}: ${e.message || e}`) }).finally(() => { loading = false; nextLoad = ctx.time + 1.5 }) }
      }
      for (const it of its) {
        if (!it.loaded) continue
        const d = Math.hypot(it.x - hx, it.z - hz), vis = d < SHOW
        it.root.visible = vis
        if (!vis) continue
        if (d > LIVE) { if (it.mode !== 'idle') { it.mode = 'idle'; it.t = rnd(1, 3); play(it, it.idleN) } continue } // far: frozen where it stands
        stepIt(it, dt, d)
        const castOn = d < 110
        if (castOn !== it.cast) { it.cast = castOn; it.model.traverse(m => { if (m.isMesh) m.castShadow = castOn }) }
        it.mixer.update(dt)
        it.root.position.x = it.x; it.root.position.z = it.z
        if (it.o.water) it.root.position.y = ctx.pond.level + 0.12 - it.lampDy // Old Glim floats, her lamp line just above the water
        else { // on the mean ground under the body: on a slope they keep to gentle ground (see steep), so feet are within a few cm (shortcut: no foot IK; add it before a creature lives on a slope)
          const g = ground(it.x, it.z), q = Math.min(it.body, 1.2) * 0.8, sx = Math.sin(it.yaw) * q, sz = Math.cos(it.yaw) * q
          const gy = (g + ground(it.x + sx, it.z + sz) + ground(it.x - sx, it.z - sz) + ground(it.x + sz, it.z - sx) + ground(it.x - sz, it.z + sx)) / 5
          it.gy = it.gy === undefined ? gy : it.gy + (gy - it.gy) * Math.min(1, dt * 8) // the ground eases; the step's own rise and fall is followed closely
          it.low = (it.low ?? it.footY) + ((it.lowW ? (w => w * lowAt(it) + (1 - w) * it.footY)(it.actions[it.walkN].getEffectiveWeight()) : it.footY) - (it.low ?? it.footY)) * Math.min(1, dt * 25)
          it.root.position.y = it.gy - it.low
        }
        it.root.rotation.y = it.yaw
        it.springs?.update(dt, t)
        if (it.o.swarm) for (const c of it.root.children) { // each beetle crawls on its own: runs, pauses, turns, stays in the swarm
          const u = c.userData; if (u.ph === undefined) continue
          u.ph += dt
          if (Math.sin(u.ph * 1.3) > -0.3) {
            u.hd += Math.sin(u.ph * 0.7) * dt * 2.5
            if (Math.hypot(c.position.x, c.position.z) > it.swarmR) u.hd = Math.atan2(-c.position.x, -c.position.z)
            c.position.x += Math.sin(u.hd) * 0.9 / it.s * dt; c.position.z += Math.cos(u.hd) * 0.9 / it.s * dt
          }
          c.rotation.y = u.hd
        }
        if (it.rope) {
          it.rope.top = ground(it.x, it.z); it.rope.x = it.x; it.rope.z = it.z; chain(it.rope, dt)
          it.stretch = stretchOf(it.rope); it.age = (it.age ?? 0) + dt
          if (it.age > 2) { it.maxStretch = Math.max(it.maxStretch ?? 0, it.stretch); if (it.mode === 'walk') it.walkStretch = Math.max(it.walkStretch ?? 0, it.stretch) } // not the first 2 s: the chain starts on a guess and settles
          if ((it.calT -= dt) <= 0) { it.calT = 0.3; it.lift = Math.min(1.5, Math.max(0, it.lift + (0.03 - lowest(it.anchor)) * 0.7)) } // the flukes lie ON the ground: lift the floor by what is still under it
        }
        for (const m of it.lamps) m.emissiveIntensity = 0.3 + 2.7 * ctx.night
        if (it.o.swarm) it.model.parent.traverse(m => { if (m.isMesh) m.material.emissiveIntensity = 1 - 0.8 * (ctx.night ?? 0) }) // the swarm's day glow would be the brightest thing in a night frame
        push(it)
      }
    },
  }
}
