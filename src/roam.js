// Lane roam — the bestiary's 13 creatures live in the world, each at one fixed home: they stand, look about, now and then
// amble a few metres inside a small home radius and stop. They never attack, chase or react to the sword; near the hero
// they turn to look and will not walk into him (and he cannot walk through them). Costs nothing with ?bestiary=1 or ?roam=off.
// ?roam=<id> puts the hero 7-24 m south (and 1-5 m east) of that creature (the hero faces -z) so it can be photographed; the same spot works
// as ?at=<x>,<z> (probe roam: view.at). Gallery table, props and the ribmites' scuttle follow src/bestiary.js.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createSprings } from './springs.js'
import { attribute, positionLocal, modelPosition, time, vec3, sin, cos, max, mod, floor, step } from 'three/tsl'

const RIG = 1.8, STRIDE = 1.6 // models are rigged at 1.80 m; the Walk clips are cut for a 1.6 m/s stride on that rig (tools/hero/motion.py)
const LOAD = 200, SHOW = 300, LIVE = 150 // metres from the hero: start loading, hide beyond, animate within
// id, name, nearest existing place, home x, z, height m, options {walk/idle clip, real (glb is true scale), swarm, water, prop [glb, bone], v m/s}
// Homes are 40 m+ apart, off the pond, ring, town and flora's solids (the probe checks); the named lands do not exist yet.
const ROAM = [
  ['chalk-hob', 'Chalk Hob', 'spawn meadow, ahead-left of the start', -11, -15, 1.3, { walk: 'Crouch Walk' }],
  ['old-glim', 'Old Glim', 'the pond (Mirrormere)', 10, -52, 16, { real: true, idle: 'Swim', water: true }],
  ['stiltstalker', 'Stiltstalker', 'pond east shore', 52, -32, 2.8, { prop: ['reed-spear', 'rightHand'] }],
  ['wreckback', 'Wreckback', 'foot of the rock island (Undercliff)', 100, -112, 2.2],
  ['driftwight', 'The Driftwight', 'foot of the crest cliff (Undercliff)', 10, -160, 3.2],
  ['gapshrike', 'The Gapshrike', 'crest, high rocky ground (Greyspine)', -30, -195, 2.4],
  ['scarhorn', 'Scarhorn', 'crest, high rocky ground (Greyspine)', 140, -190, 2.6],
  ['rime-warden', 'The Rime Warden', 'west crest, high bare ground (Wyrmcrown)', -220, -190, 4.5],
  ['ribmite', 'Ribmites', 'open ground east of the pond (Redwaste)', 190, 50, 0.3, { real: true, swarm: 14, v: 0.5 }],
  ['marrowkeeper', 'The Marrowkeeper', 'open ground west (Redwaste)', -180, 40, 3.5],
  ['lantern-cap', 'Lantern-cap', 'vine-tree grove south of the start (Lanternwood)', 22, 272, 1.6],
  ['rootbinder', 'The Rootbinder', 'vine-tree grove south-west (Lanternwood)', -272, 166, 4.0],
  ['tolling-warden', 'The Tolling Warden', 'north of Springwell, over the stream (Bellholm)', -20, 415, 3.4, { prop: ['anchor', 'rightHand'] }],
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
    let lo = Infinity, hi = -Infinity
    root.traverse(o => {
      if (!o.isMesh) return
      o.skeleton?.update()
      for (let i = 0, n = o.geometry.attributes.position.count; i < n; i++) {
        o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld)
        if (v.y < lo) lo = v.y
        if (v.y > hi) hi = v.y
      }
    })
    return [lo, hi]
  }

  const its = ROAM.map(([id, name, place, x, z, size, o = {}]) => {
    const s = o.real ? 1 : size / RIG
    return { id, name, place, hx: x, hz: z, x, z, size, o, s, R: o.water ? 0 : Math.min(10, Math.max(4, size * 1.8)), // wander radius
      body: o.water ? 1.3 : o.swarm ? 1.1 : Math.min(1.2, Math.max(0.35, size * 0.2)), // hero cannot come closer than this + 0.3
      half: o.water ? size / 2 - 1.3 : 0, // Old Glim is a 16 m capsule, the others a circle
      speed: o.v || STRIDE * s, yaw: Math.PI + rnd(-0.6, 0.6), look: 0, mode: 'idle', t: rnd(1, 4), tx: 0, tz: 0, back: Math.min(24, Math.max(7, size * 2)), side: Math.min(5, size * 0.5 + 1), // the hero stands south and a little east, so it is beside him in the view, not behind his back
     
      loaded: false, clip: '-', obs: [] }
  })
  const find = id => its.find(i => i.id === id)
  const target = find(mode)
  if (target) heroPos.set(target.hx + target.side, ground(target.hx + target.side, target.hz + target.back), target.hz + target.back)

  // --- loading: one at a time, nearest first, only within LOAD of the hero (or the ?roam=<id> one)
  let loading = false
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
    if (!o.water) ctx.keepClear.push({ x: it.hx, z: it.hz, r: it.body + 1.5, bare: it.body + 1.5, roam: true }) // field strips the grass at its home (16 such circles at most)
    if (o.swarm) { // ribmites: rigid beetles whose legs walk in a tripod gait in the shader (attributes _leg, _legt)
      model.traverse(m => {
        if (!m.isMesh) return
        const old = m.material, leg = attribute('_leg', 'float'), lt = attribute('_legt', 'float')
        m.material = new THREE.MeshStandardNodeMaterial({ map: old.map, normalMap: old.normalMap, roughnessMap: old.roughnessMap, roughness: old.roughness, metalness: old.metalness, color: old.color })
        const ph = time.mul(14).add(mod(leg.add(floor(leg.sub(1).div(2))), 2).mul(Math.PI)).add(modelPosition.x.mul(7)).add(modelPosition.z.mul(5))
        m.material.positionNode = positionLocal.add(vec3(0, max(sin(ph), 0).mul(0.028), cos(ph).mul(0.035)).mul(lt).mul(step(0.5, leg)))
      })
      for (let k = 1; k < o.swarm; k++) {
        const c = model.clone(), r = it.body * 0.85 * Math.sqrt(k / o.swarm), a = k * 2.4
        c.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); c.rotation.y = a * 1.7; root.add(c)
      }
    }
    const mixer = new THREE.AnimationMixer(model), actions = {}
    for (const c of gltf.animations) actions[c.name] = mixer.clipAction(c)
    it.actions = actions; it.mixer = mixer; it.root = root; it.model = model; it.cur = null
    it.idleN = o.idle || 'Idle'; it.walkN = o.walk || 'Walk'
    play(it, it.idleN); mixer.update(0.4) // let the fade-in finish, else this measures the rest pose
    if (o.prop) { // held in the hand, its grip at the bone; slid up through the hand if it would reach under the ground (a spear's butt)
      const p = (await loader.loadAsync(url(`models/props/${o.prop[0]}.glb`))).scene, bone = model.getObjectByName(o.prop[1])
      p.traverse(m => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false } })
      const pivot = new THREE.Group(); model.add(pivot); pivot.add(p); model.updateMatrixWorld(true)
      p.position.sub(model.worldToLocal(p.getObjectByName('grip').getWorldPosition(new THREE.Vector3())))
      pivot.position.copy(model.worldToLocal(bone.getWorldPosition(new THREE.Vector3()))); model.updateMatrixWorld(true)
      const below = gy - extent(p)[0]
      if (below > 0) p.position.y += below / s
      pivot.updateMatrixWorld(true); bone.attach(pivot)
    }
    it.footY = extent(root)[0] - gy // the idle pose's lowest vertex above/below the ground: undone every frame so the feet stand on it
    it.springs = it.id === 'rootbinder' ? await createSprings(ctx, { model, prefix: 'spring_crown', kind: 'root', probe: 'crown' }) : null
    // what this creature must keep off: the no-go circles (water, ring, town, stones) and solid plants near its home
    const near = c => !c.roam && Math.hypot(c.x - it.hx, c.z - it.hz) < c.r + it.R + it.size + 4
    it.obs = [...ctx.keepClear.filter(near), ...(ctx.flora?.solids ?? []).filter(near)]
    it.loaded = true
  }
  const play = (it, n) => {
    const act = it.actions[n]
    if (!act || act === it.cur) return // the ribmites have no clips
    act.reset().fadeIn(0.3).play(); it.cur?.fadeOut(0.3)
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
  const amble = it => { // a spot a few metres off inside the home radius, clear of obstacles and of the hero
    for (let n = 0; n < 12; n++) {
      const a = rnd(0, 6.28), d = rnd(3, Math.min(it.R, 7)), x = it.x + Math.sin(a) * d, z = it.z + Math.cos(a) * d
      if (Math.hypot(x - it.hx, z - it.hz) <= it.R && Math.hypot(x - heroPos.x, z - heroPos.z) > it.body + 4 && okStep(it, it.x, it.z, x, z)) { it.tx = x; it.tz = z; return true }
    }
    return false
  }
  const rest = (it, lo = 3, hi = 7) => { it.mode = 'idle'; it.t = rnd(lo, hi); play(it, it.idleN) }

  const stepIt = (it, dt, d) => {
    const hx = heroPos.x, hz = heroPos.z, turn = (to, rate) => { it.yaw += Math.sign(wrap(to - it.yaw)) * Math.min(Math.abs(wrap(to - it.yaw)), rate * dt) }
    it.t -= dt
    if (it.o.water) { it.yaw = Math.PI + 0.25 * Math.sin(ctx.time * 0.1 + 1) } // Old Glim rides the pond, swaying gently
    else if (it.mode === 'idle') {
      if (d < 14) turn(Math.atan2(hx - it.x, hz - it.z), 1.1) // it turns to look at him
      else turn(it.look, 0.8)
      if (it.t <= 0) {
        if (it.o.swarm || Math.random() < 0.55) { if (amble(it)) { it.mode = 'turn'; it.t = 6 } else rest(it) }
        else { it.look = it.yaw + rnd(-1.4, 1.4); it.t = rnd(3, 7) }
      }
    } else if (it.mode === 'turn') { // faces its goal in place before walking, so it never skates sideways
      const to = Math.atan2(it.tx - it.x, it.tz - it.z); turn(to, 2); if (Math.abs(wrap(to - it.yaw)) < 0.3) { it.mode = 'walk'; it.t = 20; play(it, it.walkN) } else if (it.t <= 0) rest(it)
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
        nearestHomeM: +nearest.toFixed(1), groundY: +ground(i.hx, i.hz).toFixed(2), footYcm: i.loaded ? +(i.footY * 100).toFixed(1) : null,
        view: { at: [i.hx + i.side, i.hz + i.back] },
      }
    }),
  })

  return {
    update(dt, t) {
      const hx = heroPos.x, hz = heroPos.z
      if (!loading) {
        let best = null, bd = LOAD
        for (const it of its) if (!it.loaded && !it.failed) { const d = Math.hypot(it.hx - hx, it.hz - hz); if (d < bd || it === target) best = it, bd = it === target ? -1 : d }
        if (best) { loading = true; load(best).catch(e => { best.failed = true; window.__errors.push(`roam: ${best.id}: ${e.message || e}`) }).finally(() => { loading = false }) }
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
        it.root.position.set(it.x, ground(it.x, it.z) - it.footY, it.z)
        it.root.rotation.y = it.yaw
        it.springs?.update(dt, t)
        for (const m of it.lamps) m.emissiveIntensity = 0.3 + 2.7 * ctx.night
        push(it)
      }
    },
  }
}
