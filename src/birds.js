// Lane birds — 3 instanced flocks wheeling over the meadow by day; they thin out and vanish into roost as ctx.night rises.
// Each bird = body + 2×(inner wing, outer wing) instanced meshes; wings flap on the CPU (≈40 birds, negligible).
// every circle (r+9) stays >=10 m outside the rock island (50,-105 r40) or flies above 40 m of the hero start
const FLOCKS = [ // cx, cz: circle centre; r: radius; alt: height; w: angular speed (rad/s, sign = direction); n: birds
  { cx: -60, cz: -90, r: 28, alt: 46, w: 0.085, n: 14, ph: 0 },
  { cx: -30, cz: -170, r: 40, alt: 30, w: -0.10, n: 10, ph: 2.1 },
  { cx: 150, cz: -40, r: 40, alt: 50, w: 0.07, n: 12, ph: 4.0 },
]
const ss = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k) }

export async function createBirds(ctx) {
  const { THREE, scene } = ctx
  const mat = new THREE.MeshStandardNodeMaterial({ color: 0x4a4560, roughness: 0.9, side: THREE.DoubleSide }) // slate-violet: reads against pale haze
    // geometry (metres, +x = right wing, body points −z)
  const tri = (...p) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p.flat(), 3)); g.computeVertexNormals(); return g }
  const quad = (a, b, c, d) => tri(a, b, c, a, c, d)
  const geoInner = quad([0, 0, 0.3], [0, 0, -0.3], [0.7, 0, -0.15], [0.7, 0, 0.25])
  const geoOuter = quad([0, 0, 0.25], [0, 0, -0.15], [0.8, 0, 0.0], [0.8, 0, 0.35])
  const geoBody = tri([0, 0.08, -0.45], [-0.09, -0.04, 0.2], [0.09, -0.04, 0.2], [0, 0.08, -0.45], [0, 0.1, 0.2], [-0.09, -0.04, 0.2], [0, 0.08, -0.45], [0.09, -0.04, 0.2], [0, 0.1, 0.2])
  const total = FLOCKS.reduce((s, f) => s + f.n, 0)
  const mk = (g, m) => { const im = new THREE.InstancedMesh(g, m, total); im.frustumCulled = false; im.castShadow = false; scene.add(im); return im }
  const body = mk(geoBody, mat), inR = mk(geoInner, mat), inL = mk(geoInner, mat), outR = mk(geoOuter, mat), outL = mk(geoOuter, mat)

  const birds = []
  FLOCKS.forEach((f, fi) => { for (let i = 0; i < f.n; i++) birds.push({ f, a: i / f.n * 0.9 + Math.random() * 0.1, dr: (Math.random() - 0.5) * 18, dy: (Math.random() - 0.5) * 9, ph: Math.random() * 6.3, hz: 2.4 + Math.random() * 0.8, sc: 0.55 + Math.random() * 0.25 }) })

  const base = new THREE.Matrix4(), m = new THREE.Matrix4(), t = new THREE.Matrix4(), r = new THREE.Matrix4()
  const q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), p = new THREE.Vector3(), v = new THREE.Vector3(), s = new THREE.Vector3()
  let vis = 0, day = 1, minY = 1e9, maxY = -1e9
  const update = (dt, time) => {
    day = 1 - ss(0.35, 0.8, ctx.night)
    vis = 0
    birds.forEach((b, i) => {
      const f = b.f, ang = f.ph + b.a * 0.5 + time * f.w, R = f.r + b.dr
      p.set(f.cx + Math.cos(ang) * R, 0, f.cz + Math.sin(ang) * R)
      p.y = ctx.heightAt(p.x, p.z) + f.alt + b.dy + Math.sin(time * 0.4 + b.ph) * 1.5
      const dir = Math.sign(f.w), hx = -Math.sin(ang) * dir, hz = Math.cos(ang) * dir
      e.set(0, Math.atan2(-hx, -hz), -dir * 0.35 + Math.sin(time * 0.7 + b.ph) * 0.06, 'YXZ') // yaw to heading (nose −z), bank into the turn
      q.setFromEuler(e)
      const k = b.sc * day
      s.set(k, k, k)
      b.p = (b.p || new THREE.Vector3()).copy(p)
      base.compose(p, q, s)
      body.setMatrixAt(i, base)
      const fl = Math.sin(time * b.hz * 6.28 + b.ph) * 0.6 - 0.05 + (Math.sin(time * 0.3 + b.ph * 3) > 0.7 ? -0.5 : 0) // occasional glide with wings raised
      const bend = Math.sin(time * b.hz * 6.28 + b.ph - 0.9) * 0.5
      const set = (inM, outM, side) => {
        m.copy(base).multiply(t.makeTranslation(0, 0, 0)).multiply(r.makeRotationZ(side * fl))
        if (side < 0) m.multiply(r.makeScale(-1, 1, 1))
        inM.setMatrixAt(i, m)
        m.multiply(t.makeTranslation(0.7, 0, -0.05)).multiply(r.makeRotationZ(bend))
        outM.setMatrixAt(i, m)
      }
      set(inR, outR, 1); set(inL, outL, -1)
      if (day > 0.01) vis++
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
    })
    for (const im of [body, inR, inL, outR, outL]) { im.instanceMatrix.needsUpdate = true; im.visible = day > 0.01 }
  }
  update(0, 0)
  window.__probes.birds = () => ({ flocks: FLOCKS.length, birds: total, visibleByDay: vis, flapping: true, inView: birds.filter(b => day > 0.01 && (() => { v.copy(b.p).project(ctx.camera); return Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1 })()).length, altRange: [+minY.toFixed(1), +maxY.toFixed(1)] })
  return { update }
}
