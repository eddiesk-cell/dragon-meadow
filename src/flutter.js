// Wave F lane flutter: butterflies by day (flapping two-wing quads that wander, hover and rest), fireflies from dusk
// (gold blinking points low over the grass, nearer trees and water). Two instanced batches, CPU-steered (60 agents).
// ?flutter=off removes them; ?flutter=demo keeps a few butterflies 3 m in front of the camera (for close shots).
import { Fn, attribute, uniform, uv, vec2, vec3, vec4, float, length, saturate, mix, smoothstep as tsmooth, cos, sin, abs, max } from 'three/tsl'

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const NB = 34, NF = 70, R = 30 // butterflies, fireflies, radius round the hero (m)
// Flower colours of refs/world/mix-day.png: lilac, blush peach, pale gold, poppy orange, soft white.
const PAL = [[0.74, 0.58, 0.95], [0.97, 0.66, 0.82], [0.99, 0.86, 0.45], [0.98, 0.5, 0.25], [0.95, 0.92, 0.85], [0.7, 0.62, 1]]

export async function createFlutter(ctx) {
  const { THREE, scene, heroPos, params, camera } = ctx
  const mode = params.get('flutter')
  if (mode === 'off') return null
  const demo = mode === 'demo'
  const rnd = (a, b) => a + Math.random() * (b - a)
  const forced = { day: 0, dusk: 0.6, night: 1 }[params.get('tod')]
  const night = () => forced ?? ctx.night ?? 0
  const gy = (x, z) => ctx.heightAt(x, z)
  const blocked = (x, z) => ctx.keepClear.some(c => Math.hypot(x - c.x, z - c.z) < c.r) || (ctx.pond?.inside(x, z) ?? 0) > 0

  // Where a place is worth being: random ground near the hero, biased toward where the camera looks so the player sees them.
  const fwd = new THREE.Vector3()
  function spot(near) {
    for (let i = 0; i < 12; i++) {
      camera.getWorldDirection(fwd)
      const a = Math.atan2(fwd.x, fwd.z) + (Math.random() < 0.75 ? rnd(-0.9, 0.9) : rnd(-3.1, 3.1)), d = near ?? 3 + (R - 3) * Math.pow(Math.random(), 1.4)
      const x = heroPos.x + Math.sin(a) * d, z = heroPos.z + Math.cos(a) * d
      if (!blocked(x, z)) return [x, z]
    }
    return [heroPos.x + 4, heroPos.z + 4]
  }
  // Bellflowers are the first solids in ctx.flora.solids (trees are appended after): butterflies like to hover at them.
  const bells = () => { const f = ctx.flora; return f ? f.solids.slice(0, f.solids.length - f.trees.length) : [] }

  const quad = (mat, count, attrs) => {
    const geo = new THREE.InstancedBufferGeometry()
    for (const [k, a] of Object.entries(attrs.geo)) geo.setAttribute(k, a)
    geo.setIndex(attrs.index)
    const arrs = {}
    for (const k of attrs.inst) { arrs[k] = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4).setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, arrs[k]) }
    const mesh = new THREE.Mesh(geo, mat)
    mesh.frustumCulled = false; mesh.renderOrder = 3
    scene.add(mesh)
    return { geo, arrs }
  }

  // ---------------- butterflies ----------------
  // Wing space: x across (left wing −1…0, right 0…1), z along the body (front +). uv.x runs body→tip, uv.y back→front.
  const WZ0 = -0.55, WZ1 = 0.65
  const bpos = [], buv = []
  for (const sx of [-1, 1]) bpos.push(0, 0, WZ0, sx, 0, WZ0, sx, 0, WZ1, 0, 0, WZ1), buv.push(0, 0, 1, 0, 1, 1, 0, 1)
  const bmat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide })
  bmat.positionNode = Fn(() => {
    const p = attribute('aP', 'vec4'), a = attribute('aA', 'vec4'), l = attribute('position', 'vec3')
    const fx = l.x.mul(cos(a.y)), fy = abs(l.x).mul(sin(a.y)) // flap: wing hinged at the body, up when a.y > 0
    const wx = fx.mul(cos(a.x)).add(l.z.mul(sin(a.x))), wz = l.z.mul(cos(a.x)).sub(fx.mul(sin(a.x)))
    return p.xyz.add(vec3(wx, fy, wz).mul(p.w))
  })()
  bmat.colorNode = Fn(() => {
    const c = attribute('aC', 'vec4'), q = uv()
    // Forewing and hindwing lobes; the wing's own rim darkens, with a pale spot on each lobe.
    const e1 = length(vec2(q.x.sub(0.58), q.y.sub(0.72)).mul(vec2(1.5, 2.2))), e2 = length(vec2(q.x.sub(0.42), q.y.sub(0.27)).mul(vec2(2.0, 2.9)))
    const inside = max(float(1).sub(e1), float(1).sub(e2))
    const alpha = tsmooth(0.0, 0.07, inside)
    const rim = tsmooth(0.32, 0.0, inside)
    const spot = tsmooth(0.1, 0.0, length(vec2(q.x.sub(0.68), q.y.sub(0.8)).mul(vec2(1, 1.4))).sub(0.06))
    const col = mix(c.rgb, c.rgb.mul(0.28), rim.mul(0.85)).add(spot.mul(0.35)).add(tsmooth(0.12, 0.0, q.x).mul(0.2).mul(vec3(0.2, 0.12, 0.05)))
    return vec4(col.mul(1.05), alpha.mul(c.a))
  })()
  const BATT = quad(bmat, NB, {
    geo: { position: new THREE.Float32BufferAttribute(bpos, 3), uv: new THREE.Float32BufferAttribute(buv, 2) },
    index: [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7], inst: ['aP', 'aA', 'aC'],
  })

  const B = Array.from({ length: NB }, (_, i) => ({
    x: 0, y: 0, z: 0, vx: 0, vz: 0, yaw: 0, tx: 0, tz: 0, ty: 1, rest: 0, ph: rnd(0, 6.28), hz: rnd(7, 10), col: PAL[i % PAL.length], size: rnd(0.12, 0.17), alive: false, fade: 0,
  }))
  function pick(b) {
    const demoC = demo ? camera.position : null
    if (demo) { b.tx = demoC.x + fwd.x * 3 + rnd(-1.2, 1.2); b.tz = demoC.z + fwd.z * 3 + rnd(-1.2, 1.2); b.ty = rnd(-0.1, 0.8) + camera.position.y - gy(b.tx, b.tz); return }
    const bl = bells()
    let s
    if (bl.length && Math.random() < 0.35) { // a bellflower within reach
      const near = bl.filter(f => Math.hypot(f.x - b.x, f.z - b.z) < 22)
      if (near.length) { const f = near[Math.floor(Math.random() * near.length)]; b.tx = f.x + rnd(-0.5, 0.5); b.tz = f.z + rnd(-0.5, 0.5); b.ty = rnd(0.9, 1.7); return }
    }
    const a = rnd(0, 6.28), d = rnd(2, 7)
    s = [b.x + Math.sin(a) * d, b.z + Math.cos(a) * d]
    if (blocked(...s) || Math.hypot(s[0] - heroPos.x, s[1] - heroPos.z) > R) s = spot()
    b.tx = s[0]; b.tz = s[1]; b.ty = Math.random() < 0.4 ? 0.35 : rnd(0.5, 1.9) // 0.35: a grass tip
  }
  function spawnB(b) {
    const s = spot(demo ? 3 : undefined)
    b.x = s[0]; b.z = s[1]; b.y = gy(b.x, b.z) + rnd(0.5, 1.6); b.vx = b.vz = 0; b.rest = 0; b.alive = true; b.fade = 0; pick(b)
  }

  // ---------------- fireflies ----------------
  const fgeo = [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]
  const fmat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
  const right = new THREE.Vector3(), up = new THREE.Vector3(), tmp0 = new THREE.Vector3()
  const uRight = uniform(new THREE.Vector3()), uUp = uniform(new THREE.Vector3())
  fmat.positionNode = Fn(() => {
    const p = attribute('aP', 'vec4'), c = attribute('position', 'vec3')
    return p.xyz.add(uRight.mul(c.x.mul(p.w))).add(uUp.mul(c.y.mul(p.w)))
  })()
  fmat.colorNode = Fn(() => {
    const c = attribute('aC', 'vec4'), s = saturate(float(1).sub(length(uv().sub(0.5).mul(2))))
    return vec4(c.rgb.mul(s.mul(s).mul(0.9).add(s.mul(0.25))), s.mul(s).mul(c.a))
  })()
  const FATT = quad(fmat, NF, {
    geo: { position: new THREE.Float32BufferAttribute(fgeo, 3), uv: new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2) },
    index: [0, 1, 2, 0, 2, 3], inst: ['aP', 'aC'],
  })
  const F = Array.from({ length: NF }, () => ({ x: 0, y: 0, z: 0, ang: 0, sp: 0, h: 0, ph: 0, w: 0, alive: false }))
  function spawnF(f) {
    let x, z, i = 0
    do {
      const r = Math.random()
      if (r < 0.5 && ctx.flora?.trees.length) { // under a tree
        const near = ctx.flora.trees.filter(t => Math.hypot(t.x - heroPos.x, t.z - heroPos.z) < R + 25)
        const t = near[Math.floor(Math.random() * near.length)]
        if (t) { const a = rnd(0, 6.28), d = rnd(5, 16); x = t.x + Math.sin(a) * d; z = t.z + Math.cos(a) * d }
      } else if (r < 0.75 && ctx.pond && Math.hypot(ctx.pond.x - heroPos.x, ctx.pond.z - heroPos.z) < R + 40) { // over the pond
        const a = rnd(0, 6.28), d = rnd(0, 22); x = ctx.pond.x + Math.sin(a) * d; z = ctx.pond.z + Math.cos(a) * d
      }
      if (x === undefined || Math.hypot(x - heroPos.x, z - heroPos.z) > R) [x, z] = spot()
    } while (ctx.keepClear.some(c => Math.hypot(x - c.x, z - c.z) < c.r) && i++ < 6)
    f.x = x; f.z = z; f.y = Math.max(gy(x, z), ctx.pond?.level ?? -1e9) + rnd(0.3, 1.6)
    f.ang = rnd(0, 6.28); f.sp = rnd(0.25, 0.6); f.h = f.y - gy(x, z); f.ph = rnd(0, 6.28); f.w = rnd(1.3, 2.6); f.alive = true
  }

  let nb = 0, nf = 0
  const tc = new THREE.Color(), gold = new THREE.Color(1.0, 0.78, 0.22), green = new THREE.Color(0.7, 1.0, 0.3)

  function update(dt, t) {
    const n = night()
    camera.getWorldDirection(fwd)
    // ---- butterflies: all day, thinning through dusk ----
    nb = demo ? 5 : Math.round(NB * (1 - ss(0.05, 0.55, n)))
    const BP = BATT.arrs.aP.array, BA = BATT.arrs.aA.array, BC = BATT.arrs.aC.array
    for (let i = 0; i < NB; i++) {
      const b = B[i]
      if (i >= nb) { b.alive = false; continue }
      if (!b.alive) spawnB(b)
      const gnd = gy(b.x, b.z)
      if (b.rest > 0) { // sitting: slow open-close, then up again
        b.rest -= dt; b.vx *= 0.8; b.vz *= 0.8
        b.y += (gnd + b.ty - b.y) * Math.min(1, dt * 4)
        if (b.rest <= 0) pick(b)
      } else {
        const dx = b.tx - b.x, dz = b.tz - b.z, dy = gnd + b.ty - b.y, d = Math.hypot(dx, dz)
        const sp = 1.1 + 0.5 * Math.sin(t * 0.7 + b.ph) // m/s
        const wob = Math.sin(t * 2.3 + b.ph) * 0.9 // side to side drift of a real flutter path
        b.vx += ((dx / (d + 0.01)) * sp + (dz / (d + 0.01)) * wob * 0.5 - b.vx) * Math.min(1, dt * 2.5)
        b.vz += ((dz / (d + 0.01)) * sp - (dx / (d + 0.01)) * wob * 0.5 - b.vz) * Math.min(1, dt * 2.5)
        b.x += b.vx * dt; b.z += b.vz * dt
        b.y += (dy * 1.6 + Math.sin(t * b.hz * 0.45 + b.ph) * 0.5) * dt // bobbing: each wing beat lifts it a little
        if (d < 0.4) { if (Math.random() < 0.5 || demo) b.rest = demo ? rnd(0.5, 1.2) : rnd(2, 5); else pick(b) }
        if (Math.hypot(b.x - heroPos.x, b.z - heroPos.z) > R + 4 && !demo) spawnB(b)
      }
      const moving = b.rest > 0 ? 0 : 1
      if (moving && (b.vx || b.vz)) { const y = Math.atan2(b.vx, b.vz); let dy2 = y - b.yaw; dy2 = Math.atan2(Math.sin(dy2), Math.cos(dy2)); b.yaw += dy2 * Math.min(1, dt * 6) }
      b.fade = Math.min(1, b.fade + dt * 1.2) // fade in after respawn
      const flap = moving ? 0.5 + 0.85 * Math.sin(t * b.hz + b.ph) : 1.2 + 0.18 * Math.sin(t * 1.3 + b.ph) // closed-up at rest
      const k = i * 4
      BP[k] = b.x; BP[k + 1] = Math.max(b.y, gnd + 0.15); BP[k + 2] = b.z; BP[k + 3] = b.size
      BA[k] = b.yaw; BA[k + 1] = flap; BA[k + 2] = 0; BA[k + 3] = 0
      BC[k] = b.col[0]; BC[k + 1] = b.col[1]; BC[k + 2] = b.col[2]; BC[k + 3] = b.fade
    }
    BATT.arrs.aP.needsUpdate = BATT.arrs.aA.needsUpdate = BATT.arrs.aC.needsUpdate = true
    if (!nb) BC[3] = 0 // an instance count of 0 reads as Infinity in the WebGPU draw call: keep one, invisible
    BATT.geo.instanceCount = Math.max(1, nb)

    // ---- fireflies: from dusk ----
    nf = demo ? 0 : Math.round(NF * ss(0.25, 0.75, n))
    camera.matrixWorld.extractBasis(right, up, tmp0); uRight.value.copy(right); uUp.value.copy(up)
    const FP = FATT.arrs.aP.array, FC = FATT.arrs.aC.array
    for (let i = 0; i < NF; i++) {
      const f = F[i]
      if (i >= nf) { f.alive = false; continue }
      if (!f.alive) spawnF(f)
      f.ang += Math.sin(t * 0.4 + f.ph) * 0.9 * dt // a slow wandering turn
      f.x += Math.sin(f.ang) * f.sp * dt; f.z += Math.cos(f.ang) * f.sp * dt
      const gnd = gy(f.x, f.z)
      f.y += ((Math.max(gnd, ctx.pond?.level ?? -1e9) + f.h + Math.sin(t * 0.6 + f.ph) * 0.25) - f.y) * Math.min(1, dt)
      if (Math.hypot(f.x - heroPos.x, f.z - heroPos.z) > R + 4) spawnF(f)
      const b = Math.pow(0.5 + 0.5 * Math.sin(t * f.w + f.ph), 6) // brief glow, long dark: a blink, unlike the steady motes
      tc.copy(gold).lerp(green, 0.15 * Math.sin(f.ph) + 0.15)
      const k = i * 4, gain = 3.2
      FP[k] = f.x; FP[k + 1] = f.y; FP[k + 2] = f.z; FP[k + 3] = 0.16
      FC[k] = tc.r * gain; FC[k + 1] = tc.g * gain; FC[k + 2] = tc.b * gain; FC[k + 3] = b
    }
    FATT.arrs.aP.needsUpdate = FATT.arrs.aC.needsUpdate = true
    if (!nf) FC[3] = 0
    FATT.geo.instanceCount = Math.max(1, nf)
  }

  window.__probes.flutter = () => ({ butterflies: nb, fireflies: nf, night: +night().toFixed(2),
    nearest: +Math.min(...B.filter(b => b.alive).map(b => Math.hypot(b.x - camera.position.x, b.y - camera.position.y, b.z - camera.position.z)), 99).toFixed(1) })
  update(0, 0)
  return { update }
}
