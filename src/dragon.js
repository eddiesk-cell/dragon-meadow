// Lane dragon(-ride): the winter dragon. Free, it flies a banked figure-eight over the meadow (?dragon=near: a close
// circle for proof). Now and then, or when called (E), it lands near the hero and waits; src/ride.js puts him on its back
// and flies it. Everything but the free eight flies one integrator (heading, speed, climb) that keeps clear of the rock
// island, grove trees and Crestwatch by lifting over them. Publishes ctx.dragon for ride.js.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createRide } from './ride.js'

export async function createDragon(ctx) {
  const { THREE, scene, params } = ctx
  const { clamp, smoothstep } = THREE.MathUtils
  const near = params.get('dragon') === 'near'
  const gltf = await new GLTFLoader().loadAsync('/models/dragon.glb')
  const model = gltf.scene
  const holder = new THREE.Group() // holder carries the flight pose; model carries scale (its root bone lifts it 4 m in flight)
  model.scale.setScalar(3) // ~7 m shipped span -> ~20 m
  model.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true } })
  holder.add(model)
  scene.add(holder)

  const mixer = new THREE.AnimationMixer(model)
  const acts = Object.fromEntries(gltf.animations.map(c => [c.name, mixer.clipAction(c)]))
  let clip = 'fly', act = acts.fly.play()
  const setClip = (name, once = false) => {
    if (name === clip) return
    const a = acts[name].reset().setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity)
    a.clampWhenFinished = once
    a.fadeIn(0.35).play(); act.fadeOut(0.35); act = a; clip = name
  }

  // Solid things, as upright cylinders {x, z, r, top}: trees and towers are flown over, the rock island round (or over
  // its top). shortcut: Crestwatch is one drum round its seven towers and 54 m keep until settlements publishes
  // ctx.settlements.towers; then those are used as they are.
  // Clearances are from the dragon's body, not its holder: over a ridden loop its mesh reached 14.9 m out (wings, tail) and
  // hung 1.8 m below the holder, so it is a cylinder SIDE wide reaching DOWN under the holder, kept CLEAR off every solid.
  const SIDE = 15, DOWN = 2, CLEAR = 6
  function isleOf(ri) { // the rock island and all it carries (summit trees 13 m over the rock, cottage), from its vertices
    const g = scene.children.find(c => Math.hypot(c.position.x - ri.x, c.position.z - ri.z) < 1 && c.getObjectByName('trees'))
    const o = g ? { x: ri.x, z: ri.z, r: 0, top: -1e9 } : { ...ri, r: ri.r + 6, top: ri.top + 13 } // shortcut: rockisle.glb as measured, if landmarks regroups it
    const v = new THREE.Vector3()
    g?.updateMatrixWorld(true)
    g?.traverse(m => { if (m.isMesh) for (let i = 0, p = m.geometry.attributes.position; i < p.count; i++) {
      v.fromBufferAttribute(p, i); m.localToWorld(v); o.top = Math.max(o.top, v.y); o.r = Math.max(o.r, Math.hypot(v.x - o.x, v.z - o.z))
    } })
    return Object.assign(o, { clear: o.r + SIDE + CLEAR, floor: o.top + DOWN + CLEAR }) // where the holder may be: outside clear, or over floor
  }
  const ri = ctx.landmarks?.rockisle, isle = ri && isleOf(ri)
  const trees = ctx.flora?.trees ?? []
  const towers = ctx.settlements?.towers ?? [{ x: -122, z: -390, r: 62, top: ctx.heightAt(-122, -396) + 60 }]
  const lifted = [...trees, ...towers], solids = isle ? [isle, ...lifted] : lifted
  const gap = (o, x, y, z) => Math.max(Math.hypot(x - o.x, z - o.z) - o.r - SIDE, y - DOWN - o.top) // body to cylinder, m (< 0 inside)
  // Lowest a flyer may be here: CLEAR over a tree or tower while its wings could be over it, falling off at 45° beyond.
  const floorAt = (x, z) => { let f = -1e9; for (const o of lifted) f = Math.max(f, o.top + DOWN + CLEAR - Math.max(0, Math.hypot(x - o.x, z - o.z) - o.r - SIDE - CLEAR)); return f }

  // --- free flight: figure-eight ahead of the hero; near mode: R=6 circle ~16 m ahead; the proof camera is aimed at it.
  const center = ctx.heroPos.clone().add(new THREE.Vector3(0, 0, -95)) // follows the hero with a ~5 s lag
  let slide = 0 // m sideways: the whole eight slides away from the rock island just far enough to keep its lobes off it
  const pos = (t, out) => {
    if (near) {
      const u = 0.95 * t + 1.0
      out.set(6 * Math.sin(u), 0, -16 + 6 * Math.cos(u))
      out.y = ctx.heightAt(out.x, out.z) + 16
    } else {
      // Figure-eight 65-125 m ahead of the (lagged) hero, ~14 m above them: 6-12 deg up, inside the
      // level hero camera's frame and close enough to read through the haze.
      const u = 0.13 * t
      out.set(center.x + slide + 60 * Math.sin(u), 0, center.z + 30 * Math.sin(2 * u))
      if (isle) { // skirt round the rock island: soft radial push to >= its clear radius (softplus keeps the turn smooth)
        const dx = out.x - isle.x, dz = out.z - isle.z, d = Math.hypot(dx, dz) || 1e-3, R = isle.clear, w = 12
        const k = (R + w * Math.log1p(Math.exp((d - R) / w))) / d
        out.x = isle.x + dx * k; out.z = isle.z + dz * k
      }
      out.y = Math.max(ctx.heightAt(out.x, out.z) + 10, center.y + 14 + 4 * Math.sin(0.7 * u), floorAt(out.x, out.z))
    }
    return out
  }
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), v0 = new THREE.Vector3(), v1 = new THREE.Vector3()
  const x = new THREE.Vector3(), y = new THREE.Vector3(), z = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0)
  const m = new THREE.Matrix4(), qF = new THREE.Quaternion(), cv = new THREE.Vector3()
  let rollF = 0, turnF = 0, t = 0
  const basis = (fwd, roll, q) => { // nose along fwd; bank: positive turn (CCW from above) lifts the left side -> negative roll about +Z
    z.copy(fwd).normalize(); x.crossVectors(up, z).normalize(); y.crossVectors(z, x)
    x.applyAxisAngle(z, roll); y.applyAxisAngle(z, roll)
    return q.setFromRotationMatrix(m.makeBasis(x, y, z))
  }
  const freePose = dt => { // the eight's pose now -> p0, v1 (velocity), qF
    cv.copy(center)
    center.lerp(p1.set(ctx.heroPos.x, ctx.heroPos.y, ctx.heroPos.z - 95), 1 - Math.exp(-dt / 5))
    if (isle && !near) {
      const dx = center.x - isle.x, want = Math.sign(dx || -1) * Math.max(0, 60 + isle.clear - Math.abs(dx)) // 60 m lobe + clear
        * smoothstep(isle.clear + 50 - Math.abs(center.z - isle.z), 0, 20) // only while the lobes' z band meets it
      slide = t < 0.1 ? want : slide + (want - slide) * (1 - Math.exp(-dt / 3))
    }
    cv.subVectors(center, cv).divideScalar(Math.max(dt, 1e-3)) // the centre's own drift: nose follows real travel
    const e = 0.2
    pos(t, p0); pos(t + e, p1)
    v1.subVectors(p1, p0).divideScalar(e).add(cv)
    pos(t - e, p1); v0.subVectors(p0, p1).divideScalar(e).add(cv)
    turnF = (v0.x * v1.z - v0.z * v1.x) / (v0.length() * v1.length() + 1e-6) / e // signed rad/s
    rollF += (clamp(turnF * 2.2, -0.6, 0.6) - rollF) * Math.min(1, dt * 2)
    basis(v1, rollF, qF)
  }

  // --- the integrator: everything that is not the free eight (landing, ridden, rejoining the eight)
  const P = new THREE.Vector3(), q = new THREE.Quaternion(), fwd = new THREE.Vector3()
  let psi = 0, spd = 0, vy = 0, yawRate = 0, roll = 0, climbS = 0
  const flown = { isle: Infinity, tree: Infinity, tower: Infinity } // closest approach actually flown off the eight (m)
  const fly = (dt, turn, speedT, vyT, minAlt) => { // turn -1..1 (+ = left), m/s, m/s, holder metres over the ground
    yawRate += (turn * 0.8 - yawRate) * Math.min(1, dt * 3)
    psi += yawRate * dt
    spd += clamp(speedT - spd, -7 * dt, 5 * dt)
    vy += clamp(vyT - vy, -10 * dt, 10 * dt)
    const y0 = P.y
    P.x += Math.sin(psi) * spd * dt; P.z += Math.cos(psi) * spd * dt; P.y += vy * dt
    const f = Math.max(ctx.heightAt(P.x, P.z) + minAlt, minAlt > 0 ? floorAt(P.x, P.z) : -1e9)
    if (P.y < f) { P.y = f; vy = Math.max(vy, 0) }
    if (isle && P.y < isle.floor) { // the island: out the nearer way, round its side or over its summit trees
      const dx = P.x - isle.x, dz = P.z - isle.z, d = Math.hypot(dx, dz) || 1e-3, R = isle.clear
      if (R - d > 0 && R - d < isle.floor - P.y) { P.x = isle.x + dx / d * R; P.z = isle.z + dz / d * R }
      else if (R - d > 0) { P.y = isle.floor; vy = Math.max(vy, 0) }
    }
    climbS += ((P.y - y0) / Math.max(dt, 1e-3) - climbS) * Math.min(1, dt * 6)
    if (isle) flown.isle = Math.min(flown.isle, gap(isle, P.x, P.y, P.z))
    for (const o of trees) flown.tree = Math.min(flown.tree, gap(o, P.x, P.y, P.z))
    for (const o of towers) flown.tower = Math.min(flown.tower, gap(o, P.x, P.y, P.z))
  }
  const flyPose = dt => {
    roll += (clamp(-yawRate * 2.2 * Math.min(1, spd / 15), -0.6, 0.6) - roll) * Math.min(1, dt * 2)
    const th = clamp(Math.atan2(climbS, Math.max(spd, 6)), -0.45, 0.45)
    fwd.set(Math.sin(psi) * Math.cos(th), Math.sin(th), Math.cos(psi) * Math.cos(th))
    basis(fwd, roll, q)
  }
  const steerTo = (tx, tz) => clamp(2 * Math.atan2(Math.sin(Math.atan2(tx - P.x, tz - P.z) - psi), Math.cos(Math.atan2(tx - P.x, tz - P.z) - psi)), -1, 1)

  // --- landing sites: firm meadow clear of water, sea, every keepClear circle, and the body CLEAR (+4 for the cut corner
  // of the last 40 m, flown straight) off any solid thing
  const clear = (sx, sz) => {
    const h = ctx.heightAt(sx, sz)
    if (h < -3) return false
    for (const c of ctx.keepClear) if (Math.hypot(sx - c.x, sz - c.z) < c.r + 9) return false
    for (const o of solids) if (Math.hypot(sx - o.x, sz - o.z) < o.r + SIDE + CLEAR + 4) return false
    for (let a = 0; a < 6.28; a += 0.785) {
      const ax = sx + 9 * Math.cos(a), az = sz + 9 * Math.sin(a)
      if ((ctx.pond?.inside(ax, az) ?? -1) > 0 || Math.abs(ctx.heightAt(ax, az) - h) > 2.5) return false
    }
    return true
  }
  const site = (px, pz) => {
    for (let r = 0; r <= 96; r += 8) for (let a = 0; a < 6.28; a += r ? 4 / r : 7) {
      const sx = px + r * Math.cos(a), sz = pz + r * Math.sin(a)
      if (clear(sx, sz)) return { x: sx, z: sz }
    }
    return { x: px, z: pz }
  }

  // --- states: free → land → touch → landed → takeoff → ridden | rejoin → free
  let state = 'free', st = 0, L = null, w = 0
  let landT = near ? Infinity : 50 // free-flight seconds until it lands near the hero on its own
  const go = s => { state = s; st = 0 }
  const leaveFree = () => {
    if (state !== 'free') return
    P.copy(p0); psi = Math.atan2(v1.x, v1.z); spd = Math.hypot(v1.x, v1.z); vy = v1.y; yawRate = -turnF; roll = rollF; climbS = v1.y
  }
  const dragon = ctx.dragon = {
    holder, model, seat: model.getObjectByName('rider-seat'), isle,
    get state() { return state },
    heading: () => psi,
    yawRate: () => yawRate,
    input: { turn: 0, speed: 14, climb: 0 }, // written by ride.js while ridden
    // Land near (px, pz) on the nearest clear meadow; final heading psiL, or straight in when omitted.
    land(px, pz, psiL) {
      if (!['free', 'rejoin', 'ridden'].includes(state)) return false
      if (state === 'rejoin') { P.copy(holder.position); w = 0 } // from where it is drawn, not the integrator under the blend
      leaveFree()
      L = { ...site(px, pz), final: false }
      L.psi = psiL ?? Math.atan2(L.x - P.x, L.z - P.z)
      go('land')
      return true
    },
    takeoff() { if (state === 'landed') { go('takeoff'); setClip('takeoff', true) } },
  }

  const ride = createRide(ctx, dragon)
  const update = dt => {
    t += dt; st += dt
    freePose(dt)
    if (state === 'free') {
      holder.position.copy(p0); holder.quaternion.copy(qF)
      setClip('fly')
      if (!ride.busy() && (landT -= dt) < 0) { // lands on its own beside the hero, ahead and to the right of his view
        const f = ctx.camera.getWorldDirection(cv).setY(0).normalize()
        dragon.land(ctx.heroPos.x + f.x * 20 - f.z * 12, ctx.heroPos.z + f.z * 20 + f.x * 12)
        landT = 90
      }
    } else if (state === 'land') {
      const dx = L.x - P.x, dz = L.z - P.z, d = Math.hypot(dx, dz), g = ctx.heightAt(L.x, L.z)
      const lx = Math.sin(L.psi), lz = Math.cos(L.psi), along = dx * lx + dz * lz
      L.final ||= along > 25 && Math.abs(dx * lz - dz * lx) < 0.6 * along // lined up behind the spot
      const ax = L.x - lx * 55, az = L.z - lz * 55 // else first the approach point, 55 m back along the final heading
      const turn = L.final ? (d < 6 ? 0 : steerTo(L.x, L.z)) : steerTo(ax, az)
      const yT = g + (L.final ? Math.min(24, d * 0.3) : 26) // glide slope
      fly(dt, turn, L.final ? clamp(d * 0.6 + 2, 0, 18) : 20, clamp((yT - P.y) * 0.8, L.final ? -8 : -12, 8), L.final && d < 40 ? 0 : 3)
      if (L.final && d < 6) { P.x += dx * Math.min(1, dt * 2); P.z += dz * Math.min(1, dt * 2); psi += Math.atan2(Math.sin(L.psi - psi), Math.cos(L.psi - psi)) * Math.min(1, dt * 1.5) }
      flyPose(dt)
      holder.position.copy(P); holder.quaternion.copy(q)
      setClip(spd > 10 ? 'fly' : 'hover')
      if (L.final && d < 2.5 && P.y - g < 0.8) { go('touch'); setClip('land', true) }
    } else if (state === 'touch' || state === 'landed' || state === 'takeoff') {
      P.y += (ctx.heightAt(P.x, P.z) - P.y) * Math.min(1, dt * 8); spd = vy = yawRate = climbS = 0
      flyPose(dt)
      holder.position.copy(P); holder.quaternion.copy(q)
      if (state === 'touch' && st > acts.land.getClip().duration) { go('landed'); setClip('idle') }
      if (state === 'landed' && !ride.busy()) { // nobody climbed on: back to the sky after a while or once he walks off
        const far = Math.hypot(ctx.heroPos.x - P.x, ctx.heroPos.z - P.z)
        if (far > 80 || (st > 40 && far > 25)) dragon.takeoff()
      }
      if (state === 'takeoff' && st > 1.5) { vy = 6; spd = 4; go(ride.busy() ? 'ridden' : 'rejoin'); setClip('fly') }
    } else { // ridden or rejoin: in the air on the integrator
      if (state === 'ridden') { const i = dragon.input; fly(dt, i.turn, i.speed, i.climb, 2) }
      else { // rejoin the eight: chase a point 2 s ahead on it, then blend onto it over 3 s
        pos(t + 2, p1)
        const d = P.distanceTo(p0)
        fly(dt, steerTo(p1.x, p1.z), 18 + clamp(d - 20, 0, 12), clamp((p1.y - P.y) * 0.6, -8, 8), 3)
        if (d < 30) w = Math.min(1, w + dt / 3)
      }
      flyPose(dt)
      const k = state === 'rejoin' ? smoothstep(w, 0, 1) : 0
      holder.position.lerpVectors(P, p0, k); holder.quaternion.slerpQuaternions(q, qF, k)
      setClip(spd > 10 ? 'fly' : 'hover')
      if (state === 'rejoin' && w >= 1) { w = 0; go('free') }
    }
    mixer.update(dt)
    if (near) ctx.camera.lookAt(holder.position) // proof mode only: hero camera is level, a 16 m-high dragon would sit out of frame
    holder.updateMatrixWorld(true)
    ride.update(dt)
  }
  update(0.016)

  const pathGap = list => { // closest the whole current eight comes to any of `list` (m; < 0 = inside its cylinder)
    const s = new THREE.Vector3(); let g = null
    if (list.length && !near) for (let i = 0; i < 500; i++) { pos(t + i * 0.1, s); for (const o of list) g = Math.min(g ?? 1e9, gap(o, s.x, s.y, s.z)) }
    return g && +g.toFixed(1)
  }
  const r1 = v => v === Infinity ? null : +v.toFixed(1)
  window.__probes.dragon = () => ({
    clip, state, alt: holder.position.y - ctx.heightAt(holder.position.x, holder.position.z),
    speed: state === 'free' ? v1.length() : spd, x: holder.position.x, z: holder.position.z,
    isleGap: isle && pathGap([isle]), treeGap: pathGap(trees), towerGap: pathGap(towers),
    flown: { isle: r1(flown.isle), tree: r1(flown.tree), tower: r1(flown.tower) },
    land: L && { x: +L.x.toFixed(1), z: +L.z.toFixed(1), final: L.final, d: +Math.hypot(L.x - P.x, L.z - P.z).toFixed(1) },
  })
  return { update }
}
