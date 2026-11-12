// Fight effects: sword trails, slash arcs, sparks, hit flash, camera shake, dust, the roar's mist ring, hitstop.
// Contract: PLAN.md Phase 3 → ctx.vfx. Pooled: every mesh, buffer and material is built here once; a hit only writes
// numbers. Hot parts are HDR (> 1) so post.js's bloom makes them glow. `?vfx=demo` loops every effect.
import { Fn, attribute, uv, vec3, vec4, float, cameraPosition, normalize, cross, dot, length, cos, sin, pow, mix, saturate, smoothstep } from 'three/tsl'

export async function createVfx(ctx) {
  const { THREE, scene, camera, params } = ctx
  const V = () => new THREE.Vector3(), T = V(), UP = new THREE.Vector3(0, 1, 0)
  const fired = { trail: 0, slash: 0, sparks: 0, flash: 0, shake: 0, dust: 0, blast: 0, hitstop: 0 }
  const rnd = (a, b) => a + Math.random() * (b - a)
  let clock = 0 // effect time on the scaled dt: hitstop freezes trails and sparks with everything else

  // ── Particles: CPU-simulated, one instanced quad batch per layer ─────────────────────────────────────────────
  // glow = additive streaks stretched along their velocity (sparks, glints); soft = alpha puffs (dust, mist).
  // State per particle (S floats): pos3 vel3 age life size0 size1 rgb3 alpha gravity drag wind, then
  // glow: stretch(s) cools(0/1) · soft: rotation spin.
  const S = 20
  function layer(max, glow) {
    const geo = new THREE.InstancedBufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2))
    geo.setIndex([0, 1, 2, 0, 2, 3])
    const buf = name => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); return a }
    const L = { max, glow, geo, n: 0, dropped: 0, s: new Float32Array(max * S), P: buf('aP'), Vl: buf('aV'), C: buf('aC') }
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: !glow, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending })
    mat.positionNode = Fn(() => {
      const p = attribute('aP', 'vec4'), v = attribute('aV', 'vec4'), c = attribute('position', 'vec3')
      const toCam = normalize(cameraPosition.sub(p.xyz))
      if (glow) { // long axis = velocity as the camera sees it; length = size + screen speed × stretch
        const flat = v.xyz.sub(toCam.mul(dot(v.xyz, toCam)))
        const along = normalize(flat.add(vec3(0, 1e-4, 1e-5))), side = normalize(cross(toCam, along))
        return p.xyz.add(side.mul(c.x.mul(p.w))).add(along.mul(c.y.mul(p.w.add(length(flat).mul(v.w)))))
      }
      const right = normalize(cross(vec3(0, 1, 0), toCam)), up = cross(toCam, right)
      const x = c.x.mul(cos(v.w)).sub(c.y.mul(sin(v.w))), y = c.x.mul(sin(v.w)).add(c.y.mul(cos(v.w)))
      return p.xyz.add(right.mul(x.mul(p.w))).add(up.mul(y.mul(p.w)))
    })()
    mat.colorNode = Fn(() => {
      const c = attribute('aC', 'vec4'), q = uv().sub(0.5).mul(2), r = length(q)
      if (glow) { const s = saturate(float(1).sub(r)); return vec4(c.rgb.mul(s.mul(s).mul(2).add(0.35)), c.a.mul(s)) } // white-hot core
      const seed = attribute('aV', 'vec4').w // rotation doubles as the seed of each puff's lumpy edge
      const lump = sin(q.x.mul(4.1).add(seed.mul(5))).mul(sin(q.y.mul(3.7).sub(seed.mul(3)))).mul(0.2)
      const a = saturate(float(1).sub(r).add(lump))
      const near = smoothstep(0.8, 3.5, length(cameraPosition.sub(attribute('aP', 'vec4').xyz))) // a puff at the lens thins out instead of filling the screen
      return vec4(c.rgb, c.a.mul(a.mul(a)).mul(near))
    })()
    L.mesh = new THREE.Mesh(geo, mat)
    L.mesh.frustumCulled = false; L.mesh.visible = false; L.mesh.renderOrder = glow ? 3 : 2
    scene.add(L.mesh)
    return L
  }
  const glow = layer(2048, true), soft = layer(1024, false)

  function emit(L, x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, grav, drag, wind, p17, p18) {
    if (L.n >= L.max) { L.dropped++; return } // full: drop, and the probe says so
    const s = L.s, o = L.n++ * S
    s[o] = x; s[o + 1] = y; s[o + 2] = z; s[o + 3] = vx; s[o + 4] = vy; s[o + 5] = vz; s[o + 6] = 0; s[o + 7] = life
    s[o + 8] = s0; s[o + 9] = s1; s[o + 10] = r; s[o + 11] = g; s[o + 12] = b; s[o + 13] = a
    s[o + 14] = grav; s[o + 15] = drag; s[o + 16] = wind; s[o + 17] = p17; s[o + 18] = p18
  }

  // One invisible particle per layer, so both pipelines compile during load rather than on the first hit.
  for (const L of [glow, soft]) emit(L, 0, -1e3, 0, 0, 0, 0, 0.5, 0.1, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0)

  function step(L, dt, wx, wz) {
    if (!L.n && !L.mesh.visible) return // idle: no work, no upload
    const s = L.s, P = L.P.array, Vl = L.Vl.array, C = L.C.array
    for (let i = 0; i < L.n;) {
      const o = i * S
      const k = (s[o + 6] += dt) / s[o + 7]
      if (k >= 1) { L.n--; s.copyWithin(o, L.n * S, L.n * S + S); continue } // dead: the last one takes its slot
      const d = Math.exp(-s[o + 15] * dt)
      s[o + 3] *= d; s[o + 4] = s[o + 4] * d - s[o + 14] * dt; s[o + 5] *= d
      s[o] += (s[o + 3] + wx * s[o + 16]) * dt; s[o + 1] += s[o + 4] * dt; s[o + 2] += (s[o + 5] + wz * s[o + 16]) * dt
      if (L.glow && s[o + 14] > 0) { // falling sparks skip off the ground
        const gy = ctx.heightAt(s[o], s[o + 2])
        if (s[o + 1] < gy) { s[o + 1] = gy; s[o + 4] *= -0.35; s[o + 3] *= 0.6; s[o + 5] *= 0.6 }
      }
      const j = i * 4, heat = 1 - k
      P[j] = s[o]; P[j + 1] = s[o + 1]; P[j + 2] = s[o + 2]; P[j + 3] = s[o + 8] + (s[o + 9] - s[o + 8]) * (1 - heat * heat)
      Vl[j] = s[o + 3]; Vl[j + 1] = s[o + 4]; Vl[j + 2] = s[o + 5]
      if (L.glow) {
        const cool = s[o + 18]
        Vl[j + 3] = s[o + 17]
        C[j] = s[o + 10]; C[j + 1] = s[o + 11] * (cool ? 0.25 + 0.75 * heat : 1); C[j + 2] = s[o + 12] * (cool ? heat * heat : 1)
        C[j + 3] = s[o + 13] * heat ** 0.6
      } else {
        Vl[j + 3] = s[o + 17] += s[o + 18] * dt
        C[j] = s[o + 10]; C[j + 1] = s[o + 11]; C[j + 2] = s[o + 12]
        C[j + 3] = s[o + 13] * Math.min(1, k * 7) * heat ** 1.4
      }
      i++
    }
    L.mesh.visible = L.n > 0
    L.geo.instanceCount = L.n
    L.P.needsUpdate = L.Vl.needsUpdate = L.C.needsUpdate = true
  }

  // ── Sword trails: a ribbon between the blade's base and tip over the last TL seconds ─────────────────────────
  const MAXS = 24, SUB = 4, MAXC = (MAXS - 1) * SUB + 1
  // Normal blending with HDR colour: reads as gold on the white haze (additive would vanish into it) and still blooms.
  const trailMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false })
  trailMat.colorNode = Fn(() => {
    const t = attribute('aT', 'vec2'), edge = t.y // x: age 0 (at the blade) → 1 (gone); y: 0 inner edge → 1 tip edge
    const fade = pow(saturate(float(1).sub(t.x)), 1.4).mul(smoothstep(0, 0.03, t.x))
    const core = pow(edge, 14)
    return vec4(mix(vec3(1.0, 0.62, 0.22).mul(1.8), vec3(5, 4.6, 3.8), core), fade.mul(pow(edge, 2.5).mul(0.75).add(core.mul(0.25)).add(0.03)))
  })()
  const trailIdx = []
  for (let c = 0; c < MAXC - 1; c++) trailIdx.push(c * 2, c * 2 + 1, c * 2 + 2, c * 2 + 1, c * 2 + 3, c * 2 + 2)
  const trails = Array.from({ length: 6 }, () => {
    const geo = new THREE.BufferGeometry()
    const pos = new THREE.BufferAttribute(new Float32Array(MAXC * 6), 3).setUsage(THREE.DynamicDrawUsage)
    const at = new THREE.BufferAttribute(new Float32Array(MAXC * 4), 2).setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('position', pos); geo.setAttribute('aT', at); geo.setIndex(trailIdx)
    const mesh = new THREE.Mesh(geo, trailMat)
    mesh.frustumCulled = false; mesh.renderOrder = 6 // after the hit flash and the other effects: arcs still read on a hit
    geo.setDrawRange(0, 6) // one zero-area quad until first use: the pipeline compiles during load, not on the first swing (73 ms)
    scene.add(mesh)
    return { mesh, geo, pos, at, obj: null, live: false, gen: 0, born: 0, n: 0, life: 0.2, base: V(), tip: V(), m: new Float32Array(MAXS * 7) }
  })
  const v3 = (out, a) => (a.isVector3 ? out.copy(a) : out.fromArray(a))
  function trail(obj, { base, tip, life = 0.2 }) {
    fired.trail++
    const tr = trails.find(t => !t.obj) || trails.reduce((a, b) => (a.born < b.born ? a : b)) // all busy: reuse the oldest
    v3(tr.base, base); v3(tr.tip, tip)
    Object.assign(tr, { obj, live: true, born: clock, n: 0, life })
    const gen = ++tr.gen
    return { stop() { if (tr.gen === gen) tr.live = false } }
  }
  const cr = new Float32Array(6), wB = V(), wT = V()
  const catmull = (a, b, c, d, f) => 0.5 * (2 * b + (c - a) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (3 * b - a - 3 * c + d) * f * f * f)
  function stepTrail(tr) {
    const m = tr.m
    if (tr.live) {
      tr.obj.updateWorldMatrix(true, false)
      wB.copy(tr.base).applyMatrix4(tr.obj.matrixWorld); wT.copy(tr.tip).applyMatrix4(tr.obj.matrixWorld)
      if (tr.n === 0 || clock - m[6] >= 1 / 120) { m.copyWithin(7, 0, (MAXS - 1) * 7); tr.n = Math.min(tr.n + 1, MAXS) } // else refresh the newest (hitstop: no pile of duplicates)
      m[0] = wB.x; m[1] = wB.y; m[2] = wB.z; m[3] = wT.x; m[4] = wT.y; m[5] = wT.z; m[6] = clock
    }
    while (tr.n > 2 && clock - m[(tr.n - 2) * 7 + 6] >= tr.life) tr.n-- // keep one sample past TL for the tail to fade into
    if (!tr.live && (tr.n < 2 || clock - m[6] >= tr.life)) { tr.obj = null; tr.mesh.visible = false; return }
    if (tr.n < 2) { tr.mesh.visible = false; return }
    const p = tr.pos.array, a = tr.at.array, cols = (tr.n - 1) * SUB + 1
    for (let c = 0; c < cols; c++) {
      const j = Math.min(Math.floor(c / SUB), tr.n - 2), f = c / SUB - j
      const i0 = Math.max(j - 1, 0) * 7, i1 = j * 7, i2 = i1 + 7, i3 = Math.min(j + 2, tr.n - 1) * 7
      for (let k = 0; k < 6; k++) cr[k] = catmull(m[i0 + k], m[i1 + k], m[i2 + k], m[i3 + k], f)
      const age = Math.min(1, (clock - (m[i1 + 6] + (m[i2 + 6] - m[i1 + 6]) * f)) / tr.life)
      const w = (1 - age) ** 0.7 // taper: the inner edge closes onto the tip edge as the ribbon ages
      for (let k = 0; k < 3; k++) { p[c * 6 + k] = cr[k + 3] + (cr[k] - cr[k + 3]) * w; p[c * 6 + 3 + k] = cr[k + 3] }
      a[c * 4] = a[c * 4 + 2] = age; a[c * 4 + 1] = 0; a[c * 4 + 3] = 1
    }
    tr.geo.setDrawRange(0, (cols - 1) * 6)
    tr.pos.needsUpdate = tr.at.needsUpdate = true
    tr.mesh.visible = true
  }

  // ── Slash arcs: a crescent that sweeps along the cut and fades ──────────────────────────────────────────────
  const SL = 8, SLASH_T = 0.3, SEG = 40, ARC = 2.3
  const arcGeo = new THREE.BufferGeometry(), ap = [], au = [], ai = []
  for (let i = 0; i <= SEG; i++) { // unit circle round (0,-1,0); the arc's middle sits at the origin, heading +X
    const u = i / SEG, th = (u - 0.5) * ARC, w = 0.16 * Math.sin(Math.PI * u) ** 0.8
    ap.push(Math.sin(th) * (1 - w), Math.cos(th) * (1 - w) - 1, 0, Math.sin(th), Math.cos(th) - 1, 0)
    au.push(u, 0, u, 1)
    if (i < SEG) ai.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
  }
  arcGeo.setAttribute('position', new THREE.Float32BufferAttribute(ap, 3))
  arcGeo.setAttribute('uv', new THREE.Float32BufferAttribute(au, 2))
  arcGeo.setIndex(ai)
  const aS = new THREE.InstancedBufferAttribute(new Float32Array(SL).fill(1), 1).setUsage(THREE.DynamicDrawUsage)
  arcGeo.setAttribute('aS', aS)
  const arcMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false })
  arcMat.colorNode = Fn(() => {
    const p = attribute('aS', 'float'), q = uv()
    const head = float(1).sub(pow(float(1).sub(p), 3)).mul(1.5) // ease-out sweep that overshoots, so the head leaves the arc
    const band = smoothstep(head.sub(0.75), head.sub(0.04), q.x).mul(smoothstep(head.add(0.03), head.sub(0.03), q.x))
    return vec4(mix(vec3(1.0, 0.7, 0.32).mul(2), vec3(6, 5.6, 4.8), pow(q.y, 10)), band.mul(smoothstep(1, 0.55, p)).mul(pow(q.y, 3).mul(0.9).add(0.04)))
  })()
  const arcs = new THREE.InstancedMesh(arcGeo, arcMat, SL)
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0), mB = new THREE.Matrix4(), X = V(), Y = V(), Z = V()
  for (let i = 0; i < SL; i++) arcs.setMatrixAt(i, ZERO)
  arcs.frustumCulled = false; arcs.renderOrder = 3
  scene.add(arcs)
  let slashNext = 0
  // dir = the blade's travel through the cut. The crescent lies in the plane of dir and the horizontal across it
  // (a vertical chop faces the camera instead) and bulges away from the camera, round the attacker.
  // shortcut: bulge side assumes the attacker stands between camera and cut; take an attacker position if the troll needs arcs.
  function slash(pos, dir, radius = 1.3) {
    fired.slash++
    X.copy(dir).normalize()
    Z.copy(UP).addScaledVector(X, -X.y)
    if (Z.lengthSq() < 0.04) Z.setFromMatrixColumn(camera.matrixWorld, 0).addScaledVector(X, -X.dot(Z))
    Z.normalize(); Y.crossVectors(Z, X)
    if (Y.dot(T.copy(pos).sub(camera.position)) < 0) { Y.negate(); Z.negate() }
    arcs.setMatrixAt(slashNext, mB.makeBasis(X, Y, Z).scale(T.setScalar(radius)).setPosition(pos))
    aS.array[slashNext] = 0
    slashNext = (slashNext + 1) % SL
    arcs.instanceMatrix.needsUpdate = aS.needsUpdate = true
  }
  function stepSlashes(dt) {
    for (let i = 0; i < SL; i++) {
      if (aS.array[i] >= 1) continue
      if ((aS.array[i] += dt / SLASH_T) >= 1) { arcs.setMatrixAt(i, ZERO); arcs.instanceMatrix.needsUpdate = true }
      aS.needsUpdate = true
    }
  }

  // ── Sparks, dust, the roar's mist ───────────────────────────────────────────────────────────────────────────
  function sparks(pos, normal, n = 24) {
    fired.sparks++
    emit(glow, pos.x, pos.y, pos.z, 0, 0, 0, 0.1, 0.7, 1.1, 6, 5, 3.6, 1, 0, 0, 0, 0, 0) // impact glint
    for (let i = 0; i < n; i++) {
      T.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(0.85).add(normal).normalize().multiplyScalar(rnd(3, 11))
      emit(glow, pos.x, pos.y, pos.z, T.x, T.y, T.z, rnd(0.3, 0.75), rnd(0.03, 0.05), 0.015, 9, 6, 3.5, 1, 9.8, 0.6, 0, 0.045, 1)
    }
  }
  // size 1 ≈ a footstep or roll; 3 ≈ a ground slam. Puffs hug the ground, spread, grow and drift with ctx.windAt.
  function dust(pos, size = 1) {
    fired.dust++
    const n = Math.min(40, Math.round(8 + 8 * size))
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + rnd(-0.3, 0.3), sp = rnd(0.6, 1.6) * size, sh = rnd(0.82, 1.04)
      emit(soft, pos.x + Math.cos(a) * 0.2 * size, pos.y + rnd(0.2, 0.45) * size, pos.z + Math.sin(a) * 0.2 * size,
        Math.cos(a) * sp, rnd(0.5, 1.1) * size, Math.sin(a) * sp, rnd(1.4, 2.4), 0.35 * size, rnd(0.9, 1.4) * size,
        0.56 * sh, 0.48 * sh, 0.37 * sh, 0.6, -0.15, 2.2, 0.12, rnd(0, 6.283), rnd(-0.6, 0.6))
    }
  }
  // The roar: two rings of mist blown outward to ~radius metres.
  function blast(pos, radius = 12) {
    fired.blast++
    const fc = ctx.fogColor
    for (let ring = 0; ring < 2; ring++) {
      const n = ring ? 22 : 56, reach = ring ? radius * 0.5 : radius, k = 1.5
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.283 + rnd(-0.08, 0.08), sp = reach * k * rnd(0.9, 1.15), sh = rnd(0.98, 1.08)
        emit(soft, pos.x + Math.cos(a) * 0.8, pos.y + rnd(0.3, 1.2) + ring * 0.6, pos.z + Math.sin(a) * 0.8,
          Math.cos(a) * sp, rnd(0.1, 0.5), Math.sin(a) * sp, rnd(2, 3.2), 1.0, rnd(3, 4.5) * (ring ? 0.8 : 1),
          fc.r * sh, fc.g * sh, fc.b * sh, ring ? 0.3 : 0.42, -0.1, k, 0.15, rnd(0, 6.283), rnd(-0.4, 0.4))
      }
    }
  }

  // ── Hit flash: the struck meshes' emissive goes white and decays (colour only, so nothing recompiles) ─────────
  const FLASH_T = 0.12, WARM = new THREE.Color(1.0, 0.6, 0.25), tc = new THREE.Color(), flashing = new Map()
  function flash(obj) {
    fired.flash++
    obj.traverse(o => {
      if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m.emissive) continue
        m.userData.vfxEmissive ??= m.emissive.clone() // its own colour, kept once, restored after
        flashing.set(m, FLASH_T)
      }
    })
  }
  function stepFlashes(dt) {
    for (const [m, t] of flashing) {
      const left = t - dt, orig = m.userData.vfxEmissive
      if (left <= 0) { m.emissive.copy(orig); flashing.delete(m); continue }
      m.emissive.copy(orig).add(tc.copy(WARM).multiplyScalar(0.35 * (left / FLASH_T) / Math.max(m.emissiveIntensity, 1e-3))) // additive warm glow, 35% at most: the texture stays
      flashing.set(m, left)
    }
  }

  // ── Camera shake (real time, rotation only, laid on after hero.js aims the camera) and hitstop ────────────────
  // amp: 0.2 a light hit · 0.5 a heavy one · 1 the roar (≈3° peak).
  let shakeAmp = 0, shakeT = 0, shakeDur = 1, shook = false, stopUntil = 0, lastNow = performance.now()
  const qOff = new THREE.Quaternion(), qLeft = new THREE.Quaternion(), eul = new THREE.Euler()
  function shake(amp = 0.5, secs = 0.3) {
    fired.shake++
    if (amp >= shakeAmp * (shakeT / shakeDur) ** 2) { shakeAmp = amp; shakeT = shakeDur = secs }
  }
  function stepShake(rdt, now) {
    if (shook && camera.quaternion.equals(qLeft)) camera.quaternion.multiply(qOff.invert()) // nobody re-aimed it: undo ours
    shook = false
    if (shakeT <= 0) return
    shakeT -= rdt
    const k = shakeAmp * (Math.max(shakeT, 0) / shakeDur) ** 2 * 0.035, t = now / 1000
    eul.set(k * (Math.sin(t * 41) + 0.5 * Math.sin(t * 73 + 1)), k * (Math.sin(t * 37 + 2) + 0.5 * Math.sin(t * 83)), k * 0.6 * Math.sin(t * 29 + 4))
    camera.quaternion.multiply(qOff.setFromEuler(eul))
    qLeft.copy(camera.quaternion); shook = true
  }
  // A few ms where the world nearly stops (ctx.timeScale; main scales every dt by it). Timed in real ms.
  // Released by a timer (re-armed if it fires early) and by update, so neither a broken frame nor an early timer freezes the world.
  function hitstop(ms = 70) {
    fired.hitstop++
    stopUntil = Math.max(stopUntil, performance.now() + ms)
    ctx.timeScale = 0.02
    setTimeout(release, ms)
  }
  function release() {
    if (!stopUntil) return
    const left = stopUntil - performance.now()
    if (left > 0) return void setTimeout(release, left + 1)
    stopUntil = 0; ctx.timeScale = 1
  }

  let frames = 0, worstMs = 0
  ctx.vfx = { trail, slash, sparks, flash, shake, dust, blast, hitstop }
  window.__probes.vfx = () => ({
    glow: glow.n, soft: soft.n, dropped: glow.dropped + soft.dropped, trails: trails.filter(t => t.obj).length,
    slashes: [...aS.array].filter(p => p < 1).length, flashing: flashing.size, timeScale: ctx.timeScale, fired, worstMs: Math.round(worstMs),
  })

  const demo = params.get('vfx') === 'demo' && makeDemo()
  return {
    update(dt) {
      const now = performance.now(), rdt = Math.min((now - lastNow) / 1000, 0.1)
      if (++frames > 30) worstMs = Math.max(worstMs, now - lastNow) // proof that effects never hitch (load frames excluded)
      lastNow = now
      if (stopUntil && now >= stopUntil) release()
      clock += dt
      if (demo) demo(dt)
      const w = ctx.windAt?.(ctx.heroPos.x, ctx.heroPos.z, ctx.time) // one sample a frame: the fight is a few metres wide
      step(glow, dt, 0, 0)
      step(soft, dt, w?.x ?? 0, w?.y ?? 0)
      for (const tr of trails) if (tr.obj) stepTrail(tr)
      stepSlashes(dt)
      stepFlashes(dt)
      stepShake(rdt, now)
    },
  }

  // ── ?vfx=demo: a blade strikes a standing stone left of the hero, every effect on a loop ── ─────────────────────
  function makeDemo() {
    const g = (x, z) => ctx.heightAt(x, z)
    const foot = new THREE.Vector3(-2.2, 0, -2.6); foot.y = g(foot.x, foot.z)
    const rockGeo = new THREE.IcosahedronGeometry(0.6, 3), rp = rockGeo.attributes.position
    for (let i = 0; i < rp.count; i++) { T.fromBufferAttribute(rp, i); T.multiplyScalar(1 + 0.12 * Math.sin(T.x * 7 + T.y * 5) * Math.sin(T.z * 6 - T.y * 3)); rp.setXYZ(i, T.x, T.y, T.z) }
    rockGeo.computeVertexNormals()
    const stone = new THREE.Mesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0x9a978c, roughness: 0.95 }))
    stone.scale.set(1, 2.1, 0.8); stone.position.copy(foot).add(T.set(0, 0.9, 0)); stone.castShadow = true
    const hit = stone.position.clone().add(T.set(0.25, 0.35, 0.5)) // the face toward the camera
    const pivot = hit.clone().add(T.set(0.6, 1.1, 0.35))
    const reach = hit.clone().sub(pivot).normalize(), axis = new THREE.Vector3(0, 0, 1).addScaledVector(reach, -reach.z).normalize()
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.25, 0.015).translate(0, 0.78, 0), new THREE.MeshStandardMaterial({ color: 0xc9ced4, metalness: 0.3, roughness: 0.35 }))
    blade.position.copy(pivot)
    scene.add(stone, blade)
    const q = new THREE.Quaternion(), d = V(), outward = new THREE.Vector3(0.3, 0.35, 1).normalize(), ground = V()
    let t = -1.5, swing = -1, handle = null, struck = false
    return dt => {
      if ((t += dt) < 0) return
      const n = Math.floor(t / 1.1), f = (t % 1.1) / 0.42 // a swing every 1.1 s, 0.42 s long
      if (n !== swing) { swing = n; struck = false; handle?.stop(); handle = trail(blade, { base: [0, 0.3, 0], tip: [0, 1.4, 0] }) }
      const dirSign = n % 2 ? -1 : 1, ang = dirSign * 1.7 * (Math.min(f, 1) * 2 - 1) * (1 - 0.15 * Math.min(f, 1)) // eased sweep through the stone
      blade.quaternion.setFromUnitVectors(UP, d.copy(reach).applyQuaternion(q.setFromAxisAngle(axis, ang)))
      if (f >= 1 && handle) { handle.stop(); handle = null }
      if (!struck && f >= 0.5) {
        struck = true
        const heavy = n % 3 === 2
        sparks(hit, outward, heavy ? 40 : 24)
        slash(hit, d.crossVectors(axis, reach).multiplyScalar(dirSign), 1.2)
        flash(stone)
        hitstop(heavy ? 110 : 60)
        shake(heavy ? 0.8 : 0.3, heavy ? 0.5 : 0.25)
        ground.set(foot.x - 0.3, foot.y, foot.z + 0.7)
        dust(ground, heavy ? 2.5 : 1.2)
        if (heavy) blast(ground.set(foot.x + 1, g(foot.x + 1, foot.z + 1), foot.z + 1), 9)
      }
    }
  }
}
