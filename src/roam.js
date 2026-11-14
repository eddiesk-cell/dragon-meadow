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
  ['chalk-hob', 'Chalk Hob', 'spawn meadow, ahead-left of the start', 4, -20, 1.3, { walk: 'Crouch Walk', short: [0.3, 4] }],
  ['old-glim', 'Old Glim', 'the pond (Mirrormere)', 22, -56, 16, { real: true, idle: 'Swim', water: true, back: 18, side: 0 }],
  ['stiltstalker', 'Stiltstalker', 'pond east shore', 60, -26, 2.8, { prop: ['reed-spear', 'rightHand'] }],
  ['wreckback', 'Wreckback', 'foot of the rock island (Undercliff)', 100, -112, 2.2],
  ['driftwight', 'The Driftwight', 'foot of the crest cliff (Undercliff)', 10, -160, 3.2],
  ['gapshrike', 'The Gapshrike', 'crest, high rocky ground (Greyspine)', -30, -195, 2.4],
  ['scarhorn', 'Scarhorn', 'crest, high rocky ground (Greyspine)', 140, -190, 2.6],
  ['rime-warden', 'The Rime Warden', 'west crest, high bare ground (Wyrmcrown)', -220, -190, 4.5],
  ['ribmite', 'Ribmites', 'open ground east of the pond (Redwaste)', 190, 50, 0.3, { scale: 2.5, swarm: 16, v: 0.4, short: [0.12, 4] }],
  ['marrowkeeper', 'The Marrowkeeper', 'open ground west (Redwaste)', -180, 40, 3.5],
  ['lantern-cap', 'Lantern-cap', 'vine-tree grove south of the start (Lanternwood)', 22, 272, 1.6],
  ['rootbinder', 'The Rootbinder', 'vine-tree grove south-west (Lanternwood)', -272, 166, 4.0],
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
      body: o.water ? 1.3 : o.swarm ? 1.7 : 0.35, // hero cannot come closer than this + 0.3; set from the real body width at load
      walks: [], lift: 0, calT: 0, stretch: 0, ph: 0,
      half: o.water ? size / 2 - 1.3 : 0, // Old Glim is a 16 m capsule, the others a circle
      speed: o.v || SLOW * STRIDE * s, yaw: Math.PI + rnd(-0.6, 0.6), look: 0, mode: 'idle', t: id === mode ? 7 : rnd(1, 4), force: id === mode, // the ?roam=<id> one stands still for 7 s, then ambles, so a photo and one 8 s later show it move
      tx: 0, tz: 0, back: o.back ?? Math.min(24, Math.max(5, size * 2.2)), side: o.side ?? Math.min(5, size * 0.5 + 1), // the hero stands south and a little east, so it is beside him in the view, not behind his back
     
      loaded: false, clip: '-', obs: [] }
  })
  const find = id => its.find(i => i.id === id)
  const target = find(mode)
  // where to photograph one from: `back` m in front of it along the hero's heading (?yaw=deg, 0 faces -z; 180 puts the sun behind the camera), `side` m to his right
  const yawR = (+params.get('yaw') || 0) * Math.PI / 180
  const spot = it => [it.hx + Math.sin(yawR) * it.back + Math.cos(yawR) * it.side, it.hz + Math.cos(yawR) * it.back - Math.sin(yawR) * it.side]
  if (target && !params.get('at')) { const [x, z] = spot(target); heroPos.set(x, ground(x, z), z) }
  // short grass: a ground patch (field.js, bilinear, so it fades softly) whose grass height eases from h at the home to 1 over 3 m past r
  const ss = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k) }
  for (const it of its) if (it.o.short) {
    const [h, r] = it.o.short, S = 24, P = ctx.addGroundPatch(it.hx - S / 2, it.hz - S / 2, S), N = P.tex.image.width, d = P.tex.image.data
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) d[(j * N + i) * 4 + 1] = THREE.DataUtils.toHalfFloat(h + (1 - h) * ss(r, r + 3, Math.hypot((i + 0.5) / N * S - S / 2, (j + 0.5) / N * S - S / 2)))
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
  const load = async it => {
    const { id, o, s } = it
    const gltf = await loader.loadAsync(url(`models/bestiary/${id}.glb`)), model = gltf.scene, root = new THREE.Group()
    it.lamps = []
    model.traverse(m => {
      if (!m.isMesh) return
      m.castShadow = m.receiveShadow = true; m.frustumCulled = false
      if (m.material.name === 'glim-lamps') it.lamps.push(m.material) // Old Glim's flank lamps glow at night
    })
    root.add(model); root.scale.setScalar(s)
    const gy = ground(it.hx, it.hz)
    root.position.set(it.hx, gy, it.hz); scene.add(root)
    if (o.swarm) { // ribmites: rigid beetles whose legs walk in a tripod gait in the shader (attributes _leg, _legt)
      scuttle(model)
      for (let k = 1; k < o.swarm; k++) {
        const c = model.clone(), r = 1.6 / s * Math.sqrt(k / o.swarm), a = k * 2.4 // spread over a 1.6 m radius
        c.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); c.rotation.y = a * 1.7; root.add(c)
      }
    }
    const mixer = new THREE.AnimationMixer(model), actions = {}
    for (const c of gltf.animations) actions[c.name] = mixer.clipAction(c)
    it.actions = actions; it.mixer = mixer; it.root = root; it.model = model; it.cur = null
    it.idleN = o.idle || 'Idle'; it.walkN = o.walk || 'Walk'
    play(it, it.idleN); mixer.update(0.4) // let the fade-in finish, else this measures the rest pose
    const [lo, hi, wx, wz] = extent(root)
    if (!o.water && !o.swarm) it.body = Math.max(0.35, 0.5 * Math.max(wx, wz)) // the hero is blocked by the real body width (the warden's fists span 2.5 m)
    it.footY = lo - gy; it.h = hi - lo // the body's idle pose's lowest vertex above/below the ground: undone every frame so the feet stand on it
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
    // what this creature must keep off: the no-go circles (water, ring, town, stones) and solid plants near its home
    const near = c => !c.roam && Math.hypot(c.x - it.hx, c.z - it.hz) < c.r + it.R + it.size + 4
    it.obs = [...ctx.keepClear.filter(near), ...(ctx.flora?.solids ?? []).filter(near)]
    it.loaded = true
  }
  const play = (it, n) => {
    const act = it.actions[n]
    if (!act || act === it.cur) return // the ribmites have no clips
    act.reset().fadeIn(0.3).play(); act.timeScale = n === it.walkN ? SLOW : 1; it.cur?.fadeOut(0.3)
    it.cur = act; it.clip = n
  }

  // --- where a creature may stand
  const blocked = (it, x, z) => it.obs.some(c => Math.hypot(x - c.x, z - c.z) < c.r + it.body) || (ctx.pond?.inside(x, z) ?? 0) > -1.5
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
      else { it.x = nx; it.z = nz; if (Math.hypot(it.tx - it.x, it.tz - it.z) < 0.4 || it.t <= 0) rest(it) }
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
        speed: +i.speed.toFixed(2), body: +i.body.toFixed(2), walks: i.walks, view: { at: spot(i).map(n => +n.toFixed(1)), yaw: Math.round(yawR * 180 / Math.PI) },
        rope: i.rope && { stretch: +i.stretch.toFixed(3), maxStretch: +(i.maxStretch ?? 0).toFixed(3), walkStretch: +(i.walkStretch ?? 0).toFixed(3), lift: +i.lift.toFixed(2), anchorClearM: i.loaded ? +lowest(i.anchor).toFixed(3) : null },
      }
    }),
  })

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
        it.root.position.set(it.x, (it.o.water ? ctx.pond.level - 1.3 : ground(it.x, it.z)) - it.footY, it.z) // Old Glim floats: only her back ridge shows
        it.root.rotation.y = it.yaw
        it.springs?.update(dt, t)
        if (it.rope) {
          it.rope.top = ground(it.x, it.z); it.rope.x = it.x; it.rope.z = it.z; chain(it.rope, dt)
          it.stretch = stretchOf(it.rope); it.age = (it.age ?? 0) + dt
          if (it.age > 2) { it.maxStretch = Math.max(it.maxStretch ?? 0, it.stretch); if (it.mode === 'walk') it.walkStretch = Math.max(it.walkStretch ?? 0, it.stretch) } // not the first 2 s: the chain starts on a guess and settles
          if ((it.calT -= dt) <= 0) { it.calT = 0.3; it.lift = Math.min(1.5, Math.max(0, it.lift + (0.03 - lowest(it.anchor)) * 0.7)) } // the flukes lie ON the ground: lift the floor by what is still under it
        }
        for (const m of it.lamps) m.emissiveIntensity = 0.3 + 2.7 * ctx.night
        push(it)
      }
    },
  }
}
