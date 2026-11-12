// Phase 6 lane motes: drifting seed lights. Pale pollen by day (≤ 80), hundreds of glowing seeds at night (500),
// densest near the hero, rising gently. One instanced additive quad batch, CPU-drifted (500 points is nothing).
import { Fn, attribute, uniform, uv, vec4, float, length, saturate, mix, smoothstep, cameraPosition } from 'three/tsl'

const MAX = 500, DAY = 60, R = 38 // pool size, day count, radius around the hero (metres)

export async function createMotes(ctx) {
  const { THREE, scene, heroPos, params } = ctx
  const rnd = (a, b) => a + Math.random() * (b - a)
  const forced = { day: 0, dusk: 0.6, night: 1 }[params.get('tod')]
  const night = () => forced ?? ctx.night ?? 0

  const geo = new THREE.InstancedBufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2))
  geo.setIndex([0, 1, 2, 0, 2, 3])
  const P = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage) // xyz, size
  const C = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage) // rgb (HDR), twinkle
  geo.setAttribute('aP', P); geo.setAttribute('aC', C)

  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
  // Billboard: camera right/up as uniforms, refreshed each frame.
  const right = new THREE.Vector3(), up = new THREE.Vector3(), tmp0 = new THREE.Vector3()
  const uRight = uniform(new THREE.Vector3()), uUp = uniform(new THREE.Vector3())
  const cam = ctx.camera
  mat.positionNode = Fn(() => {
    const p = attribute('aP', 'vec4'), c = attribute('position', 'vec3')
    return p.xyz.add(uRight.mul(c.x.mul(p.w))).add(uUp.mul(c.y.mul(p.w)))
  })()
  mat.colorNode = Fn(() => {
    const c = attribute('aC', 'vec4'), r = length(uv().sub(0.5).mul(2))
    const s = saturate(float(1).sub(r)), core = s.mul(s)
    const far = smoothstep(0.0, 6.0, length(cameraPosition.sub(attribute('aP', 'vec4').xyz))) // fade at the lens
    return vec4(c.rgb.mul(core.mul(0.8).add(s.mul(0.3))), core.mul(c.a).mul(far))
  })()
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false; mesh.renderOrder = 3
  scene.add(mesh)

  // Per-mote state: position, rise speed, sway phase/speed, size, hue (0 cyan-green … 1 warm gold), twinkle phase.
  const m = Array.from({ length: MAX }, () => ({ x: 0, y: 0, z: 0, vy: 0, ph: 0, sp: 0, size: 0, top: 3, hue: 0, tw: 0, init: false }))
  function spawn(s, fresh) {
    const a = Math.random() * Math.PI * 2, d = R * Math.pow(Math.random(), 0.7) // squared-ish bias: densest near the hero
    s.x = heroPos.x + Math.cos(a) * d; s.z = heroPos.z + Math.sin(a) * d
    s.y = ctx.heightAt(s.x, s.z) + (fresh ? rnd(0.3, s.top = Math.random() < 0.1 ? rnd(5, 9) : rnd(2, 3.5)) : rnd(0.1, 0.8))
    s.vy = rnd(0.12, 0.45); s.ph = rnd(0, 6.28); s.sp = rnd(0.2, 0.7)
    if (!fresh) s.top = Math.random() < 0.1 ? rnd(5, 9) : rnd(2, 3.5)
    s.size = rnd(0.09, 0.22); s.hue = Math.random() < 0.7 ? rnd(0.75, 1) : rnd(0, 0.3); s.tw = rnd(0, 6.28); s.init = true
  }

  let count = 0
  const lo = new THREE.Color(0.35, 1.0, 0.85), hi = new THREE.Color(1.0, 0.82, 0.38), pale = new THREE.Color(1.0, 0.95, 0.8), tmp = new THREE.Color()

  function update(dt, t) {
    const n = night()
    count = Math.round(DAY + (MAX - DAY) * n * n * (3 - 2 * n))
    if (n < 0.05) count = Math.round(DAY * 0.8) // plain day: a few pollen specks
    cam.matrixWorld.extractBasis(right, up, tmp0)
    uRight.value.copy(right); uUp.value.copy(up)
    for (let i = 0; i < MAX; i++) {
      const s = m[i]
      if (i >= count) { if (s.init) s.init = false; continue }
      if (!s.init) spawn(s, true)
      s.y += s.vy * dt
      s.x += Math.sin(t * s.sp + s.ph) * 0.35 * dt; s.z += Math.cos(t * s.sp * 0.8 + s.ph * 1.7) * 0.35 * dt
      const dx = s.x - heroPos.x, dz = s.z - heroPos.z
      if (dx * dx + dz * dz > R * R || s.y > ctx.heightAt(s.x, s.z) + s.top) spawn(s, false)
      const k = i * 4, tw = 0.65 + 0.35 * Math.sin(t * 1.7 + s.tw)
      // Fade near the ground and near the top of the rise so seeds never pop.
      const h = s.y - ctx.heightAt(s.x, s.z), edge = Math.min(1, h / 0.6, (s.top - h) / 1.2)
      P.array[k] = s.x; P.array[k + 1] = s.y; P.array[k + 2] = s.z; P.array[k + 3] = s.size * (n > 0.05 ? 1 + n : 0.7)
      tmp.copy(lo).lerp(hi, s.hue).lerp(pale, 1 - n) // by day all pollen is pale warm white
      const gain = (0.35 + 1.5 * n) // HDR > 1 at night so bloom takes them
      C.array[k] = tmp.r * gain; C.array[k + 1] = tmp.g * gain; C.array[k + 2] = tmp.b * gain; C.array[k + 3] = Math.max(0, edge) * tw * (0.35 + 0.65 * n)
    }
    P.needsUpdate = C.needsUpdate = true
    geo.instanceCount = count
  }

  window.__probes.motes = () => ({ count, night: +night().toFixed(2), max: MAX, hero: [heroPos.x, heroPos.y, heroPos.z].map(v => +v.toFixed(1)) })
  update(0, 0)
  return { update }
}
