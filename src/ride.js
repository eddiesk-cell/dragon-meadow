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
  addEventListener('keydown', e => { const c = e.key.toLowerCase(); keys.add(c); if (c === 'e' && !e.repeat) pressE() })
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()))
  addEventListener('blur', () => keys.clear())
  const hint = document.createElement('div')
  hint.style.cssText = 'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);color:#fff;font:13px system-ui,sans-serif;opacity:.85;text-shadow:0 1px 3px #0008;pointer-events:none'
  document.body.append(hint)

  let mode = 'foot', mt = 0, lean = 0 // foot | mount | ride | dismount; mt: seconds in this mode
  const from = new THREE.Vector3(), to = new THREE.Vector3(), fromQ = new THREE.Quaternion(), toQ = new THREE.Quaternion()
  const seatW = new THREE.Vector3(), v = new THREE.Vector3(), M0 = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0)
  const camPos = new THREE.Vector3(), look = new THREE.Vector3(), camWas = new THREE.Vector3(), qWas = new THREE.Quaternion(), qMine = new THREE.Quaternion()
  const down = new THREE.Vector3() // where the hop off lands
  const log = [], note = e => log.push([e, +ctx.time.toFixed(1)])

  const seat = () => d.seat.getWorldPosition(seatW)
  const reach = () => { seat(); return Math.hypot(heroPos.x - seatW.x, heroPos.z - seatW.z) }
  const flank = out => { // ground 5 m out from the seat, on his side of it
    seat(); v.set(1, 0, 0).applyQuaternion(d.holder.quaternion).setY(0).normalize()
    if (v.x * (heroPos.x - seatW.x) + v.z * (heroPos.z - seatW.z) < 0) v.negate()
    out.set(seatW.x + v.x * 5, 0, seatW.z + v.z * 5)
    return out.setY(ctx.heightAt(out.x, out.z))
  }
  const onSeat = out => { // where his root goes so his hips sit on the saddle, in this frame's pose
    seat(); root.updateMatrixWorld(true)
    hips.getWorldPosition(v); root.worldToLocal(v)
    return out.copy(v).applyQuaternion(d.holder.quaternion).negate().add(seatW)
  }

  function pressE() {
    if (!can) return
    if (mode === 'ride' && d.state === 'ridden') { // land ahead, along the heading
      const h = d.heading(), p = d.holder.position
      if (d.land(p.x + Math.sin(h) * 45, p.z + Math.cos(h) * 45, h)) note('land')
    } else if (mode === 'foot' && d.state === 'landed' && reach() < 7) {
      mode = 'mount'; mt = 0; note('mount')
      from.copy(root.position); fromQ.copy(root.quaternion); camPos.copy(camera.position)
      seat(); ctx.heroAct.face(seatW.x - from.x, seatW.z - from.z)
      ctx.heroAct.play('Mount', { lockMove: true })
    } else if (mode === 'foot' && (d.state === 'free' || d.state === 'rejoin')) { // call it down ahead-right of his view
      const f = camera.getWorldDirection(v).setY(0).normalize()
      if (d.land(heroPos.x + f.x * 18 - f.z * 10, heroPos.z + f.z * 18 + f.x * 10)) note('called')
    }
  }

  // ?auto=ride: the same E and walking keys a player presses (dispatched to the page), and a pilot on the dragon's input.
  const auto = params.get('auto') === 'ride' && can
  const press = (c, on = true) => dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { key: c }))
  const hold = (c, on) => on !== keys.has(c) && press(c, on)
  const ri = ctx.landmarks?.rockisle, pond = ctx.pond
  const C = ri && pond ? { x: (ri.x + pond.x) / 2, z: (ri.z + pond.z) / 2 } : { x: 0, z: -100 }, R = 62, ALT = (ri?.top ?? 60) + 20
  let ap = auto ? 'call' : null, swept = 0, lastA = 0, dir = 1, home = null
  const pilot = () => {
    const p = d.holder.position, i = d.input
    if (ap === 'call' && ctx.time > 1 && d.state === 'free') { press('e'); press('e', false); ap = 'wait' }
    if (ap === 'wait' && d.state === 'landed') { note('landed'); ap = 'walk' }
    if (ap === 'walk') { // walk to his flank of it, camera-relative like the keys, then E
      const s = flank(to), f = camera.getWorldDirection(v).setY(0).normalize(), dx = s.x - heroPos.x, dz = s.z - heroPos.z
      const fw = dx * f.x + dz * f.z, rt = dx * -f.z + dz * f.x
      hold('w', fw > 0.6); hold('s', fw < -0.6); hold('d', rt > 0.6); hold('a', rt < -0.6)
      if (reach() < 6.5) { for (const c of 'wsad') hold(c, false); press('e'); press('e', false); ap = 'mounting' }
    }
    if (ap === 'mounting' && d.state === 'ridden') { home = p.clone(); note('takeoff'); ap = 'out' }
    if (ap === 'out' || ap === 'loop') { // climb out to a circle round the isle and the lake, once round, then home
      const a = Math.atan2(p.z - C.z, p.x - C.x), r = Math.hypot(p.x - C.x, p.z - C.z), h = d.heading()
      if (ap === 'out' && Math.abs(r - R) < 15) {
        ap = 'loop'; note('loop'); lastA = a
        dir = -Math.sin(a) * Math.sin(h) + Math.cos(a) * Math.cos(h) >= 0 ? 1 : -1 // round the way it is already heading
      }
      if (ap === 'loop') { swept += Math.atan2(Math.sin(a - lastA), Math.cos(a - lastA)) * dir; lastA = a }
      const c = ap === 'loop' ? a + 0.5 * dir : a
      const tx = C.x + R * Math.cos(c), tz = C.z + R * Math.sin(c), want = Math.atan2(tx - p.x, tz - p.z) - h
      i.turn = clamp(2 * Math.atan2(Math.sin(want), Math.cos(want)), -1, 1); i.speed = 24; i.climb = clamp((ALT - p.y) * 0.5, -8, 9)
      if (swept > Math.PI * 2) { note('loopDone'); if (d.land(home.x, home.z)) note('land'); ap = 'landing' }
    }
  }

  let lastHint = ''
  window.__probes.ride = () => ({ mode, auto: ap, log, swept: +swept.toFixed(2), loop: { C: [C.x, C.z], R, alt: ALT },
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
      const text = mode === 'ride' ? 'W fly · A D turn · Space up · Shift down · E land' : mode === 'foot' && d.state === 'landed' && reach() < 12 ? 'E — climb on the dragon' : ''
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
          from.copy(root.position); fromQ.copy(root.quaternion); flank(down)
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

      // Chase camera behind and above, leaning into turns; blended in over the mount and out over the hop down.
      lean += (clamp(d.yawRate() / 0.35, -1, 1) * 0.9 - lean) * Math.min(1, dt * 1.5)
      const h = d.heading() + lean, w = mode === 'mount' ? smoothstep(mt / 1.6, 0, 1) : mode === 'dismount' ? 1 - smoothstep(mt / 0.9, 0, 1) : 1
      seat()
      v.set(seatW.x - Math.sin(h) * 26, seatW.y + 9, seatW.z - Math.cos(h) * 26)
      v.y = Math.max(v.y, ctx.heightAt(v.x, v.z) + 2)
      camPos.lerp(v, 1 - Math.exp(-dt * 4))
      look.set(seatW.x + Math.sin(h) * 10, seatW.y + 1, seatW.z + Math.cos(h) * 10)
      camWas.copy(camera.position); qWas.copy(camera.quaternion)
      camera.position.copy(camPos); camera.lookAt(look); qMine.copy(camera.quaternion)
      camera.position.lerpVectors(camWas, camPos, w); camera.quaternion.slerpQuaternions(qWas, qMine, w)
    },
  }
}
