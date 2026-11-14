// Lane springs — the hero's cloth: bandana tails and the shirt/vest hem hang off spring_<chain>_<n> bones
// (tools/hero/springs.py). Each joint is a damped spring particle in world space: it trails the body (inertia), eases
// back toward its rest direction, feels gravity, air drag and ctx.windAt (the same gusts that move the grass), and is
// pushed out of the head, neck, shoulders, hips and thighs. Fixed-size substeps keep it stable from 20 to 144 fps, and the
// rest pose and colliders glide from last frame's pose to this one across them, so a slow frame lands where a fast one does.

export const PART = {
  // k: pull to rest (1/s²)  air: body speed (m/s) at which that pull has halved, so the air of a run beats the knot's shape
  // wind: air-drag coupling (1/s)  grav: share of gravity  lift: tails raised above the sculpt (rad)  damp: internal (1/s)  max: swing cap (rad)  flutter: ripple on the
  // wind  inertia: share of the body's own jolts (start, stop, jump) the cloth lags behind; the rest it is simply carried
  // The knot is starched cotton: standing, it holds the tails out to his side (as drawn) and only a third of their weight sags them.
  // Running, the knot turns them back and out (`stream`: out, back in his frame; each tail keeps its sculpted rise or droop, so
  // the two fan apart), the loose ends straighten and the knot's pull grows (×1 + taut), so the tails trail behind and out
  // past his hair instead of being blown flat onto his skull; the air bends only the loose ends. lee: share of the ambient
  // gust a run hides (an art call: the run sets where the tails point, gusts only stir them; at full strength a crosswind
  // wraps them round the back of his head). max per bone: the knot swings at most 1.1 rad, the loose ends take the rest.
  bandana: { k: 380, air: 1.5, wind: 2.6, grav: 0.35, lift: 0.3, damp: 12, max: [1.1, 1.75, 1.75], flutter: 1.6, inertia: 0.6, stream: [0.7, 0.71], taut: 2, lee: 0.6 },
  // leg: how far a hem panel's resting place follows its thigh (0 at the belt → leg at the hem), so it swings with the stride
  hem: { k: 230, air: 0, wind: 1.0, grav: 1, damp: 9, max: 0.8, flutter: 0.4, inertia: 0.3, leg: 0.55 },
  // root: a stiff appendage (the Rootbinder's crown roots): held to its sculpt, near critically damped (settles in ~0.4 s),
  // a trace of gravity, no wind, a small cap. follow: damping pulls each joint toward its own rest-pose velocity, not the
  // chain root's, so a turning head carries the roots round instead of dragging them; they lag only its jolts
  // len: rig length (m) at which a segment's pull is k; shorter segments pull harder so every root bends the same angle
  // under the same jolt. hard: the pull grows with the bend (×1 + hard at the cap), so a flinch is caught short of the cap
  root: { k: 250, air: 0, wind: 0, grav: 0.05, damp: 30, max: 0.35, flutter: 0, inertia: 1, follow: true, len: 0.07, hard: 14 },
}
const STEP = 1 / 120, G = -9.8

// opts, for another model's appendages: { model, prefix (bone names, e.g. 'spring_crown'), kind (a PART key), probe }.
// No colliders, no wind. Without opts: the hero, exactly as before.
export async function createSprings(ctx, opts) {
  const { THREE, heroPos } = ctx
  const model = opts ? opts.model : ctx.heroRig?.model
  if (!model) throw new Error('no ctx.heroRig.model')
  const V = () => new THREE.Vector3()
  const named = {}
  model.traverse(o => { if (o.name.startsWith(opts?.prefix || 'spring_')) named[o.name] = o })
  const bone = n => model.getObjectByName(n)
  model.updateWorldMatrix(true, true) // still the bind pose: hero has not animated yet
  const wp = o => o.getWorldPosition(V())

  // Colliders: capsules A→B (a sphere when A = B) fixed to a body bone, written in the bind pose.
  // A, B: where it is this substep; A0/B0 last frame, A1/B1 this frame
  const cap = (on, A, B, r) => ({ on: bone(on), a: bone(on).worldToLocal(A.clone()), b: bone(on).worldToLocal(B.clone()), r, A: V(), B: V(), A0: V(), B0: V(), A1: A.clone(), B1: B.clone() })
  // gravity in rig units: a model drawn s times its rig size sags the same angle (k and damping are per second, scale-free)
  const gs = opts ? model.getWorldScale(V()).y : 1
  let UPPER = [], LOWER = []
  if (!opts) {
  const head = wp(bone('head')), top = wp(bone('HeadTop_End'))
  const headC = head.clone().lerp(top, 0.45)
  UPPER = [
    cap('head', headC, headC, 0.13), // skull + spiky hair
    cap('head', ...Array(2).fill(headC.clone().add(new THREE.Vector3(0, -0.07, 0.11))), 0.085), // the face: tails never blow across it
    cap('neck', wp(bone('neck')), head, 0.06),
    cap('upperChest', wp(bone('upperChest')), wp(bone('neck')), 0.11),
    ...['left', 'right'].flatMap(s => [
      cap(s + 'Shoulder', wp(bone(s + 'Shoulder')), wp(bone(s + 'UpperArm')), 0.065),
      cap(s + 'UpperArm', wp(bone(s + 'UpperArm')), wp(bone(s + 'LowerArm')), 0.055),
    ]),
  ]
  LOWER = [
    cap('hips', wp(bone('hips')), wp(bone('hips')), 0.12),
    ...['left', 'right'].map(s => cap(s + 'UpperLeg', wp(bone(s + 'UpperLeg')), wp(bone(s + 'LowerLeg')), 0.12)), // baggy trousers
  ]
  }

  const closest = (p, c, out) => { // point on capsule c's axis nearest p
    const l2 = ab.subVectors(c.B, c.A).lengthSq()
    const t = l2 > 1e-9 ? Math.min(1, Math.max(0, tmp.subVectors(p, c.A).dot(ab) / l2)) : 0
    return out.copy(c.A).addScaledVector(ab, t)
  }
  const tmp = V(), tmp2 = V(), ab = V()

  const chains = []
  for (const n of Object.keys(named)) {
    const m = n.match(/^spring_(.+)_0$/)
    if (!m) continue
    const bones = []
    for (let i = 0; named[`spring_${m[1]}_${i}`]; i++) bones.push(named[`spring_${m[1]}_${i}`])
    const end = named[`spring_${m[1]}_end`]
    if (!end) throw new Error(`spring_${m[1]} has no _end tip`)
    const nodes = [...bones, end], kind = opts?.kind || (m[1].startsWith('bandana') ? 'bandana' : 'hem')
    const rest = nodes.map(wp), cols = opts ? [] : kind === 'bandana' ? UPPER : LOWER
    for (const c of cols) { c.A.copy(c.A1); c.B.copy(c.B1) }
    const restQ = bones.map(b => b.quaternion.clone())
    // The sculpt's tails stick out sideways, a little forward and droopier than drawn: lift them `lift` and aim them 35° back
    // (about the head's up axis) so wind and running sweep them behind the head, not over the face. From the front they
    // still stream out to his side, as in art/hero/hero-front-nosword.png. (Which side: in the model's own frame, so a root
    // already turned at load cannot flip it forward.)
    let runQ
    if (kind === 'bandana') {
      const sg = Math.sign(model.worldToLocal(rest[1].clone()).x - model.worldToLocal(rest[0].clone()).x)
      // streaming rest: bone 0 turned (in world, at bind) from its sculpted direction to `stream` in his frame, out to his side
      const [o, b] = PART.bandana.stream, rot = model.getWorldQuaternion(new THREE.Quaternion())
      const u = model.worldToLocal(rest[1].clone()).sub(model.worldToLocal(rest[0].clone())).normalize().y
      const to = new THREE.Vector3(o * sg, u, -b).normalize().applyQuaternion(rot), hq = bones[0].parent.getWorldQuaternion(new THREE.Quaternion())
      const R = new THREE.Quaternion().setFromUnitVectors(rest[1].clone().sub(rest[0]).normalize(), to)
      runQ = [hq.clone().invert().multiply(R).multiply(hq).multiply(restQ[0])]
      for (let i = 1; i < bones.length; i++) { // the loose ends run straight on from the bone above (same twist, no curl)
        const cd = nodes[i + 1].position.clone().normalize().applyQuaternion(restQ[i])
        runQ.push(new THREE.Quaternion().setFromUnitVectors(cd, bones[i].position.clone().normalize()).multiply(restQ[i]))
      }
      restQ[0].premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.6 * sg, PART.bandana.lift * sg, 'YXZ')))
    }
    const leg = kind === 'hem' && bone(rest[0].x > 0 ? 'leftUpperLeg' : 'rightUpperLeg') // the thigh on this panel's side
    chains.push({
      name: m[1], p: PART[kind], cols, bones, nodes, restQ, runQ, leg, legLocal: leg && rest.map(r => leg.worldToLocal(r.clone())),
      len: rest.slice(1).map((r, i) => r.distanceTo(rest[i])),
      // per joint, per collider: never closer than the cloth sits at rest, so nothing is pushed while standing still
      rad: rest.map(r => cols.map(c => Math.min(c.r, 0.95 * r.distanceTo(closest(r, c, tmp2))))),
      rest, prev: rest.map(V), rs: rest.map(V), x: rest.map(r => r.clone()), v: rest.map(V), spd: 0, phase: chains.length * 1.7, ready: false,
    })
  }
  if (!chains.length) throw new Error(opts ? `no ${opts.prefix}*_0 bones` : 'hero.glb has no spring_ bones (rebuild with tools/hero/build.sh)')

  const q = new THREE.Quaternion(), wq = new THREE.Quaternion(), pq = new THREE.Quaternion(), sc = V(), hp = V()
  const wind = V(), wc = V(), rel = V(), wj = V(), acc = V(), off = V(), d = V(), cur = V(), vroot = V(), pOld = V(), carry = V(), vlag = V()
  const COLS = [...UPPER, ...LOWER], nrm = V(), vcol = V()
  let fresh = true
  let maxSwing = 0, knotSwing = 0
  const nb = chains.reduce((a, c) => a + c.bones.length, 0)
  if (opts) window.__probes[opts.probe] = () => Object.fromEntries(chains.map(c => [c.name, { swingDeg: Math.round(c.sw * 57.3), atCap: c.atCap }]))
  else window.__probes.springs = () => ({ chains: chains.length, bones: nb, maxSwingDeg: Math.round(maxSwing * 57.3), knotSwingDeg: Math.round(knotSwing * 57.3) })

  return {
    update(dt, t) {
      if (!(dt > 0)) return
      model.updateWorldMatrix(true, true)
      const w = ctx.windAt?.(heroPos.x, heroPos.z, t)
      wind.set(w?.x ?? 0, 0, w?.y ?? 0)
      const n = Math.min(12, Math.ceil(dt / STEP)), h = dt / n
      maxSwing = knotSwing = 0
      for (const k of COLS) {
        k.A0.copy(k.A1); k.B0.copy(k.B1)
        k.on.localToWorld(k.A1.copy(k.a)); k.on.localToWorld(k.B1.copy(k.b))
        if (fresh || k.A0.distanceTo(k.A1) > 1) { k.A0.copy(k.A1); k.B0.copy(k.B1) }
      }
      fresh = false
      for (const c of chains) {
        c.rest.forEach((r, i) => c.prev[i].copy(r)) // last frame's rest pose
        // the rest pose under this frame's animation: where every joint would be with no cloth physics
        const air = c.p.air, a = air ? c.spd ** 2 / (c.spd ** 2 + air ** 2) : 0 // 0 standing → 1 running (last frame's speed)
        c.bones.forEach((b, i) => b.quaternion.copy(c.restQ[i]))
        if (c.runQ) c.bones.forEach((b, i) => b.quaternion.slerp(c.runQ[i], a))
        c.bones[0].updateMatrixWorld(true)
        c.nodes.forEach((o, i) => c.rest[i].setFromMatrixPosition(o.matrixWorld))
        if (c.leg) for (let j = 1; j < c.rest.length; j++) c.rest[j].lerp(tmp.copy(c.legLocal[j]).applyMatrix4(c.leg.matrixWorld), c.p.leg * j / (c.rest.length - 1))
        if (!c.ready || c.prev[0].distanceTo(c.rest[0]) > 1) { // first frame or a teleport: start at rest
          c.rest.forEach((r, i) => { c.x[i].copy(r); c.v[i].set(0, 0, 0); c.prev[i].copy(r) })
          c.ready = true
        }
        const { wind: cw, grav, damp, max, flutter, inertia } = c.p
        vroot.subVectors(c.rest[0], c.prev[0]).divideScalar(dt)
        c.spd += (Math.hypot(vroot.x, vroot.z) - c.spd) * (1 - Math.exp(-dt * 4)) // his travel speed, not the bob of a stride
        const kAir = c.p.k * (1 - a), kKnot = c.p.k * (1 + (c.p.taut || 0) * a) // loose ends give way to the air; the knot holds
        carry.copy(vroot).multiplyScalar(1 - inertia) // world velocity = simulated v + carry: drag sees all of it
        vlag.copy(vroot).multiplyScalar(inertia)       // internal damping pulls the simulated part toward this
        const fade = Math.exp(-damp * h)
        wc.copy(wind).multiplyScalar(1 - (c.p.lee || 0) * a)
        rel.subVectors(wc, vroot) // the air he moves through: flutter grows with it, standing in a breeze or running
        for (let s = 0; s < n; s++) {
          const ts = t - dt + (s + 1) * h
          pOld.lerpVectors(c.prev[0], c.rest[0], s / n)
          const f = (s + 1) / n // the rest pose, the pinned root and the colliders glide with the body across substeps
          c.rs.forEach((r, i) => r.lerpVectors(c.prev[i], c.rest[i], f))
          for (const col of c.cols) { col.A.lerpVectors(col.A0, col.A1, f); col.B.lerpVectors(col.B0, col.B1, f) }
          c.x[0].copy(c.rs[0])
          for (let j = 1; j < c.x.length; j++) c.x[j].addScaledVector(carry, h) // carried with the body
          for (let j = 1; j < c.x.length; j++) {
            const x = c.x[j], v = c.v[j], prev = c.x[j - 1]
            off.subVectors(c.rs[j], c.rs[j - 1])                                       // rest direction × length
            // spring back toward it, measured against where the joint above was at the start of this substep: against
            // its moved position the body's own speed would read as a bend and cancel the drag of running
            acc.copy(pOld).add(off).sub(x).multiplyScalar(j === 1 ? kKnot : kAir)
            pOld.copy(x)
            let fj = fade
            if (c.p.hard) { // a stiffer pull keeps its damping near critical (∝ √k)
              const e = acc.length() / kAir / c.len[j - 1] / c.p.max, m = (1 + c.p.hard * e * e) * c.p.len * gs / c.len[j - 1]
              acc.multiplyScalar(m); fj = Math.exp(-damp * Math.sqrt(m) * h)
            }
            wj.copy(wc).addScaledVector(rel, 0.3 * flutter * Math.sin(ts * 9 + j * 1.9 + c.phase))
            wj.y += rel.length() * 0.35 * flutter * Math.sin(ts * 13.7 + j * 2.3 + c.phase) // cloth flutters, it does not just lean
            acc.addScaledVector(tmp.subVectors(wj, v).sub(carry), cw)                  // air drag: wind, and running through still air
            acc.y += G * grav * gs
            if (c.p.follow) vlag.subVectors(c.rest[j], c.prev[j]).divideScalar(dt)
            v.addScaledVector(acc, h).sub(vlag).multiplyScalar(fj).add(vlag)
            cur.copy(x).addScaledVector(v, h)
            nrm.set(0, 0, 0)
            for (let pass = 0; pass < 2; pass++) {
              d.subVectors(cur, prev)
              // swing cap: never further than `max` from the rest direction (guards against anything wild)
              const ang = d.angleTo(off)
              const mx = max[j - 1] ?? max
              if (ang > mx) d.applyQuaternion(q.setFromUnitVectors(tmp.copy(d).normalize(), tmp2.copy(off).normalize()).slerp(wq.identity(), mx / ang))
              cur.copy(prev).addScaledVector(d.normalize(), c.len[j - 1])            // inextensible
              if (pass) break
              c.cols.forEach((col, ci) => {
                const r = c.rad[j][ci], p = closest(cur, col, hp), dd = cur.distanceTo(p)
                if (dd >= r) return
                // out on the side the cloth rests on: a joint flung past the axis is not pushed out through the body
                const side = tmp2.subVectors(c.rs[j], closest(c.rs[j], col, d)) // (closest() reuses tmp: read it first)
                tmp.subVectors(cur, p)
                if (tmp.dot(side) <= 0) tmp.copy(side)
                cur.copy(p).addScaledVector(tmp.normalize(), r)
                nrm.copy(tmp); vcol.subVectors(col.A1, col.A0).add(col.B1).sub(col.B0).divideScalar(2 * dt)
              })
            }
            v.subVectors(cur, x).divideScalar(h)
            // a push-out is a contact, not a kick: keep at most the body's own outward speed, or the depth of one graze
            // (which depends on where the substeps fall) would fling the cloth and send a slow frame down another path
            const vn = v.dot(nrm), cn = Math.max(0, vcol.dot(nrm))
            if (vn > cn) v.addScaledVector(nrm, cn - vn)
            x.copy(cur)
          }
        }
        // write back: turn each bone so its child lands on the simulated joint (bone 0's matrices are fresh from the rest pass)
        for (let i = 0; i < c.bones.length; i++) {
          const b = c.bones[i]
          b.matrixWorld.decompose(hp, wq, sc)
          d.setFromMatrixPosition(c.nodes[i + 1].matrixWorld).sub(hp).normalize()
          off.subVectors(c.x[i + 1], hp).normalize()
          const sw = off.angleTo(tmp.subVectors(c.rest[i + 1], c.rest[i]).normalize())
          maxSwing = Math.max(maxSwing, sw)
          c.sw = Math.max(i ? c.sw : 0, sw); c.atCap = (i && c.atCap) || sw > 0.97 * (c.p.max[i] ?? c.p.max) // this chain, for opts.probe
          if (c.runQ && !i) knotSwing = Math.max(knotSwing, sw) // the bandana knot's own swing (capped at max[0])
          q.setFromUnitVectors(d, off).multiply(wq)
          b.parent.matrixWorld.decompose(tmp, pq, sc)
          b.quaternion.copy(pq.invert().multiply(q))
          b.updateMatrixWorld(true) // the next bone hangs off this one
        }
        if (!c.x.every(p => Number.isFinite(p.x + p.y + p.z))) c.ready = false // never keep a NaN: restart at rest
      }
    },
  }
}
