// Sword fighting (Lane combat). Contract: PLAN.md Phase 3 — reads ctx.heroAct, ctx.heroRig, ctx.monster, ctx.vfx,
// ctx.ring; the only shared state it writes is ctx.heroPos (rolls, lunges and knock-backs slide the hero; hero.js keeps
// his feet on the ground). Keys: R draw/sheathe · J or click attack (3-hit combo; hold = heavy swing) · K block · L roll.
// ?auto=fight plays a scripted fight against the troll through the same entry points the keys use.
export async function createCombat(ctx) {
  const { THREE, camera, params, heroAct, heroRig, heroPos: hero } = ctx
  if (!heroAct || !heroRig) throw new Error('needs ctx.heroAct and ctx.heroRig (sword props missing?)')
  const { sword, sheath, rightHand, model } = heroRig
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
  const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t) }
  const play = (clip, o) => heroAct.play(clip, o).catch(e => window.__errors.push(`combat: ${e.message}`))

  // ── Arms that follow the sword ──────────────────────────────────────────────────────────────────────────────
  // The hero's clips barely lift his arms, so here the sword leads: every move is a path of sword poses in his own
  // frame (+Z front, +X his left, +Y up; g = the grip's centre) and two-bone IK puts both hands on the grip.
  // Sword: blade +Y (guard ~0.14, tip 1.13), edges ±X, flats ±Z. Hand bones: fingers +Y, palm +Z, thumb +X on the
  // right hand and -X on the left. Right hand under the guard, left hand below it, palms on opposite sides.
  const root = model.parent, Q = () => new THREE.Quaternion(), M4 = () => new THREE.Matrix4()
  const bone = n => model.getObjectByName(n)
  const [rU, rL, lU, lL, lH, spine] = ['rightUpperArm', 'rightLowerArm', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'spine'].map(bone)
  if (!rU || !rL || !lU || !lL || !lH || !spine) throw new Error('hero rig is missing an arm or spine bone')
  const S = 0.9, PALM = V(0, 0.055, 0.025) // S: the sword's size on his back (scabbard scale)
  const GR = M4().compose(PALM, Q().setFromAxisAngle(V(0, 0, 1), -Math.PI / 2), V(S, S, S)).multiply(M4().makeTranslation(0, -0.03, 0))
  const GL = M4().compose(PALM, Q().setFromRotationMatrix(M4().makeBasis(V(0, -1, 0), V(-1, 0, 0), V(0, 0, -1))), V(S, S, S)).multiply(M4().makeTranslation(0, 0.09, 0))
  const GRi = GR.clone().invert(), GLi = GL.clone().invert()
  const SHEATH_L = M4().makeRotationZ(Math.PI).setPosition(0, 0.11, 0) // hero.js's own placement in the scabbard
  const W = V(), X = V(), Y = V(), Z = V(), mT = M4(), mW = M4(), sc = V()
  const swordQ = (q, b, n) => { // blade along b, flats facing n
    Y.copy(b).normalize(); Z.copy(n).addScaledVector(Y, -n.dot(Y)).normalize(); X.crossVectors(Y, Z)
    return q.setFromRotationMatrix(mT.makeBasis(X, Y, Z))
  }
  const pose = (g, b, n) => ({ g: V(...g), q: swordQ(Q(), V(...b), V(...n)) })
  const READY = pose([-0.2, 1.36, 0.24], [-0.15, 0.55, -0.82], [1, 0, 0]) // carried on the right shoulder: reads from behind
  const GUARD = pose([0, 1.3, 0.3], [0.75, 0.62, 0.2], [0, 0, 1])
  // Swings: the blade turns through a plane, dir(θ) = A cos θ + B sin θ, flats facing A × B. Keys [u (0..1 of the
  // clip), θ°, grip x, y, z]; before the first key it eases in from wherever the sword was, after the last back to READY.
  const plane = (A, B, keys) => { const a = V(...A).normalize(), b = V(...B).normalize(); return { A: a, B: b, n: V().crossVectors(a, b).normalize(), keys } }
  const PATH = {
    diag: plane([-0.6, 0.8, 0], [0, 0, 1], [[0.26, -55, -0.24, 1.55, 0.05], [0.33, 40, -0.16, 1.4, 0.35], [0.42, 150, 0.1, 1.0, 0.38], [0.5, 185, 0.2, 0.9, 0.3], [0.7, 190, 0.18, 0.92, 0.28]]),
    horiz: plane([-1, 0, 0], [0, -0.12, 1], [[0.24, -45, -0.3, 1.3, 0.1], [0.32, 50, -0.1, 1.25, 0.38], [0.42, 165, 0.25, 1.2, 0.3], [0.68, 185, 0.25, 1.18, 0.22]]),
    stab: plane([0, 0, 1], [0, 1, 0], [[0.18, 8, -0.2, 1.12, -0.02], [0.28, 2, -0.06, 1.22, 0.55], [0.55, 2, -0.06, 1.2, 0.5]]),
    heavy: plane([0, 1, 0], [0, 0, 1], [[0.22, -55, -0.05, 1.72, -0.02], [0.36, -62, -0.05, 1.75, -0.04], [0.43, 60, -0.05, 1.5, 0.42], [0.5, 140, -0.05, 0.95, 0.48], [0.75, 145, -0.05, 0.95, 0.45]]),
  }
  const cur = { g: READY.g.clone(), q: READY.q.clone() } // the sword pose the arms aim for this frame
  const keyPose = (p, k, out) => { const r = k[1] * Math.PI / 180; out.g.set(k[2], k[3], k[4]); swordQ(out.q, W.copy(p.A).multiplyScalar(Math.cos(r)).addScaledVector(p.B, Math.sin(r)), p.n); return out }
  const kA = { g: V(), q: Q() }
  const mix = (a, b, f, out) => { out.g.lerpVectors(a.g, b.g, f); out.q.slerpQuaternions(a.q, b.q, f); return out }
  function pathPose(p, u, from) {
    const k = p.keys, last = k[k.length - 1]
    if (u <= k[0][0]) return mix(from, keyPose(p, k[0], kA), smooth(0, k[0][0], u), cur)
    if (u >= last[0]) return mix(keyPose(p, last, kA), READY, smooth(last[0], 1, u), cur)
    let i = 0; while (u > k[i + 1][0]) i++
    const f = smooth(k[i][0], k[i + 1][0], u), a = k[i], b = k[i + 1]
    return keyPose(p, [0, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f, a[4] + (b[4] - a[4]) * f], cur)
  }
  // The sword as it lies in the scabbard, in his frame; `lift` slides it out along the scabbard.
  const sheathPose = (out, lift) => {
    mT.copy(root.matrixWorld).invert().multiply(sheath.matrixWorld).multiply(SHEATH_L).decompose(out.g, out.q, sc)
    return out.g.addScaledVector(Y.set(0, -1, 0).applyQuaternion(out.q), lift), out
  }

  // Two-bone IK (world space): bend `upper`/`lower` so `hand` lands on `target`, the elbow toward `pole`.
  const p0 = V(), p1 = V(), p2 = V(), elb = V(), D = V(), qA = Q(), qB = Q(), qP = Q()
  const setWorldQ = (b, q) => { b.parent.getWorldQuaternion(qP); b.quaternion.copy(qP.invert().multiply(q)); b.updateMatrixWorld(true) }
  const aim = (b, from, to) => { qA.setFromUnitVectors(from.normalize(), to.normalize()); setWorldQ(b, b.getWorldQuaternion(qB).premultiply(qA)) }
  function reach(upper, lower, hand, target, pole) {
    upper.getWorldPosition(p0); lower.getWorldPosition(p1); hand.getWorldPosition(p2)
    const a = p0.distanceTo(p1), b = p1.distanceTo(p2)
    D.subVectors(target, p0)
    const d = Math.min(Math.max(D.length(), Math.abs(a - b) + 1e-3), a + b - 1e-3)
    D.normalize()
    const x = (a * a - b * b + d * d) / (2 * d), h = Math.sqrt(Math.max(a * a - x * x, 0))
    elb.subVectors(pole, p0); elb.addScaledVector(D, -elb.dot(D)).normalize().multiplyScalar(h).addScaledVector(D, x).add(p0)
    aim(upper, X.subVectors(p1, p0), Y.subVectors(elb, p0))
    lower.getWorldPosition(p1); hand.getWorldPosition(p2)
    aim(lower, X.subVectors(p2, p1), Y.copy(D).multiplyScalar(d).add(p0).sub(p1))
  }
  // Put both hands on the sword pose `cur`, weighted against the clip's own arms by w (0..1); two = left hand too.
  const pT = V(), qT = Q(), qH = Q(), UPY = V(0, 1, 0), pole = V()
  function holdSword(w, two) {
    if (w < 1e-3) return
    setWorldQ(spine, spine.getWorldQuaternion(qB).premultiply(qA.setFromAxisAngle(UPY, w * THREE.MathUtils.clamp((cur.g.x - READY.g.x) * 1.4, -0.45, 0.45)))) // the body turns with the blade
    const side = (hand, upper, lower, sgn) => {
      mT.decompose(pT, qT, sc)
      hand.getWorldPosition(p2); hand.getWorldQuaternion(qH)
      pT.lerpVectors(p2, pT, w); qH.slerp(qT, w) // (slerpQuaternions would alias qT)
      upper.getWorldPosition(pole).add(W.set(sgn, -0.7, -0.5).applyQuaternion(root.quaternion)) // elbows out, down, back
      reach(upper, lower, hand, pT, pole)
      setWorldQ(hand, qH)
    }
    mW.compose(cur.g, cur.q, sc.setScalar(S)).premultiply(root.matrixWorld)
    mT.multiplyMatrices(mW, GRi); side(rightHand, rU, rL, -1)
    if (two) { sword.updateWorldMatrix(false, false); mT.multiplyMatrices(sword.parent === rightHand ? sword.matrixWorld : mW, GLi); side(lH, lU, lL, 1) }
  }
  const inHand = () => { rightHand.add(sword); GR.decompose(sword.position, sword.quaternion, sword.scale) }
  const inSheath = () => { sheath.add(sword); sword.position.set(0, 0.11, 0); sword.rotation.set(0, 0, Math.PI); sword.scale.setScalar(1) }

  // Draw (R): reach over the shoulder for the hilt, pull it up out of the scabbard, bring it round to READY.
  // Sheathe runs the same path backwards. u: 0 = sheathed, hand on its own; 1 = at READY.
  let drawn = false, move = null, w = 0 // move: { u, dir: +1 draw | -1 sheathe }
  const DRAW_T = 0.9, GRAB = 0.3, held2 = { g: V(), q: Q() }
  function toggle() {
    if (move || dead) return
    drawn = !drawn
    move = { u: drawn ? 0 : 1, dir: drawn ? 1 : -1 }
    endSwing(); guard = false
    if (!drawn) heroAct.stop()
  }
  function stepMove(dt) {
    const was = move.u
    move.u = Math.min(Math.max(move.u + move.dir * dt / DRAW_T, 0), 1)
    const u = move.u
    if (move.dir > 0 && was < GRAB && u >= GRAB) inHand()
    if (move.dir < 0 && was > GRAB && u <= GRAB) inSheath()
    if (u < GRAB) sheathPose(cur, 0)
    else if (u < 0.6) sheathPose(cur, 0.45 * smooth(GRAB, 0.6, u))
    else mix(sheathPose(held2, 0.45), READY, smooth(0.6, 1, u), cur)
    w = smooth(0, GRAB, u)
    if (u === (move.dir > 0 ? 1 : 0)) move = null
  }

  // ── Hero actions: one at a time through ctx.heroAct; `doing` names the one combat started ─────────────────
  let doing = null, seq = 0
  const act = (what, clip, o) => { const id = ++seq; doing = what; return play(clip, o).then(() => { if (seq === id) doing = null }) }
  const faceMonster = range => {
    const m = ctx.monster
    if (m?.alive && Math.hypot(m.pos.x - hero.x, m.pos.z - hero.z) < range) heroAct.face(m.pos.x - hero.x, m.pos.z - hero.z)
  }

  // Attacks: the clip carries the body, PATH the sword. `hit` = the part of the clip (fraction) the blade can connect;
  // `chain` = from when the next combo step may cut in; `lunge` = metres stepped in over the hit window (clips are in place).
  const COMBO = [
    { clip: 'Slash (Diagonal)', path: PATH.diag, dur: 1.417, speed: 1.5, hit: [0.29, 0.47], chain: 0.55, dmg: 22, lunge: 0.6 },
    { clip: 'Slash (Horizontal)', path: PATH.horiz, dur: 1.208, speed: 1.45, hit: [0.27, 0.45], chain: 0.55, dmg: 24, lunge: 0.5 },
    { clip: 'Stab', path: PATH.stab, dur: 0.917, speed: 1.1, hit: [0.2, 0.36], chain: 0.6, dmg: 30, lunge: 0.9 },
  ]
  const HEAVY = { clip: 'Greatsword Swing', path: PATH.heavy, dur: 3.25, speed: 1.7, hit: [0.42, 0.53], chain: 0.8, dmg: 50, lunge: 0.8, heavy: true }
  const BLADE = [0.3, 0.5, 0.75, 1.0, 1.12].map(y => new THREE.Vector3(0, y, 0)) // sword-local sample points
  let swing = null, combo = -1, comboUntil = 0, want = null, hits = 0
  // shortcut: a still (zero-area) trail for the first frames compiles the trail shader at load, not on the first cut
  // (that froze a loaded desk ~4 s); vfx.js should warm it beside its particle layers, then this goes.
  let warm = ctx.vfx?.trail(sword, { base: BLADE[1], tip: BLADE[4] }), warmN = 0
  const tip = V(), tipPrev = V(), P = V(), dir = V()
  function startSwing(a) {
    if (!drawn || move) return
    faceMonster(7)
    const s = swing = { a, t: 0, struck: false, from: { g: cur.g.clone(), q: cur.q.clone() }, trail: null }
    sword.localToWorld(tipPrev.copy(BLADE[4]))
    act('swing', a.clip, { speed: a.speed, fade: 0.08, lockMove: true }).then(() => { if (swing === s) endSwing() })
  }
  function endSwing() { if (swing?.trail) swing.trail.stop(); if (swing && !swing.a.heavy) comboUntil = ctx.time + 0.6; swing = null }
  function strike(dt) { // after the arms have moved this frame
    const s = swing, a = s.a, f = s.t / a.dur
    if (s.trail === null && f > a.hit[0] - 0.1) s.trail = ctx.vfx?.trail(sword, { base: BLADE[0], tip: BLADE[4] }) // the cut, not the wind-up
    if (s.trail && f > a.hit[1] + 0.08) { s.trail.stop(); s.trail = false }
    sword.updateWorldMatrix(true, false)
    sword.localToWorld(tip.copy(BLADE[4]))
    if (f > a.hit[0] && f < a.hit[1]) {
      const m = ctx.monster, k = dt > 0 ? a.lunge * dt * a.speed / a.dur / (a.hit[1] - a.hit[0]) : 0
      if (k && (!m?.alive || Math.hypot(m.pos.x - hero.x, m.pos.z - hero.z) > m.radius + 1.0)) { // step in, not into it
        hero.x += Math.sin(model.parent.rotation.y) * k; hero.z += Math.cos(model.parent.rotation.y) * k
      }
      if (!s.struck && m?.alive) {
        for (const b of BLADE) { // any point of the blade inside the troll's body capsule
          sword.localToWorld(P.copy(b))
          if (P.y < m.pos.y - 0.2 || P.y > m.pos.y + m.height) continue
          const d = Math.hypot(P.x - m.pos.x, P.z - m.pos.z)
          if (d > m.radius + 0.15) continue
          s.struck = true; hits++
          dir.subVectors(tip, tipPrev); if (dir.lengthSq() < 1e-6) dir.set(m.pos.x - hero.x, 0, m.pos.z - hero.z)
          dir.normalize()
          m.takeHit({ dmg: a.dmg, dir: dir.clone(), point: P.clone() })
          const out = W.set(P.x - m.pos.x, 0, P.z - m.pos.z).normalize()
          ctx.vfx?.sparks(P, out, a.heavy ? 40 : 22)
          ctx.vfx?.slash(P, dir, a.heavy ? 1.6 : 1.2)
          ctx.vfx?.hitstop(a.heavy ? 120 : 60)
          if (a.heavy) { ctx.vfx?.shake(0.8, 0.45); ctx.vfx?.dust(W.set(P.x, ctx.heightAt(P.x, P.z), P.z), 1.6) }
          else ctx.vfx?.shake(0.25, 0.2)
          break
        }
      }
    }
    tipPrev.copy(tip)
  }

  // ── Block and roll ────────────────────────────────────────────────────────────────────────────────────────
  let guard = false, roll = null // roll: { t, dur, x, z }
  const ROLL = { speed: 1.8, dist: 4.2, iframes: [0.2, 0.95] } // i-frames in game seconds from the roll's start (the clip tumbles at 35–65 %)
  function setGuard(on) {
    if (dead || !drawn || move || on === guard) return
    guard = on
    if (on) { endSwing(); want = null; act('guard', 'Greatsword Guard', { loop: true, fade: 0.12, lockMove: true }) }
    else if (doing === 'guard') heroAct.stop()
  }
  function startRoll(dx, dz) {
    if (dead || roll || hurt) return
    if (!dx && !dz) { const yaw = model.parent.rotation.y; dx = Math.sin(yaw); dz = Math.cos(yaw) }
    const l = Math.hypot(dx, dz)
    endSwing(); want = null; guard = false
    heroAct.face(dx, dz)
    roll = { t: 0, dur: 2.333 / ROLL.speed, x: dx / l, z: dz / l }
    act('roll', 'Roll', { speed: ROLL.speed, fade: 0.08, lockMove: true }).then(() => { roll = null })
  }
  const rolling = () => roll && roll.t > ROLL.iframes[0] && roll.t < ROLL.iframes[1]
  function stepRoll(dt) {
    const f0 = smooth(0.25, 0.68, roll.t / roll.dur)
    roll.t += dt
    const step = (smooth(0.25, 0.68, roll.t / roll.dur) - f0) * ROLL.dist
    hero.x += roll.x * step; hero.z += roll.z * step
  }

  // ── The hero's health: the troll's hits, hit reactions, death, respawn at the ring's edge ──────────────────
  const MAX_HP = 100
  let hp = MAX_HP, dead = false, hurt = false, lastAtk = false
  function stepHurt() {
    const m = ctx.monster, a = m?.attack
    const fresh = a?.active && !lastAtk // one hit per attack window
    lastAtk = !!a?.active
    if (!fresh || dead || rolling()) return
    if (Math.hypot(a.center.x - hero.x, a.center.z - hero.z) > a.radius + 0.45 || a.center.y > hero.y + 2.2) { lastAtk = false; return } // missed: keep testing this window
    const facing = Math.cos(model.parent.rotation.y - Math.atan2(m.pos.x - hero.x, m.pos.z - hero.z)) > 0.3
    knock(hero.x - m.pos.x, hero.z - m.pos.z, guard ? 0.5 : 0.9)
    if (guard && facing) { // blocked: steel on stone
      sword.localToWorld(P.copy(BLADE[2]))
      ctx.vfx?.sparks(P, W.set(m.pos.x - hero.x, 0.5, m.pos.z - hero.z).normalize(), 30)
      ctx.vfx?.shake(0.4, 0.25); ctx.vfx?.hitstop(50)
      hp = Math.max(1, hp - Math.round(a.dmg * 0.1))
      return
    }
    hp -= a.dmg
    ctx.vfx?.flash(model); ctx.vfx?.shake(0.7, 0.35); ctx.vfx?.hitstop(80)
    endSwing(); want = null; guard = false
    if (hp <= 0) { hp = 0; die(); return }
    hurt = true
    heroAct.face(m.pos.x - hero.x, m.pos.z - hero.z)
    act('hurt', a.dmg >= 25 ? 'Stagger' : 'Hit (Front)', { fade: 0.06, lockMove: true }).then(() => { hurt = false })
  }
  function knock(dx, dz, d) { const l = Math.hypot(dx, dz) || 1; hero.x += dx / l * d; hero.z += dz / l * d }
  function die() {
    dead = true
    act('dead', 'Death (Collapse)', { fade: 0.1, lockMove: true, speed: 0.6 }).then(respawn) // heroAct cannot hold a pose: up again at the rim
  }
  function respawn() {
    const r = ctx.ring, m = ctx.monster
    if (r) { // on the rim, on the side he fell, facing in
      W.set(hero.x - r.center.x, 0, hero.z - r.center.z); if (W.lengthSq() < 1) W.set(0, 0, 1)
      W.normalize()
      hero.set(r.center.x + W.x * (r.radius + 6), 0, r.center.z + W.z * (r.radius + 6))
      hero.y = ctx.heightAt(hero.x, hero.z)
      heroAct.face(-W.x, -W.z)
    }
    hp = MAX_HP; dead = hurt = false; lastAtk = !!m?.attack?.active
    heroAct.stop()
  }

  // ── Input: keys and a click without drag (the drag belongs to the camera) ──────────────────────────────────
  let press = null // { t } while J / mouse is held: released early = light, held = heavy
  const attackDown = () => { press = { t: performance.now() } }
  const attackUp = () => { if (press && !press.heavy) want = 'light'; press = null }
  const held = new Set()
  addEventListener('keydown', e => {
    const k = e.key.toLowerCase()
    held.add(k)
    if (e.repeat) return
    if (k === 'r') toggle()
    else if (k === 'j') attackDown()
    else if (k === 'k') setGuard(true)
    else if (k === 'l') startRoll(...inputDir())
  })
  addEventListener('keyup', e => {
    const k = e.key.toLowerCase()
    held.delete(k)
    if (k === 'j') attackUp()
    else if (k === 'k') setGuard(false)
  })
  addEventListener('blur', () => { held.clear(); press = null; setGuard(false) })
  const el = ctx.renderer.domElement
  let click = null
  el.addEventListener('pointerdown', e => { if (e.button === 0 && !click) { click = { id: e.pointerId, x: e.clientX, y: e.clientY }; attackDown() } })
  addEventListener('pointermove', e => { if (click?.id === e.pointerId && Math.hypot(e.clientX - click.x, e.clientY - click.y) > 6) { click = null; press = null } })
  addEventListener('pointerup', e => { if (click?.id === e.pointerId) { click = null; attackUp() } })
  // Camera-relative WASD, as hero.js reads it (camera forward flattened).
  function inputDir() {
    const f = (held.has('w') || held.has('arrowup')) - (held.has('s') || held.has('arrowdown'))
    const r = (held.has('d') || held.has('arrowright')) - (held.has('a') || held.has('arrowleft'))
    camera.getWorldDirection(W); W.y = 0; W.normalize()
    return [W.x * f - W.z * r, W.z * f + W.x * r]
  }

  // ── Health bars ───────────────────────────────────────────────────────────────────────────────────────────
  const ui = document.createElement('div')
  ui.innerHTML = `<style>
    .cb{position:fixed;left:50%;transform:translateX(-50%);pointer-events:none;font:600 12px/1 system-ui,sans-serif;
      letter-spacing:.12em;color:#f3efe6;text-shadow:0 1px 2px #0006;transition:opacity .6s;opacity:0}
    .cb i{display:block;height:6px;margin-top:6px;background:#0005;border-radius:3px;overflow:hidden;box-shadow:0 0 0 1px #fff3}
    .cb b{display:block;height:100%;width:100%;border-radius:3px;transition:width .25s}
    #cbT{top:28px;width:min(420px,70vw);text-align:center} #cbT b{background:linear-gradient(#c96a4a,#9b3f2c)}
    #cbH{bottom:30px;width:min(220px,44vw)} #cbH b{background:linear-gradient(#d8e0a8,#9fb06a)}</style>
    <div class=cb id=cbT>BARROW TROLL<i><b></b></i></div><div class=cb id=cbH><i><b></b></i></div>`
  document.body.append(ui)
  const [barT, barH] = ['#cbT', '#cbH'].map(s => ui.querySelector(s))
  function stepBars() {
    const m = ctx.monster, near = m && m.state !== 'asleep' && Math.hypot(m.pos.x - hero.x, m.pos.z - hero.z) < 45
    barT.style.opacity = near && (m.alive || m.hp > 0) ? 1 : 0
    if (m) barT.firstElementChild.firstChild.style.width = `${(100 * m.hp) / m.maxHp}%`
    barH.style.opacity = drawn || hp < MAX_HP || near ? 1 : 0
    barH.firstElementChild.firstChild.style.width = `${hp}%`
  }

  // ── ?auto=fight: the demo. It presses the same buttons a player does ───────────────────────────────────────
  const auto = params.get('auto') === 'fight' && autoFight()

  window.__probes.combat = () => ({ drawn, w: +w.toFixed(2), u: swing ? +(swing.t / swing.a.dur).toFixed(3) : move ? +move.u.toFixed(3) : null, inHand: sword.parent === rightHand, hp, dead, doing, combo, hits, swing: swing?.a.clip ?? null, troll: ctx.monster ? { hp: ctx.monster.hp, state: ctx.monster.state } : null })
  return {
    update(dt) {
      if (warm && ++warmN > 4) { warm.stop(); warm = null }
      if (press && !press.heavy && performance.now() - press.t > 280) { press.heavy = true; want = 'heavy' }
      // Next attack: the first when free, the next combo step once the current swing has passed its chain point.
      if (want && !drawn && !move && !dead) toggle() // the first attack draws the sword
      if (want && drawn && !move && !dead && !hurt && !roll && !guard) {
        const f = swing ? swing.t / swing.a.dur : 1
        if (!swing || (f >= swing.a.chain && !swing.a.heavy)) {
          const next = want === 'heavy' ? HEAVY : COMBO[(combo = swing || ctx.time < comboUntil ? (combo + 1) % 3 : 0)]
          want = null; endSwing(); startSwing(next)
        }
      }
      // Where the sword goes, how much the arms follow it (none in a roll, a hit or a fall), then what it cuts.
      if (move) stepMove(dt)
      else if (swing) { swing.t += dt * swing.a.speed; pathPose(swing.a.path, swing.t / swing.a.dur, swing.from) }
      else if (drawn) mix(cur, guard ? GUARD : READY, 1 - Math.exp(-dt * 12), cur)
      if (!move) w = Math.min(Math.max(w + (drawn && !roll && !hurt && !dead ? dt : -dt) / 0.15, 0), 1)
      holdSword(w, sword.parent === rightHand)
      if (swing) strike(dt)
      if (roll) stepRoll(dt)
      stepHurt()
      if (auto) auto(dt)
      stepBars()
    },
  }

  function autoFight() {
    dispatchEvent(new KeyboardEvent('keyup', { key: 'w' })) // hero.js holds W for any ?auto=; the script steers itself
    const key = (k, down) => dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: k }))
    // When each troll attack lands, game seconds after it starts (monster.js ATTACKS: windT + (h0 - wind) / fast).
    // shortcut: reads the attack's name from the monster's probe; ask the monster lane for ctx.monster.attack.name if it moves.
    const LANDS = { smash: 1.38, slam: 1.38, kick: 0.82, punch: 0.63 }
    let placed = false, rest = null, won = null, atkN = 0, atkT = 0, lands = 0.8, plan = null, prev = ''
    const walkKeys = new Set()
    const steer = (on = []) => { for (const k of ['w', 'a', 's', 'd', 'shift']) if (on.includes(k) !== walkKeys.has(k)) { key(k, on.includes(k)); on.includes(k) ? walkKeys.add(k) : walkKeys.delete(k) } }
    const fire = k => { key(k, true); key(k, false) }
    // Room to fight: metres to the nearest standing stone or the barrow mound (the troll sleeps by its stone door).
    const r = ctx.ring
    const room = (x, z) => Math.min(99, ...(r?.stones ?? []).map(s => Math.hypot(x - s.pos.x, z - s.pos.z) - s.radius),
      r ? Math.hypot(x - r.barrow.pos.x, z - r.barrow.pos.z) - r.barrow.radius : 99)
    let lure = null // open ground on the camera's side of its bed, where the hero waits for it to come
    return dt => {
      const m = ctx.monster
      if (!m) return
      if (!placed) { // start where ?fight=1 does: a few steps from the sleeping troll, it ahead
        placed = true
        hero.set(m.pos.x - 2, 0, m.pos.z + 11); hero.y = ctx.heightAt(hero.x, hero.z)
        heroAct.face(0, -1)
        for (const ox of [-6, -3, 0, 3]) for (const oz of [7, 9, 11]) {
          const x = m.pos.x + ox, z = m.pos.z + oz
          if (!lure || room(x, z) > room(lure.x, lure.z)) lure = { x, z }
        }
      }
      if (m.state === 'asleep') return // let it wake on camera
      if (!m.alive || dead) {
        steer(); if (held.has('k')) key('k', false)
        if (!m.alive && drawn && !move && ctx.time - (won ??= ctx.time) > 2.5) fire('r') // the troll is down: sword home
        return
      }
      const dx = m.pos.x - hero.x, dz = m.pos.z - hero.z, d = Math.hypot(dx, dz)
      if (!drawn && !move && (m.state === 'stalk' || d < 9)) fire('r') // draw as it comes
      // Each troll attack: the first rolled through just before it lands, the rest blocked and punished.
      if (m.state === 'attack' && prev !== 'attack') {
        atkN++; atkT = 0; plan = atkN === 1 ? 'roll' : 'guard' // roll through the first, then block and punish
        lands = LANDS[window.__probes.monster?.().attack] ?? 0.8
      }
      prev = m.state
      if (m.state === 'attack') {
        atkT += dt
        if (plan === 'roll' && atkT >= lands - 0.45 && d < 7) { // sideways and past it, to the side with more room
          plan = null; steer()
          const side = s => [dx / d * 0.6 + dz / d * s, dz / d * 0.6 - dx / d * s]
          const [ax, az] = side(1), [bx, bz] = side(-1)
          startRoll(...(room(hero.x + ax * 3, hero.z + az * 3) > room(hero.x + bx * 3, hero.z + bz * 3) ? [ax, az] : [bx, bz]))
        }
        if (plan === 'guard' && d < 7 && !swing) { plan = 'guarding'; steer(); key('k', true) }
        if (plan === 'guarding' || roll) return
      } else if (plan === 'guarding') { key('k', false); plan = null }
      if (roll || hurt) return
      // Stand on the camera's side of it (+Z: the camera looks -Z) so the fight stays framed ahead. W/A/S/D picked
      // from the camera-relative direction to that spot, Shift when it is far.
      // Until it has come out into the open, wait for it there.
      const far = d > 6 && lure
      const sx = (far ? lure.x : m.pos.x) - hero.x, sz = (far ? lure.z : m.pos.z + m.radius + 1.3) - hero.z, sd = Math.hypot(sx, sz)
      camera.getWorldDirection(W); W.y = 0; W.normalize()
      const ahead = (W.x * dx + W.z * dz) / d // in reach and in front of the camera: fight from where he stands
      if (sd > 0.6 && (far || d > m.radius + 1.6 || ahead < 0.8)) {
        const fwd = (W.x * sx + W.z * sz) / sd, right = (-W.z * sx + W.x * sz) / sd
        steer([fwd > 0.38 && 'w', fwd < -0.38 && 's', right > 0.38 && 'd', right < -0.38 && 'a', sd > (far ? 4 : 1.2) && 'shift'])
        return
      }
      steer()
      if (far) return
      if (m.state === 'asleep' || m.state === 'waking' || m.state === 'roar' || want || press) return
      if (swing?.a.heavy) rest = { n: atkN, t: ctx.time } // after a full combo, give it room to swing back
      if (swing && (swing.a.heavy || swing.t / swing.a.dur < swing.a.chain)) return // chain the combo at its cut-in point
      if (rest && rest.n === atkN && ctx.time - rest.t < 3.5) return
      if (swing?.a === COMBO[2]) { key('j', true); setTimeout(() => key('j', false), 400) } // after the stab, held: the heavy swing
      else fire('j')
    }
  }
}
