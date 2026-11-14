// Lane dragon-ride: E calls the dragon down beside the hero; walk to it once it has landed and press E to climb on; fly
// with the walking keys (W on, S slow, A/D turn, Space up, Shift down); E lands it ahead and he hops off.
// ?auto=ride plays it all for the proof clip: it is called down, he walks over and mounts, they fly a loop over the rock
// island and the lake, then land where they took off. Loaded by dragon.js (it needs the dragon's own state).
export function createRide(ctx, d) {
  const { THREE, camera, params, heroPos } = ctx
  const { clamp, smoothstep } = THREE.MathUtils
  const rig = ctx.heroRig, root = rig?.model.parent, hips = rig?.model.getObjectByName('hips')
  const can = !!(root && hips && d.seat && ctx.heroAct)

  const keys = new Set(), k = c => keys.has(c)
  addEventListener('keydown', e => { const c = e.key.toLowerCase(); keys.add(c); if (c === 'e') { window.__earlyE = false; if (!e.repeat) pressE() } })
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()))
  addEventListener('blur', () => keys.clear())
  const hint = document.createElement('div')
  hint.style.cssText = 'position:fixed;left:50%;bottom:52px;transform:translateX(-50%);color:#fff;font:13px system-ui,sans-serif;opacity:.85;text-shadow:0 1px 3px #0008;pointer-events:none'
  document.body.append(hint)

  let mode = 'foot', mt = 0, lean = 0 // foot | mount | ride | dismount; mt: seconds in this mode
  const from = new THREE.Vector3(), to = new THREE.Vector3(), fromQ = new THREE.Quaternion(), toQ = new THREE.Quaternion()
  const seatW = new THREE.Vector3(), v = new THREE.Vector3(), M0 = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0)
  const camPos = new THREE.Vector3(), look = new THREE.Vector3(), camWas = new THREE.Vector3(), qWas = new THREE.Quaternion(), qMine = new THREE.Quaternion(), qCam = new THREE.Quaternion()
  const down = new THREE.Vector3(), away = new THREE.Vector3() // where the hop off lands; his camera's side of him at the mount
  const sideCam = params.get('ridecam') === 'side' // proof view: from beside the saddle
  const log = [], note = e => log.push([e, +ctx.time.toFixed(1)])
  const track = [] // [t, x, y, z, state] once a second off the ground: where it really flew

  const seat = () => d.seat.getWorldPosition(seatW)
  const reach = () => { seat(); return Math.hypot(heroPos.x - seatW.x, heroPos.z - seatW.z) }
  const bodyGap = () => Math.hypot(heroPos.x - d.holder.position.x, heroPos.z - d.holder.position.z) // the landing search measures to the body
  const flank = (out, sx, sz) => { // ground 5 m out from the seat, on the side (sx, sz) points to
    seat(); v.set(1, 0, 0).applyQuaternion(d.holder.quaternion).setY(0).normalize()
    if (v.x * sx + v.z * sz < 0) v.negate()
    out.set(seatW.x + v.x * 5, 0, seatW.z + v.z * 5)
    return out.setY(ctx.heightAt(out.x, out.z))
  }
  const onSeat = out => { // where his root goes so his hips sit on the saddle, in this frame's pose
    seat(); root.updateMatrixWorld(true)
    hips.getWorldPosition(v); root.worldToLocal(v)
    return out.copy(v).applyQuaternion(d.holder.quaternion).negate().add(seatW)
  }

  let msg = '', msgT = 0, pending = false // msg: a one-off line over the hint; pending: call again once it is back in the air
  const say = t => { msg = t; msgT = 3 }
  const callAt = f => [heroPos.x + f.x * 18 - f.z * 10, heroPos.z + f.z * 18 + f.x * 10]
  const callDown = () => { // ahead-right of his view; the dragon picks the nearest clear ground round him
    const f = camera.getWorldDirection(v).setY(0).normalize()
    return d.land(...callAt(f), undefined, { x: heroPos.x, z: heroPos.z, fx: f.x, fz: f.z })
  }

  function pressE() {
    if (!can) return
    const s = d.state
    if (mode === 'ride' && s === 'ridden') { // land ahead, along the heading
      const h = d.heading(), p = d.holder.position
      if (d.land(p.x + Math.sin(h) * 45, p.z + Math.cos(h) * 45, h)) note('land'); else say('no room to land here')
    } else if (mode !== 'foot') return
    else if (s === 'landed' && reach() < 7) {
      mode = 'mount'; mt = 0; note('mount')
      from.copy(root.position); fromQ.copy(root.quaternion); camWas.copy(camera.position); qWas.copy(camera.quaternion); away.subVectors(camera.position, heroPos)
      seat(); ctx.heroAct.face(seatW.x - from.x, seatW.z - from.z)
      ctx.heroAct.play('Mount', { lockMove: true })
    } else if (s === 'free' || s === 'rejoin') { if (callDown()) note('called'); else say('no room to land here') }
    else if (s === 'landed' && bodyGap() > 20) { // landed far off: up again and called here, but only if that lands it nearer (else it would loop)
      const f = camera.getWorldDirection(v).setY(0).normalize(), n = d.site(...callAt(f), { x: heroPos.x, z: heroPos.z, fx: f.x, fz: f.z })
      if (n && n.r < bodyGap() - 3) { d.takeoff(); pending = true; note('recall') } else say('no room near you — walk to the dragon')
    }
    else if (s === 'takeoff') pending = true
    else say(s === 'landed' ? 'walk to the dragon and press E' : 'the dragon is coming')
  }

  // ?auto=ride: the same E and walking keys a player presses (dispatched to the page), and a pilot on the dragon's input.
  const auto = params.get('auto') === 'ride' && can
  const press = (c, on = true) => dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { key: c }))
  const hold = (c, on) => on !== keys.has(c) && press(c, on)
  const ri = d.isle, pond = ctx.pond // the rock island as the dragon keeps clear of it (summit trees included)
  let ap = auto ? 'call' : null, wps = [], over = { isle: false, lake: false }
  const pilot = () => {
    const p = d.holder.position, i = d.input
    if (ap === 'call' && ctx.time > 1 && d.state === 'free') { press('e'); press('e', false); ap = 'wait' }
    if (ap === 'wait' && d.state === 'landed') { note('landed'); ap = 'walk' }
    if (ap === 'walk') { // run to his flank of it, camera-relative like the keys, then E
      const s = flank(to, heroPos.x - seatW.x, heroPos.z - seatW.z), f = camera.getWorldDirection(v).setY(0).normalize(), dx = s.x - heroPos.x, dz = s.z - heroPos.z
      const fw = dx * f.x + dz * f.z, rt = dx * -f.z + dz * f.x
      hold('w', fw > 0.6); hold('s', fw < -0.6); hold('d', rt > 0.6); hold('a', rt < -0.6); hold('shift', reach() > 10)
      if (reach() < 6.5) { for (const c of ['w', 's', 'a', 'd', 'shift']) hold(c, false); press('e'); press('e', false); ap = 'mounting' }
    }
    if (ap === 'mounting' && d.state === 'ridden' && ri && pond) { // a loop from home: out past the lake's left, round behind
      ap = 'loop'; note('takeoff') // the rock, over its top, back over the lake, swing round, home
      const ux = (ri.x - p.x) / Math.hypot(ri.x - p.x, ri.z - p.z), uz = (ri.z - p.z) / Math.hypot(ri.x - p.x, ri.z - p.z)
      const at = (bx, bz, f, l, y, name) => ({ x: bx + ux * f + uz * l, z: bz + uz * f - ux * l, y, name }) // f along home→rock, l to its left
      const lk = Math.max(1, (ri.clear + 10) / Math.hypot(pond.x - ri.x, pond.z - ri.z)) // over the lake, out of the rock's clear ring
      wps = [at(p.x, p.z, 70, 70, 70), at(ri.x, ri.z, 90, 40, ri.floor + 8), at(ri.x, ri.z, 0, 0, ri.floor + 8, 'isle'),
        { x: ri.x + (pond.x - ri.x) * lk, z: ri.z + (pond.z - ri.z) * lk, y: pond.level + 40, name: 'lake' }, at(p.x, p.z, 10, -60, 35), { home: p.clone() }]
    }
    if (ap === 'loop') {
      if (ri) over.isle ||= Math.hypot(p.x - ri.x, p.z - ri.z) < ri.r && p.y > ri.top
      over.lake ||= pond.inside(p.x, p.z) > 0
      const wp = wps[0]
      if (wp.home) { note('loopDone'); if (d.land(wp.home.x, wp.home.z)) note('land'); ap = 'landing'; return }
      const want = Math.atan2(wp.x - p.x, wp.z - p.z) - d.heading()
      i.turn = clamp(2 * Math.atan2(Math.sin(want), Math.cos(want)), -1, 1); i.speed = 26; i.climb = clamp((wp.y - p.y) * 0.5, -8, 12)
      if (Math.hypot(wp.x - p.x, wp.z - p.z) < 25) { if (wp.name) note(wp.name); wps.shift() }
    }
  }

  let lastHint = ''
  window.__probes.ride = () => ({ view: (f => [+f.x.toFixed(2), +f.z.toFixed(2)])(camera.getWorldDirection(v).setY(0).normalize()), t: +ctx.time.toFixed(1), mode, auto: ap, log, track, over, wps: wps.length,
    heroAlt: +(heroPos.y - ctx.heightAt(heroPos.x, heroPos.z)).toFixed(2) })

  return {
    busy: () => mode !== 'foot',
    update(dt) {
      if (auto) pilot()
      else if (mode === 'ride') { const i = d.input
        i.turn = (k('a') || k('arrowleft')) - (k('d') || k('arrowright'))
        i.speed = k('w') || k('arrowup') ? 24 : k('s') || k('arrowdown') ? 6 : 14
        i.climb = k(' ') ? 8 : k('shift') ? -8 : 0
      }
      if (window.__earlyE) { window.__earlyE = false; pressE() } // an E pressed while loading (index.html records it)
      if ((msgT -= dt) < 0 || (d.state === 'landed' && reach() < 7)) msg = ''
      if (pending && (d.state === 'free' || d.state === 'rejoin')) { pending = false; if (!callDown()) say('no room to land here') }
      const text = mode === 'ride' ? 'W fly · A D turn · Space up · Shift down · E land' : mode !== 'foot' ? '' : msg
        || (pending || d.state === 'land' || d.state === 'touch' ? 'the dragon is coming' : d.state === 'landed' ? (reach() < 7 ? 'E — climb on the dragon' : 'walk to the dragon and press E') : '')
      if (text !== lastHint) hint.textContent = lastHint = text
      if (mode === 'foot') return

      // He sits on its back: hero.js put him (and the scabbard it aims) where he would stand; carry both up to the saddle.
      mt += dt
      M0.copy(root.matrixWorld).invert()
      onSeat(to); toQ.copy(d.holder.quaternion)
      if (mode === 'mount') { // a 1.3 s leap up onto the saddle while Mount plays, then up and away
        const s = smoothstep(mt / 1.3, 0, 1)
        root.position.lerpVectors(from, to, s).addScaledVector(up, 2.2 * Math.sin(Math.PI * s))
        root.quaternion.slerpQuaternions(fromQ, toQ, s)
        if (mt > 1.3) { mode = 'ride'; mt = 0; ctx.heroAct.play('Ride Idle', { loop: true, lockMove: true }); d.takeoff() }
      } else if (mode === 'ride') {
        root.position.copy(to); root.quaternion.copy(toQ)
        const h = d.heading(); ctx.heroAct.face(Math.sin(h), Math.cos(h)) // his own facing follows, so hero.js's turn agrees
        if (!ctx.heroAct.busy()) ctx.heroAct.play('Ride Idle', { loop: true, lockMove: true })
        if (d.state === 'landed') { // touched down: hop off on the near side
          mode = 'dismount'; mt = 0; note('dismount')
          from.copy(root.position); fromQ.copy(root.quaternion); flank(down, away.x, away.z) // the side his camera was on, so it comes back clear of the dragon
          ctx.heroAct.play('Jump', { lockMove: true, speed: 1.5 })
        }
      } else { // dismount: 0.9 s hop from the saddle to the ground beside it
        const s = smoothstep(mt / 0.9, 0, 1), h = d.heading()
        root.position.lerpVectors(from, down, s).addScaledVector(up, 1.2 * Math.sin(Math.PI * s))
        root.quaternion.slerpQuaternions(fromQ, toQ.setFromAxisAngle(up, h), s)
        if (mt > 0.9) { mode = 'foot'; root.position.copy(down); root.rotation.set(0, h, 0); ctx.heroAct.face(Math.sin(h), Math.cos(h)); ctx.heroAct.stop(); note('onFoot'); if (ap) ap = 'done' }
      }
      root.updateMatrixWorld(true)
      heroPos.copy(root.position)
      if (rig.sheath.parent === ctx.scene) rig.sheath.applyMatrix4(M0.premultiply(root.matrixWorld)) // same move for the scabbard
      if (mode === 'foot') return

      if (ctx.time - (track.at(-1)?.[0] ?? -9) >= 1) { const p = d.holder.position; track.push([+ctx.time.toFixed(1), Math.round(p.x), Math.round(p.y), Math.round(p.z), d.state]); if (track.length > 120) track.shift() }
      // Chase camera behind and above the rider, half-following its bank and climb so the wings keep their place in the frame;
      // blended in from where the walking camera was over the mount (arcing over the wing), and back out over the hop down.
      lean += (clamp(d.yawRate() / 0.5, -1, 1) * 0.3 - lean) * Math.min(1, dt * 1.5)
      const w = mode === 'mount' ? smoothstep(mt / 1.3, 0, 1) : mode === 'dismount' ? 1 - smoothstep(mt / 0.9, 0, 1) : 1
      qCam.setFromAxisAngle(up, d.heading() + lean).slerp(d.holder.quaternion, 0.6)
      seat()
      v.set(0, 2.8, -4.5).applyQuaternion(qCam).add(seatW)
      look.set(0, 0.6, 12).applyQuaternion(qCam).add(seatW)
      if (sideCam) { v.set(1, 0, 0).applyQuaternion(d.holder.quaternion).multiplyScalar(9).add(seatW); v.y += 1.5; look.copy(seatW) }
      v.y = Math.max(v.y, ctx.heightAt(v.x, v.z) + 2)
      camPos.lerp(v, mode === 'mount' ? 1 : 1 - Math.exp(-dt * 10)) // on the ground it sits on its mark; w alone blends it in
      if (mode !== 'mount') camWas.copy(camera.position), qWas.copy(camera.quaternion) // the hop down hands back to hero.js's camera
      camera.up.set(0, 1, 0).applyQuaternion(qCam); camera.position.copy(camPos); camera.lookAt(look); camera.up.set(0, 1, 0)
      qMine.copy(camera.quaternion)
      camera.position.lerpVectors(camWas, camPos, w).y += 4 * Math.sin(Math.PI * w) // over the wing, not through it
      camera.quaternion.slerpQuaternions(qWas, qMine, w)
    },
  }
}
