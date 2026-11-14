// Wave F lane pondlife (PLAN.md): life at the pond. Dragonflies darting and hovering over the water by day, expanding
// ripple rings where fish rise (and the odd small fish jumping), frogs on the bank that hop in when the hero comes near.
// At night the dragonflies and frogs are gone; the rings keep on, faintly lit. Reads ctx.pond {x, z, level, inside} from
// water.js (inside(x, z) > 0: metres inside the shore). ?pondlife=off removes it; ?pondlife=demo stages the hero at a frog.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { Fn, attribute, uniform, uv, vec3, vec4, float, length, abs, smoothstep, pow } from 'three/tsl'

const NR = 14, ND = 7, NF = 6 // ring pool, dragonflies, frogs
const rnd = (a, b) => a + Math.random() * (b - a)
const ss = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k) }

export async function createPondlife(ctx) {
  const { THREE, scene, heroPos, params } = ctx
  const mode = params.get('pondlife')
  if (mode === 'off' || !ctx.pond) return null
  const { x: PX, z: PZ, level: LEVEL, inside } = ctx.pond
  const demo = mode === 'demo'
  const forced = { day: 0, dusk: 0.6, night: 1 }[params.get('tod')]
  const nightNow = () => forced ?? ctx.night ?? 0

  // a random spot in the water at least `m` metres from the shore (shortcut: rejection sampling, 40 tries, falls back to the deep point)
  const foc = [PX, PZ, 99] // demo: everything happens near the staged frog
  const inWater = (m = 1.5, r = 24) => {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * 6.283, d = Math.min(r, foc[2]) * Math.sqrt(Math.random()), x = foc[0] + Math.cos(a) * d, z = foc[1] + Math.sin(a) * d
      if (inside(x, z) > m) return [x, z]
    }
    return [PX, PZ]
  }

  // ---- ripple rings: horizontal quads on the surface, two concentric rings per quad, age 0..1 in an instanced attribute
  const rGeo = new THREE.InstancedBufferGeometry()
  rGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1], 3))
  rGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2))
  rGeo.setIndex([0, 2, 1, 0, 3, 2])
  const RP = new THREE.InstancedBufferAttribute(new Float32Array(NR * 4), 4).setUsage(THREE.DynamicDrawUsage) // xyz, radius
  const RA = new THREE.InstancedBufferAttribute(new Float32Array(NR * 4), 4).setUsage(THREE.DynamicDrawUsage) // age 0..1, strength
  rGeo.instanceCount = NR
  rGeo.setAttribute('aP', RP); rGeo.setAttribute('aA', RA)
  const uNight = uniform(0)
  const rMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false })
  rMat.positionNode = Fn(() => { const p = attribute('aP', 'vec4'); return p.xyz.add(attribute('position', 'vec3').mul(vec3(p.w, 1, p.w))) })()
  rMat.colorNode = Fn(() => {
    const a = attribute('aA', 'vec4'), r = length(uv().sub(0.5)).mul(2), age = a.x
    const ring = (rad, w) => smoothstep(w, 0, abs(r.sub(rad))) // a soft line at radius rad
    const k = ring(age.mul(0.92).add(0.04), 0.07).add(ring(age.mul(0.6), 0.05).mul(0.55)).mul(pow(float(1).sub(age), 1.4)).mul(a.y)
    // by day a pale sky-white line, at night a faint cool glow (HDR, so bloom lifts it a little)
    const col = vec3(0.88, 0.95, 1).mul(float(1).sub(uNight)).add(vec3(0.35, 0.75, 1.0).mul(uNight.mul(2.2)))
    return vec4(col, k.mul(float(0.5).add(uNight.mul(0.4))))
  })()
  const rings = new THREE.Mesh(rGeo, rMat)
  rings.frustumCulled = false; rings.renderOrder = 2
  scene.add(rings)
  const ring = Array.from({ length: NR }, () => ({ age: 1, life: 1, x: 0, z: 0, size: 1, str: 1 }))
  let ri = 0
  const addRing = (x, z, size = 1.6, str = 1, life = 3.2) => { Object.assign(ring[ri], { age: 0, life, x, z, size, str }); ri = (ri + 1) % NR }

  // ---- dragonflies: a body mesh and fore/hind wing meshes (two instances each per fly, flapped on the CPU)
  const bodyG = mergeGeometries([
    new THREE.CylinderGeometry(0.02, 0.008, 0.46, 5).rotateX(Math.PI / 2).translate(0, 0, 0.2),
    new THREE.SphereGeometry(0.035, 6, 5).scale(1, 1, 1.4).translate(0, 0, -0.06),
    new THREE.SphereGeometry(0.03, 6, 5).translate(0, 0, -0.14),
  ])
  const wingG = w => new THREE.PlaneGeometry(0.34, w, 1, 1).rotateX(-Math.PI / 2).translate(0.17, 0, 0)
  const bodyM = new THREE.MeshBasicNodeMaterial({ fog: false }), wingM = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, opacity: 0.55 })
  bodyM.colorNode = vec3(1.1, 1.1, 1.1) // × the per-fly colour
  wingM.colorNode = vec3(0.92, 1.0, 1.0)
  const im = (g, m, n) => { const o = new THREE.InstancedMesh(g, m, n); o.frustumCulled = false; o.renderOrder = 3; scene.add(o); return o }
  const dBody = im(bodyG, bodyM, ND), dFore = im(wingG(0.085), wingM, ND * 2), dHind = im(wingG(0.1), wingM, ND * 2)
  ;[0x3fb7e0, 0xe0603a, 0x7ad04a, 0x2f6fe0, 0xd8b030, 0x3fb7e0, 0xe0603a].forEach((c, i) => dBody.setColorAt(i, new THREE.Color(c)))
  const fly = Array.from({ length: ND }, () => {
    const [x, z] = inWater(); return { x, z, y: LEVEL + 0.7, tx: x, tz: z, ty: LEVEL + 0.7, st: 0, t: rnd(0, 2), yaw: rnd(0, 6.28), ph: rnd(0, 6.28), dip: false }
  })

  // ---- fish that jump now and then: one at a time, a small silver arc
  const fish = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6).scale(0.45, 0.45, 1.5), new THREE.MeshBasicNodeMaterial({ color: 0xc8dce8, fog: false }))
  fish.visible = false; scene.add(fish)
  const jump = { on: false, t: 0, x: 0, z: 0, dx: 0, dz: 0 }

  // ---- frogs on the bank: sites on land a metre or so from the shore
  const frogG = mergeGeometries([
    new THREE.SphereGeometry(0.15, 8, 6).scale(1, 0.62, 1.25).translate(0, 0.1, 0),
    new THREE.SphereGeometry(0.1, 7, 5).translate(0, 0.17, -0.19),
    new THREE.SphereGeometry(0.035, 5, 4).translate(-0.06, 0.26, -0.2), new THREE.SphereGeometry(0.035, 5, 4).translate(0.06, 0.26, -0.2),
    new THREE.SphereGeometry(0.06, 5, 4).scale(1, 0.5, 1.6).translate(-0.13, 0.04, 0.14), new THREE.SphereGeometry(0.06, 5, 4).scale(1, 0.5, 1.6).translate(0.13, 0.04, 0.14),
  ])
  const frogM = new THREE.MeshStandardNodeMaterial({ color: 0x82b83e, roughness: 0.55 })
  const frogMesh = new THREE.InstancedMesh(frogG, frogM, NF)
  frogMesh.frustumCulled = false; frogMesh.castShadow = true; frogMesh.receiveShadow = true
  scene.add(frogMesh)
  const apart = (x, z) => ctx.keepClear.every(c => Math.hypot(x - c.x, z - c.z) > c.r || inside(c.x, c.z) > 0) // keepClear minus the pond's own circles
  const frogs = [], M0 = new THREE.Matrix4(), M = new THREE.Matrix4()
  for (let i = 0; i < 600 && frogs.length < NF; i++) {
    const a = Math.random() * 6.283, d = rnd(4, 34), x = PX + Math.cos(a) * d, z = PZ + Math.sin(a) * d, e = inside(x, z)
    if (e < -0.8 || e > -0.3 || !apart(x, z) || frogs.some(f => Math.hypot(f.hx - x, f.hz - z) < 5)) continue
    // water ahead: walk toward the pond's centre until inside the shore
    let wx = x, wz = z, k = 0, dx = PX - x, dz = PZ - z; const l = Math.hypot(dx, dz); dx /= l; dz /= l
    while (inside(wx, wz) < 0.4 && k++ < 60) wx += dx * 0.25, wz += dz * 0.25
    if (k >= 60) continue
    frogs.push({ hx: x, hz: z, x, z, y: 0, wx, wz, yaw: Math.atan2(-dx, -dz), st: 0, t: 0, fx: x, fz: z, tx: x, tz: z, gone: 0 })
  }
  // each frog sits on a low flat stone, so the bank's long grass doesn't hide it
  const stones = new THREE.InstancedMesh(new THREE.SphereGeometry(0.4, 8, 5).scale(1, 0.4, 1), new THREE.MeshStandardNodeMaterial({ color: 0x8d8a80, roughness: 0.95 }), NF)
  stones.frustumCulled = false; stones.receiveShadow = true; scene.add(stones)
  frogs.forEach((f, i) => { stones.setMatrixAt(i, M0.makeTranslation(f.hx, ctx.heightAt(f.hx, f.hz) + 0.02, f.hz)) })
  stones.count = frogs.length
  const nearest = frogs.reduce((b, f) => (!b || Math.hypot(f.hx - heroPos.x, f.hz - heroPos.z) < Math.hypot(b.hx - heroPos.x, b.hz - heroPos.z) ? f : b), null)
  if (demo && nearest) { // stage: the hero 6.5 m from the nearest frog, on the land side, facing it (walk on with ?auto=walk)
    const dx = nearest.hx - nearest.wx, dz = nearest.hz - nearest.wz, l = Math.hypot(dx, dz)
    const sx = nearest.hx + dx / l * 6.5, sz = nearest.hz + dz / l * 6.5
    heroPos.set(sx, ctx.heightAt(sx, sz), sz); ctx.heroAct?.face(-dx / l, -dz / l)
    nearest.demo = true; foc[0] = nearest.wx; foc[1] = nearest.wz; foc[2] = 8
    for (const f of frogs) if (f !== nearest) f.gone = 1e9
  }

  // ---- per frame
  const Mw = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(0, 0, 0, 'YXZ')
  const V = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1), O = new THREE.Vector3(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0)
  const RZ = new THREE.Matrix4(), TT = new THREE.Matrix4(), SS = new THREE.Matrix4()
  let nextRise = 0.8, nextJump = rnd(6, 12), ringsLive = 0, hops = 0, splashes = 0
  const darts = { n: 0 }

  function update(dt, t) {
    const night = nightNow(), day = 1 - ss(0.35, 0.8, night)
    uNight.value = night

    // rings
    nextRise -= dt
    if (nextRise < 0) { // a rise, near the bank the hero is on (the closest of a few picks)
      let best = null
      for (let i = 0; i < 6; i++) { const p = inWater(1.2, 30); if (!best || Math.hypot(p[0] - heroPos.x, p[1] - heroPos.z) < Math.hypot(best[0] - heroPos.x, best[1] - heroPos.z)) best = p }
      addRing(best[0], best[1], rnd(1.2, 2.2), rnd(0.7, 1))
      nextRise = demo ? rnd(0.6, 1.5) : rnd(1.5, 3.8)
    }
    ringsLive = 0
    ring.forEach((r, i) => {
      r.age = Math.min(1, r.age + dt / r.life)
      const k = i * 4, on = r.age < 1
      ringsLive += on
      RP.array[k] = r.x; RP.array[k + 1] = LEVEL + 0.04; RP.array[k + 2] = r.z; RP.array[k + 3] = on ? r.size : 0
      RA.array[k] = r.age; RA.array[k + 1] = on ? r.str : 0
    })
    RP.needsUpdate = RA.needsUpdate = true

    // a fish jumps
    nextJump -= dt
    if (!jump.on && nextJump < 0 && night < 0.5) {
      const [x, z] = inWater(2.5, 20), a = Math.random() * 6.283
      Object.assign(jump, { on: true, t: 0, x, z, dx: Math.cos(a), dz: Math.sin(a) }); addRing(x, z, 1.0, 0.8, 2.2)
      nextJump = rnd(8, 18)
    }
    if (jump.on) {
      jump.t += dt / 0.75
      const s = jump.t, h = 4 * s * (1 - s) * 0.75, ds = (s - 0.5) * 1.1
      fish.visible = s < 1
      fish.position.set(jump.x + jump.dx * ds, LEVEL + h, jump.z + jump.dz * ds)
      E.set(Math.atan2(-(1 - 2 * s) * 1.5, 1), Math.atan2(-jump.dx, -jump.dz), 0, 'YXZ'); fish.quaternion.setFromEuler(E)
      if (s >= 1) { jump.on = false; fish.visible = false; addRing(jump.x + jump.dx * 0.55, jump.z + jump.dz * 0.55, 1.5, 1, 2.8) }
    }

    // dragonflies
    dBody.visible = dFore.visible = dHind.visible = day > 0.02
    if (dBody.visible) fly.forEach((f, i) => {
      f.t -= dt
      if (f.st === 0 && f.t < 0) { // hover → pick a new spot and dart to it, sometimes ending in a dip that touches the water
        const [x, z] = inWater(1.2); f.tx = x; f.tz = z; f.dip = Math.random() < 0.3; f.ty = LEVEL + (f.dip ? 0.04 : rnd(0.35, 1.2)); f.st = 1; darts.n++
      }
      const dx = f.tx - f.x, dz = f.tz - f.z, d = Math.hypot(dx, dz)
      if (f.st === 1) {
        const sp = Math.min(4.5, 1.2 + d * 2.2) // eases in to the stop
        f.x += dx / (d + 1e-4) * sp * dt; f.z += dz / (d + 1e-4) * sp * dt; f.y += (f.ty - f.y) * Math.min(1, dt * 3)
        f.yaw += ((Math.atan2(-dx, -dz) - f.yaw + 9.42) % 6.283 - 3.14) * Math.min(1, dt * 8)
        if (d < 0.15) { f.st = 0; f.t = rnd(0.8, 2.6); if (f.dip) { addRing(f.x, f.z, 0.5, 0.8, 1.6); f.ty = LEVEL + rnd(0.4, 0.9); f.t = 0.5 } }
      } else { // hover: tiny jitter, a slow turn
        f.x += Math.sin(t * 5 + f.ph) * 0.12 * dt; f.z += Math.cos(t * 4.3 + f.ph) * 0.12 * dt; f.y += (f.ty - f.y) * Math.min(1, dt * 3) + Math.sin(t * 3 + f.ph) * 0.1 * dt
        f.yaw += Math.sin(t * 0.7 + f.ph) * 0.5 * dt
      }
      const sc = day * 1.4, flap = Math.sin((t + f.ph) * 160) * 0.55 + 0.15
      E.set(f.st ? -0.12 : 0.05, f.yaw, Math.sin(t * 2 + f.ph) * 0.05, 'YXZ'); Q.setFromEuler(E)
      M.compose(V.set(f.x, f.y, f.z), Q, S.set(sc, sc, sc)); dBody.setMatrixAt(i, M)
      for (const [mesh, zo, ph, scl] of [[dFore, -0.04, 0, 1], [dHind, 0.05, Math.PI, 1.05]]) for (const side of [1, -1]) {
        const a = Math.sin((t + f.ph) * 160 + ph) * 0.55 + 0.15
        TT.makeTranslation(side * 0.025, 0.025, zo); RZ.makeRotationZ(side * a); SS.makeScale(side * scl, 1, 1)
        Mw.copy(M).multiply(TT).multiply(RZ).multiply(SS); mesh.setMatrixAt(i * 2 + (side > 0 ? 0 : 1), Mw)
      }
    })
    dBody.instanceMatrix.needsUpdate = dFore.instanceMatrix.needsUpdate = dHind.instanceMatrix.needsUpdate = true
    if (dBody.instanceColor) dBody.instanceColor.needsUpdate = true

    // frogs: sit (a throat pulse), hop toward the water when the hero is within 5 m, gone for a while, back when he is away
    frogMesh.visible = stones.visible = night < 0.7
    frogs.forEach((f, i) => {
      const hd = Math.hypot(f.x - heroPos.x, f.z - heroPos.z)
      if (f.gone) { if (f.gone < 1e8) f.gone -= dt; if (f.gone <= 0 && Math.hypot(f.hx - heroPos.x, f.hz - heroPos.z) > 14) { f.gone = 0; f.x = f.hx; f.z = f.hz; f.st = 0 } else f.gone = Math.max(f.gone, 1e-3) }
      let y = ctx.heightAt(f.x, f.z), sc = f.gone ? 0 : 1, pulse = 1 + Math.sin(t * 3 + i) * 0.04
      if (f.st === 0 && !f.gone && hd < 5) { // the hero came near: first hop
        f.st = 1; f.t = 0; f.fx = f.x; f.fz = f.z
        const dx = f.wx - f.x, dz = f.wz - f.z, l = Math.hypot(dx, dz), s = Math.min(l, 1.4); f.tx = f.x + dx / l * s; f.tz = f.z + dz / l * s
        f.yaw = Math.atan2(-dx, -dz); hops++
      }
      if (f.st === 1) {
        f.t += dt / 0.4; const s = Math.min(1, f.t)
        f.x = f.fx + (f.tx - f.fx) * s; f.z = f.fz + (f.tz - f.fz) * s
        y = Math.max(ctx.heightAt(f.fx, f.fz), ctx.heightAt(f.tx, f.tz)) + 0.1 + Math.sin(s * Math.PI) * 0.4
        if (s >= 1) {
          if (inside(f.x, f.z) > 0.1 || Math.hypot(f.wx - f.x, f.wz - f.z) < 0.3) { f.st = 0; f.gone = 45; sc = 0; addRing(f.x, f.z, 0.9, 1, 2.4); splashes++ }
          else { f.st = 2; f.t = 0.12 } // a short rest between hops
        }
      } else if (f.st === 2) {
        f.t -= dt
        if (f.t < 0) { f.st = 1; f.t = 0; f.fx = f.x; f.fz = f.z; const dx = f.wx - f.x, dz = f.wz - f.z, l = Math.hypot(dx, dz), s = Math.min(l, 1.4); f.tx = f.x + dx / l * s; f.tz = f.z + dz / l * s }
      }
      const e0 = inside(f.x, f.z)
      if (f.st === 0 && e0 < 0.2) y = ctx.heightAt(f.x, f.z) + 0.15 // sitting on its stone
      E.set(f.st === 1 ? -0.4 + Math.min(1, f.t) * 0.8 : 0, f.yaw, 0, 'YXZ'); Q.setFromEuler(E)
      M.compose(V.set(f.x, y, f.z), Q, S.set(sc * pulse * 1.7, sc * (f.st ? 1 : pulse) * 1.7, sc * pulse * 1.7)); frogMesh.setMatrixAt(i, f.gone ? ZERO : M)
    })
    frogMesh.count = frogs.length
    frogMesh.instanceMatrix.needsUpdate = true
  }

  window.__probes.pondlife = () => ({
    rings: ringsLive, flies: ND, darts: darts.n, jump: jump.on, frogs: frogs.map(f => [+f.hx.toFixed(1), +f.hz.toFixed(1), f.st, f.gone ? 1 : 0]), hops, splashes,
    demoFrog: nearest && [+nearest.hx.toFixed(1), +nearest.hz.toFixed(1)], night: +nightNow().toFixed(2),
  })
  update(0, 0)
  return { update }
}
