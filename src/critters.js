// Wave F lane critters: storybook hares that live IN the meadow's chest-high grass and show themselves in moments.
// Grazing = down in the grass (ear tips flick up now and then); every 6-15 s one rears up to look around for 2-3 s (at most two
// standing at once, never at night); the nearest within ~12 m stands and watches the hero; within ~6 m it bolts in 3-4 long
// leaps whose arc clears the grass, sinks out of sight, and reappears elsewhere out of view 20-40 s later. Two InstancedMeshes
// (body; head + ears, which counter-tilt so the face stays level when the body rears), hops steered on the CPU.
// ?critters=off removes them; ?critters=demo stages a standing one, one mid-leap, one ears-only and a bolter for auto=walk.
import { uniform, vertexColor, vec3 } from 'three/tsl'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const N = 8, SEE = 12, BOLT = 6, FAR = 36
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const rnd = (a, b) => a + Math.random() * (b - a)

export async function createCritters(ctx) {
  const { THREE, scene, heroPos, params, camera } = ctx
  const mode = params.get('critters')
  if (mode === 'off') return null
  const demo = mode === 'demo'
  const forced = { day: 0, dusk: 0.6, night: 1 }[params.get('tod')]
  const night = () => forced ?? ctx.night ?? 0
  const gy = (x, z) => ctx.heightAt(x, z)
  const blocked = (x, z) => ctx.keepClear.some(c => Math.hypot(x - c.x, z - c.z) < c.r) || (ctx.pond?.inside(x, z) ?? 0) > 0

  // --- body, origin on the ground under the haunch, +Z is the face; ears are a second mesh (pivot at the head) so they can
  // stay upright when the body rears (head and ears share it). Vertex colours: taupe coat, pale belly, dark ear tips.
  const COAT = new THREE.Color(0xc4a37c), BELLY = new THREE.Color(0xf1e5d1), TIP = new THREE.Color(0x5a4636), TAIL = new THREE.Color(0xfaf3e6), DARK = new THREE.Color(0x1a110d)
  const part = (g, x, y, z, col, pale = 0) => { // place a part, colour it (belly = pale underside)
    g.translate(x, y, z)
    const N_ = g.attributes.normal, c = new Float32Array(N_.count * 3), t = new THREE.Color()
    for (let i = 0; i < N_.count; i++) { t.copy(typeof col === 'function' ? col(g, i) : col).lerp(BELLY, pale * ss(0.1, -0.6, N_.getY(i))); c.set([t.r, t.g, t.b], i * 3) }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3))
    return g.toNonIndexed()
  }
  const S = (r, sx, sy, sz) => new THREE.SphereGeometry(r, 16, 12).scale(sx, sy, sz)
  const geo = mergeGeometries([
    part(S(0.105, 1, 0.95, 1.75), 0, 0.16, 0.05, COAT, 1),  // slim body: its long axis becomes the spine when it rears
    part(S(0.045, 1, 1, 1), 0, 0.17, -0.145, TAIL),            // white scut
    part(S(0.035, 0.8, 0.8, 1.9), 0.065, 0.04, 0.06, COAT),  // feet
    part(S(0.035, 0.8, 0.8, 1.9), -0.065, 0.04, 0.06, COAT),
  ])
  // Ears + head share one origin, the ear base on the body, so the counter-tilt that keeps the ears upright keeps the face level too.
  const earGeo = mergeGeometries([
    ...[1, -1].map(sd => part(S(0.03, 1, 2.8, 0.55), 0.04 * sd, 0.06, 0, (g, i) => COAT.clone().lerp(TIP, 0.6 * ss(0.14, 0.17, g.attributes.position.getY(i))))),
    part(S(0.068, 0.85, 0.95, 1.35), 0, -0.065, 0.03, COAT, 0.35), // longer head
    part(S(0.027, 1.2, 0.8, 0.9), 0, -0.095, 0.105, BELLY),         // pale muzzle
    part(S(0.011, 1.2, 1, 0.7), 0, -0.085, 0.133, DARK),            // nose
    part(S(0.02, 1, 1.2, 0.8), 0.044, -0.04, 0.05, DARK),           // eyes
    part(S(0.02, 1, 1.2, 0.8), -0.044, -0.04, 0.05, DARK),
  ])
  const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 1, metalness: 0 }), uNight = uniform(0)
  mat.emissiveNode = vertexColor().mul(uNight.mul(0.2)).mul(vec3(0.55, 1, 0.9)) // by night they take a little of the grass's teal glow instead of going black

  const mk = g => { const m = new THREE.InstancedMesh(g, mat, N); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.castShadow = true; scene.add(m); return m }
  const mesh = mk(geo), ears = mk(earGeo)

  const fwd = new THREE.Vector3()
  // A place for one to appear: not water, plinth, path or settlement (keepClear), at 9-26 m; `seen` puts it in front of the camera.
  function spot(seen) {
    camera.getWorldDirection(fwd)
    const a0 = Math.atan2(fwd.x, fwd.z)
    for (let i = 0; i < 30; i++) {
      const a = seen ? a0 + rnd(-0.7, 0.7) : a0 + (Math.random() < 0.5 ? 1 : -1) * rnd(1.4, 3.1), d = seen ? rnd(10, 35) : rnd(14, 35)
      const x = heroPos.x + Math.sin(a) * d, z = heroPos.z + Math.cos(a) * d
      if (!blocked(x, z) && C.filter(c => c.st !== 'away' && Math.hypot(c.x - x, c.z - z) < 10).length < 2) return [x, z] // never a third in one cluster
    }
    return null
  }

  const C = Array.from({ length: N }, (_, i) => ({
    st: 'away', t: rnd(0.2, 2 + i * 0.6), x: 0, z: 0, yaw: 0, sc: rnd(2.4, 2.8), hide: 0, // hide 0 = in the grass, 1 = sunk below it
    hop: null, hops: 0, nextShuffle: rnd(1, 4), look: rnd(3, 15), sT: 0, tw: 0, nextTw: rnd(1, 5), ph: rnd(0, 6), tilt: 0.1, up: 0, pin: null,
  }))
  const place = (c, seen) => { const s = spot(seen); if (!s) return false; [c.x, c.z] = s; c.yaw = rnd(0, 6.28); c.st = 'graze'; c.hide = 1; c.hop = null; c.nextShuffle = rnd(1, 4); c.look = rnd(6, 15); return true }
  const startHop = (c, dx, dz, len, h, dur) => { // a hop along (dx, dz); never lands in a no-go place
    for (const turn of [0, 0.5, -0.5, 1, -1, 1.6, -1.6]) {
      const a = Math.atan2(dx, dz) + turn, x1 = c.x + Math.sin(a) * len, z1 = c.z + Math.cos(a) * len
      if (!blocked(x1, z1)) { c.hop = { t: 0, dur, x0: c.x, z0: c.z, x1, z1, h }; c.yaw = a; return true }
    }
    return false
  }
  const leap = c => startHop(c, c.x - heroPos.x, c.z - heroPos.z, rnd(4, 5), 1.1, 0.7) // a leap whose arc clears the grass
  if (demo) { // staged: one standing ~10 m ahead, one frozen mid-leap, one with only its ear tips up, one 22 m ahead that bolts as auto=walk nears
    const stage = [[-3.5, -10, 'stand'], [3.5, -12, 'leap'], [-6, -14, 'ears'], [2, -22, null]]
    stage.forEach(([x, z, pin], i) => { const c = C[i]; c.x = x; c.z = z; c.yaw = Math.PI; c.st = 'graze'; c.hide = 0; c.t = 1e9; c.sc = +params.get('cs') || 2.6; c.pin = pin; c.look = 1e9
      if (pin === 'stand') { c.st = 'stand'; c.up = 1 } else if (pin === 'leap') { c.hop = { t: 0.35, dur: 0.7, x0: x, z0: z, x1: x + 1, z1: z - 4.5, h: 1.1 }; c.yaw = Math.atan2(1, -4.5) } else if (pin === 'ears') c.tw = 0.5 })
    const side = params.get('critside') // ?critside=stand|graze|leap: a fifth hare pinned side-on to the camera at ~9 m, for judging head and body
    if (side) { const c = C[4], [x, z] = [+params.get('critx') || -1.8, -9]; Object.assign(c, { x, z, yaw: -Math.PI / 2, st: side === 'stand' ? 'stand' : 'graze', hide: 0, t: 1e9, sc: +params.get('cs') || 2.6, pin: side, still: true, look: 1e9, nextTw: 1e9, up: side === 'stand' ? 1 : 0 })
      if (side === 'leap') c.hop = { t: 0.35, dur: 0.7, x0: x, z0: z, x1: x - 4.5, z1: z, h: 1.1 } }
    for (let i = side ? 5 : 4; i < N; i++) C[i].t = 1e9
  }

  const M = new THREE.Matrix4(), A = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), P = new THREE.Vector3()
  let live = 0, standing = 0, bolting = 0

  function update(dt, t) {
    const n = night(), want = demo ? 4 : Math.ceil(N * (1 - 0.5 * ss(0.3, 0.9, n)))
    uNight.value = n; live = standing = bolting = 0
    let near = -1, nd = SEE // the nearest within sight stands and watches him
    C.forEach((c, i) => { if (!c.pin && (c.st === 'graze' || c.st === 'stand' || c.st === 'watch')) { const d = Math.hypot(heroPos.x - c.x, heroPos.z - c.z); if (d < nd) { nd = d; near = i } } })
    C.forEach(c => { if (c.st === 'stand' || c.st === 'watch') standing++ })
    for (let i = 0; i < N; i++) {
      const c = C[i], dh = Math.hypot(heroPos.x - c.x, heroPos.z - c.z)
      if (c.st === 'away') {
        if ((c.t -= dt) <= 0 && i < want && !demo) { if (!place(c, !c.seenOnce)) c.t = 2; else c.seenOnce = true }
      } else {
        live++
        c.hide += ((c.st === 'sunk' ? 1 : 0) - c.hide) * Math.min(1, dt * (c.st === 'sunk' ? 3 : 2.2)) // eases up out of / down into the grass
        if (c.st === 'sunk') { if (c.hide > 0.97) { c.st = 'away'; c.t = demo ? 1e9 : rnd(20, 40) } }
        else if (c.hop) {
          const h = c.hop; if (c.pin !== 'leap') h.t += dt
          if (h.t >= h.dur) { c.x = h.x1; c.z = h.z1; c.hop = null; if (c.st === 'bolt') { if (--c.hops <= 0 || !leap(c)) c.st = 'sunk' } }
        } else if (!c.pin) {
          if (c.st !== 'bolt') {
            if (dh < BOLT) { c.st = 'bolt'; c.hops = 3 + (Math.random() < 0.5 ? 1 : 0); if (!leap(c)) c.st = 'sunk' }
            else if (dh > FAR && !demo) c.st = 'sunk' // fell behind: sink, come back elsewhere
            else if (i === near && n < 0.6 && (c.st === 'watch' || standing < 2)) { if (c.st === 'graze') standing++; c.st = 'watch' }
            else if (c.st === 'watch') c.st = 'graze'
            else if (c.st === 'stand') { if ((c.sT -= dt) <= 0) c.st = 'graze' }
            else if (c.st === 'graze') {
              if ((c.look -= dt) <= 0) { c.look = rnd(6, 15); if (standing < 2 && n < 0.4) { c.st = 'stand'; c.sT = rnd(2, 3); standing++ } } // pops up to look around
              else if ((c.nextShuffle -= dt) <= 0) { c.nextShuffle = rnd(2, 5); if (n < 0.5 && Math.random() < 0.7) startHop(c, Math.sin(c.yaw) + rnd(-0.4, 0.4), Math.cos(c.yaw) + rnd(-0.4, 0.4), rnd(0.3, 0.8), 0.05, 0.28); else c.yaw += rnd(-0.6, 0.6) }
            }
          }
        }
        if (c.st === 'watch' && !c.hop) { let d = Math.atan2(heroPos.x - c.x, heroPos.z - c.z) - c.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); c.yaw += d * Math.min(1, dt * 4) } // turns to face him
        if (c.st === 'bolt') bolting++
      }
      // ---- pose
      let x = c.x, z = c.z, y, lift = 0, tilt, twitch = 0
      const upT = (c.st === 'stand' || c.st === 'watch') && !c.hop ? 1 : 0
      c.up += (upT - c.up) * Math.min(1, dt * 5)
      if ((c.nextTw -= dt) <= 0) { c.nextTw = rnd(2.5, 6); c.tw = 1 }
      if (c.tw > 0 && c.pin !== 'ears') c.tw = Math.max(0, c.tw - dt * 2.5)
      if (c.hop) {
        const h = c.hop, s = Math.min(1, h.t / h.dur)
        x = h.x0 + (h.x1 - h.x0) * s; z = h.z0 + (h.z1 - h.z0) * s
        y = gy(h.x0, h.z0) + (gy(h.x1, h.z1) - gy(h.x0, h.z0)) * s
        lift = 4 * h.h * s * (1 - s); tilt = -0.45 + 0.9 * s // nose up on take-off, down as it lands
      } else { y = gy(x, z); tilt = 0.1 + 0.05 * Math.sin(t * 4 + c.ph); twitch = Math.sin(Math.PI * (1 - c.tw)) * (c.tw > 0 ? 1 : 0) * (1 - c.up) } // 0..1: an ear flick
      c.tilt += (tilt - c.tilt) * Math.min(1, dt * (c.hop ? 20 : 7))
      // A flick is a short half-rear (head and ears are one mesh: lifting them alone pulled the head off the body), so the neck stays closed.
      const u = Math.max(c.up, 0.4 * twitch), th = c.tilt * (1 - u) - 0.9 * u /* 0.9, not 1.15: reared further, the chest bulged in front of the nose */, phi = c.hop ? -0.2 : 0.05 + (-th - 0.05) * u // ears stay upright as the body rears
      const k = Math.max(0.001, c.sc * (c.st === 'away' ? 0 : 1)), sink = c.hide * 0.5 * k, yaw = c.yaw + (c.st === 'stand' && !c.still ? 0.6 * Math.sin(t * 1.6 + c.ph) * c.up : 0)
      if (c.st === 'away') { M.makeScale(0, 0, 0); mesh.setMatrixAt(i, M); ears.setMatrixAt(i, M); continue }
      // T(pos) Ry(yaw) T(0,0,-.12k) Rx(th) S(k) T(0,0,.12): pitch about the hind feet, so rearing rises on the haunches
      M.makeTranslation(x, y + lift - sink, z)
      q.setFromEuler(e.set(0, yaw, 0)); A.makeRotationFromQuaternion(q); M.multiply(A)
      A.makeTranslation(0, 0, -0.12 * k); M.multiply(A)
      q.setFromEuler(e.set(th, 0, 0)); A.makeRotationFromQuaternion(q); M.multiply(A)
      A.makeScale(k, k, k); M.multiply(A)
      A.makeTranslation(0, 0, 0.12); M.multiply(A)
      mesh.setMatrixAt(i, M)
      A.makeTranslation(0, 0.3, 0.24); M.multiply(A)            // to the ear base on the head
      q.setFromEuler(e.set(phi, 0, 0)); A.makeRotationFromQuaternion(q); M.multiply(A)
      ears.setMatrixAt(i, M)
    }
    mesh.instanceMatrix.needsUpdate = ears.instanceMatrix.needsUpdate = true
  }

  window.__probes.critters = () => ({ hopS: C.map(c => c.hop ? +(c.hop.t / c.hop.dur).toFixed(2) : -1).join(' '), live, standing, bolting, states: C.map(c => c.st + (c.st === 'away' ? ':' + Math.round(c.t) : '')).join(' '),
    screen: C.filter(c => c.st !== 'away').map(c => { P.set(c.x, gy(c.x, c.z) + 0.4, c.z).project(camera); return [Math.round((P.x + 1) * 640), Math.round((1 - P.y) * 360), +Math.hypot(c.x - heroPos.x, c.z - heroPos.z).toFixed(1)] }) })
  update(0, 0)
  return { update }
}
