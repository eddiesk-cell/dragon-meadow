// Lane springs — the hero's cloth: bandana tails and the shirt/vest hem hang off spring_<chain>_<n> bones
// (tools/hero/springs.py). Each joint is a damped spring particle in world space: it trails the body (inertia), eases
// back toward its rest direction, feels gravity, air drag and ctx.windAt (the same gusts that move the grass), and is
// pushed out of the head, neck, shoulders, hips and thighs. Fixed-size substeps keep it stable from 20 to 144 fps.

export const PART = {
  // k: pull to rest (1/s²)  wind: air-drag coupling (1/s)  damp: internal (1/s)  max: swing cap (rad)  flutter: ripple on the
  // wind  inertia: share of the body's own jolts (start, stop, jump) the cloth lags behind; the rest it is simply carried
  bandana: { k: 380, wind: 3.2, damp: 12, max: 1.75, flutter: 1.6, inertia: 0.6 },
  hem: { k: 230, wind: 1.0, damp: 9, max: 0.8, flutter: 0.4, inertia: 0.3 },
}
const STEP = 1 / 120, G = -9.8

export async function createSprings(ctx) {
  const { THREE, heroPos } = ctx
  const model = ctx.heroRig?.model
  if (!model) throw new Error('no ctx.heroRig.model')
  const V = () => new THREE.Vector3()
  const named = {}
  model.traverse(o => { if (o.name.startsWith('spring_')) named[o.name] = o })
  const bone = n => model.getObjectByName(n)
  model.updateWorldMatrix(true, true) // still the bind pose: hero has not animated yet
  const wp = o => o.getWorldPosition(V())

  // Colliders: capsules A→B (a sphere when A = B) fixed to a body bone, written in the bind pose.
  const cap = (on, A, B, r) => ({ on: bone(on), a: bone(on).worldToLocal(A.clone()), b: bone(on).worldToLocal(B.clone()), r, A: V(), B: V() })
  const head = wp(bone('head')), top = wp(bone('HeadTop_End'))
  const headC = head.clone().lerp(top, 0.45)
  const UPPER = [
    cap('head', headC, headC, 0.13), // skull + spiky hair
    cap('head', ...Array(2).fill(headC.clone().add(new THREE.Vector3(0, -0.07, 0.11))), 0.085), // the face: tails never blow across it
    cap('neck', wp(bone('neck')), head, 0.06),
    cap('upperChest', wp(bone('upperChest')), wp(bone('neck')), 0.11),
    ...['left', 'right'].flatMap(s => [
      cap(s + 'Shoulder', wp(bone(s + 'Shoulder')), wp(bone(s + 'UpperArm')), 0.065),
      cap(s + 'UpperArm', wp(bone(s + 'UpperArm')), wp(bone(s + 'LowerArm')), 0.055),
    ]),
  ]
  const LOWER = [
    cap('hips', wp(bone('hips')), wp(bone('hips')), 0.12),
    ...['left', 'right'].map(s => cap(s + 'UpperLeg', wp(bone(s + 'UpperLeg')), wp(bone(s + 'LowerLeg')), 0.12)), // baggy trousers
  ]

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
    const nodes = [...bones, end], kind = m[1].startsWith('bandana') ? 'bandana' : 'hem'
    const rest = nodes.map(wp), cols = kind === 'bandana' ? UPPER : LOWER
    for (const c of cols) { c.A.copy(c.on.localToWorld(c.a.clone())); c.B.copy(c.on.localToWorld(c.b.clone())) }
    const restQ = bones.map(b => b.quaternion.clone())
    // The sculpt's tails stick out sideways and a little forward; aim them 35° back (about the head's up axis) so wind and
    // running sweep them behind the head, not over the face. From the front they still stream out to his side.
    if (kind === 'bandana') restQ[0].premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.6 * Math.sign(rest[1].x - rest[0].x)))
    chains.push({
      name: m[1], p: PART[kind], cols, bones, nodes, restQ,
      len: rest.slice(1).map((r, i) => r.distanceTo(rest[i])),
      // per joint, per collider: never closer than the cloth sits at rest, so nothing is pushed while standing still
      rad: rest.map(r => cols.map(c => Math.min(c.r, 0.95 * r.distanceTo(closest(r, c, tmp2))))),
      rest, x: rest.map(r => r.clone()), v: rest.map(V), root0: V(), phase: chains.length * 1.7, ready: false,
    })
  }
  if (!chains.length) throw new Error('hero.glb has no spring_ bones (rebuild with tools/hero/build.sh)')

  const q = new THREE.Quaternion(), wq = new THREE.Quaternion(), pq = new THREE.Quaternion(), sc = V(), hp = V()
  const wind = V(), wj = V(), acc = V(), off = V(), d = V(), root = V(), cur = V(), vroot = V(), pOld = V(), carry = V(), vlag = V()
  let maxSwing = 0
  const nb = chains.reduce((a, c) => a + c.bones.length, 0)
  window.__probes.springs = () => ({ chains: chains.length, bones: nb, maxSwingDeg: Math.round(maxSwing * 57.3) })

  return {
    update(dt, t) {
      if (!(dt > 0)) return
      model.updateWorldMatrix(true, true)
      const w = ctx.windAt?.(heroPos.x, heroPos.z, t)
      wind.set(w?.x ?? 0, 0, w?.y ?? 0)
      const n = Math.min(12, Math.ceil(dt / STEP)), h = dt / n
      maxSwing = 0
      for (const c of chains) {
        // the rest pose under this frame's animation: where every joint would be with no cloth physics
        c.bones.forEach((b, i) => b.quaternion.copy(c.restQ[i]))
        c.bones[0].updateMatrixWorld(true)
        c.nodes.forEach((o, i) => c.rest[i].setFromMatrixPosition(o.matrixWorld))
        for (const k of c.cols) { k.A.copy(k.on.localToWorld(tmp.copy(k.a))); k.B.copy(k.on.localToWorld(tmp.copy(k.b))) }
        if (!c.ready || c.root0.distanceTo(c.rest[0]) > 1) { // first frame or a teleport: start at rest
          c.rest.forEach((r, i) => { c.x[i].copy(r); c.v[i].set(0, 0, 0) })
          c.root0.copy(c.rest[0]); c.ready = true
        }
        const { k, wind: cw, damp, max, flutter, inertia } = c.p
        vroot.subVectors(c.rest[0], c.root0).divideScalar(dt)
        carry.copy(vroot).multiplyScalar(1 - inertia) // world velocity = simulated v + carry: drag sees all of it
        vlag.copy(vroot).multiplyScalar(inertia)       // internal damping pulls the simulated part toward this
        const fade = Math.exp(-damp * h)
        for (let s = 0; s < n; s++) {
          const ts = t - dt + (s + 1) * h
          pOld.lerpVectors(c.root0, c.rest[0], s / n)
          root.lerpVectors(c.root0, c.rest[0], (s + 1) / n) // the pinned root glides with the body across substeps
          c.x[0].copy(root)
          for (let j = 1; j < c.x.length; j++) c.x[j].addScaledVector(carry, h) // carried with the body
          for (let j = 1; j < c.x.length; j++) {
            const x = c.x[j], v = c.v[j], prev = c.x[j - 1]
            off.subVectors(c.rest[j], c.rest[j - 1])                                   // rest direction × length
            // spring back toward it, measured against where the joint above was at the start of this substep: against
            // its moved position the body's own speed would read as a bend and cancel the drag of running
            acc.copy(pOld).add(off).sub(x).multiplyScalar(k)
            pOld.copy(x)
            const ws = wind.length()
            wj.copy(wind).multiplyScalar(1 + 0.3 * flutter * Math.sin(ts * 9 + j * 1.9 + c.phase))
            wj.y += ws * 0.35 * flutter * Math.sin(ts * 13.7 + j * 2.3 + c.phase)       // cloth flutters, it does not just lean
            acc.addScaledVector(tmp.subVectors(wj, v).sub(carry), cw)                  // air drag: wind, and running through still air
            acc.y += G
            v.addScaledVector(acc, h).sub(vlag).multiplyScalar(fade).add(vlag)
            cur.copy(x).addScaledVector(v, h)
            for (let pass = 0; pass < 2; pass++) {
              d.subVectors(cur, prev)
              // swing cap: never further than `max` from the rest direction (guards against anything wild)
              const ang = d.angleTo(off)
              if (ang > max) d.applyQuaternion(q.setFromUnitVectors(tmp.copy(d).normalize(), tmp2.copy(off).normalize()).slerp(wq.identity(), max / ang))
              cur.copy(prev).addScaledVector(d.normalize(), c.len[j - 1])            // inextensible
              if (pass) break
              c.cols.forEach((col, ci) => {
                const r = c.rad[j][ci], p = closest(cur, col, hp), dd = cur.distanceTo(p)
                if (dd >= r) return
                // out on the side the cloth rests on: a joint flung past the axis is not pushed out through the body
                tmp.subVectors(cur, p)
                const side = tmp2.subVectors(c.rest[j], closest(c.rest[j], col, d))
                if (tmp.dot(side) <= 0) tmp.copy(side)
                cur.copy(p).addScaledVector(tmp.normalize(), r)
              })
            }
            v.subVectors(cur, x).divideScalar(h)
            x.copy(cur)
          }
        }
        c.root0.copy(c.rest[0])
        // write back: turn each bone so its child lands on the simulated joint (bone 0's matrices are fresh from the rest pass)
        for (let i = 0; i < c.bones.length; i++) {
          const b = c.bones[i]
          b.matrixWorld.decompose(hp, wq, sc)
          d.setFromMatrixPosition(c.nodes[i + 1].matrixWorld).sub(hp).normalize()
          off.subVectors(c.x[i + 1], hp).normalize()
          maxSwing = Math.max(maxSwing, off.angleTo(tmp.subVectors(c.rest[i + 1], c.rest[i]).normalize()))
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
