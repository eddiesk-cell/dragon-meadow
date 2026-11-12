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

  // Solid things, as upright cylinders {x, z, r, top}: trees and towers are flown over, the 80 m rock island round (or over
  // its top). shortcut: Crestwatch is one drum round its seven towers and 54 m keep until settlements publishes
  // ctx.settlements.towers; then those are used as they are.
  const ri = ctx.landmarks?.rockisle
  const trees = ctx.flora?.trees ?? []
  const towers = ctx.settlements?.towers ?? [{ x: -122, z: -390, r: 62, top: ctx.heightAt(-122, -396) + 60 }]
  const lifted = [...trees, ...towers]
  const gap = (o, x, y, z) => Math.max(Math.hypot(x - o.x, z - o.z) - o.r, y - o.top) // metres outside its cylinder (< 0 inside)
  // Lowest a flyer may be here: 6 m over a tree or tower within 12 m of it, falling off at 45° beyond, so it climbs over in time.
  const floorAt = (x, z) => { let f = -1e9; for (const o of lifted) f = Math.max(f, o.top + 6 - Math.max(0, Math.hypot(x - o.x, z - o.z) - o.r - 12)); return f }

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
      out.y = Math.max(ctx.heightAt(out.x, out.z) + 10, center.y + 14 + 4 * Math.sin(0.7 * u), floorAt(out.x, out.z))
      if (ri) { // skirt round the rock island: soft radial push to >= r + 8 (softplus keeps the turn smooth)
        const dx = out.x - ri.x, dz = out.z - ri.z, d = Math.hypot(dx, dz) || 1e-3, R = ri.r + 8, w = 12
        const k = (R + w * Math.log1p(Math.exp((d - R) / w))) / d
        out.x = ri.x + dx * k; out.z = ri.z + dz * k
      }
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
    if (ri && !near) {
      const dx = center.x - ri.x, want = Math.sign(dx || -1) * Math.max(0, 68 + ri.r - Math.abs(dx)) // 60 m lobe + 8 m clear
        * smoothstep(ri.r + 58 - Math.abs(center.z - ri.z), 0, 20) // only while the lobes' z band meets it
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
    if (ri && minAlt > 0 && P.y < ri.top + 6) { // below the rock's top: slide round it, 12 m off its apron
      const dx = P.x - ri.x, dz = P.z - ri.z, d = Math.hypot(dx, dz) || 1e-3, R = ri.r + 12
      if (d < R) { P.x = ri.x + dx / d * R; P.z = ri.z + dz / d * R }
    }
    climbS += ((P.y - y0) / Math.max(dt, 1e-3) - climbS) * Math.min(1, dt * 6)
    if (ri) flown.isle = Math.min(flown.isle, gap(ri, P.x, P.y, P.z))
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

  // --- landing sites: firm meadow clear of water, sea, every keepClear circle, and 12 m off any solid thing
  const clear = (sx, sz) => {
    const h = ctx.heightAt(sx, sz)
    if (h < -3) return false
    for (const c of ctx.keepClear) if (Math.hypot(sx - c.x, sz - c.z) < c.r + 9) return false
    for (const o of [...lifted, ...(ri ? [ri] : [])]) if (Math.hypot(sx - o.x, sz - o.z) < o.r + 12) return false
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
    holder, model, seat: model.getObjectByName('rider-seat'),
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
    ride: null, // set below: true while someone sits on it
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
      fly(dt, turn, L.final ? clamp(d * 0.6 + 2, 0, 18) : 20, clamp((yT - P.y) * 0.8, -8, 8), L.final && d < 40 ? 0 : 3)
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
  const isleGap = () => { // closest the whole current path comes to the rock island's apron edge (m; < 0 = inside it)
    const q2 = new THREE.Vector3(); let g = null
    if (ri && !near) for (let s = 0; s < 500; s++) { pos(t + s * 0.1, q2); g = Math.min(g ?? 1e9, Math.hypot(q2.x - ri.x, q2.z - ri.z) - ri.r) }
    return g
  }
  const r1 = v => v === Infinity ? null : +v.toFixed(1)
  window.__probes.dragon = () => ({
    clip, state, alt: holder.position.y - ctx.heightAt(holder.position.x, holder.position.z),
    speed: state === 'free' ? v1.length() : spd, x: holder.position.x, z: holder.position.z,
    isleGap: isleGap(), treeGap: pathGap(trees), towerGap: pathGap(towers),
    flown: { isle: r1(flown.isle), tree: r1(flown.tree), tower: r1(flown.tower) },
  })
  return { update }
}
