// Wave F lane critters: small round long-eared meadow hoppers (the pet's wild cousin: taupe, plain, no following).
// One merged geometry, one InstancedMesh, hops steered on the CPU. They graze, sit up when the hero is within ~12 m,
// bolt in long hops when he is within ~6 m and sink into the grass, then reappear out of view 20-40 s later.
// ?critters=off removes them; ?critters=demo stages three grazers at 8-15 m ahead and one that bolts as auto=walk nears.
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

  // --- body, origin on the ground under the haunch, +Z is the face. Vertex colours: taupe coat, pale belly, dark ear tips.
  const COAT = new THREE.Color(0xc4a37c), BELLY = new THREE.Color(0xf1e5d1), TIP = new THREE.Color(0x5a4636), TAIL = new THREE.Color(0xfaf3e6), DARK = new THREE.Color(0x1a110d)
  const part = (g, x, y, z, rx, col, pale = 0) => { // place a part, colour it (belly = pale underside)
    g.rotateX(rx); g.translate(x, y, z)
    const N_ = g.attributes.normal, c = new Float32Array(N_.count * 3), t = new THREE.Color()
    for (let i = 0; i < N_.count; i++) { t.copy(typeof col === 'function' ? col(g, i) : col).lerp(BELLY, pale * ss(0.1, -0.6, N_.getY(i))); c.set([t.r, t.g, t.b], i * 3) }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3))
    return g.toNonIndexed()
  }
  const S = (r, sx, sy, sz) => new THREE.SphereGeometry(r, 16, 12).scale(sx, sy, sz)
  const ear = s => part(S(0.034, 1, 4.3, 0.55), 0.04 * s, 0.4, 0.15, 0.05, (g, i) => COAT.clone().lerp(TIP, 0.8 * ss(0.0, 0.07, g.attributes.position.getY(i) - 0.5))) // tall leaf ears, tipped dark
  const geo = mergeGeometries([
    part(S(0.15, 1, 0.92, 1.28), 0, 0.14, 0, 0, COAT, 1),         // round body
    part(S(0.085, 1, 0.95, 1), 0, 0.235, 0.2, 0, COAT, 0.35),    // head
    part(S(0.032, 1.2, 0.8, 0.9), 0, 0.205, 0.262, 0, BELLY),         // pale muzzle
    part(S(0.011, 1.2, 1, 0.7), 0, 0.213, 0.296, 0, DARK),        // nose
    part(S(0.021, 1, 1.2, 0.8), 0.052, 0.255, 0.225, 0, DARK),     // eyes
    part(S(0.021, 1, 1.2, 0.8), -0.052, 0.255, 0.225, 0, DARK),
    ear(1), ear(-1),
    part(S(0.05, 1, 1, 1), 0, 0.16, -0.2, 0, TAIL),               // white scut
    part(S(0.045, 0.8, 0.8, 1.7), 0.08, 0.04, 0.06, 0, COAT),     // feet
    part(S(0.045, 0.8, 0.8, 1.7), -0.08, 0.04, 0.06, 0, COAT),
  ])
  const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 1, metalness: 0 }), uNight = uniform(0)
  mat.emissiveNode = vertexColor().mul(uNight.mul(0.35)).mul(vec3(0.55, 1, 0.9)) // by night they take a little of the grass's teal glow instead of going black

  const mesh = new THREE.InstancedMesh(geo, mat, N)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.frustumCulled = false; mesh.castShadow = true; mesh.name = 'critters'
  scene.add(mesh)

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
    st: 'away', t: rnd(0.2, 2 + i * 0.6), x: 0, z: 0, yaw: 0, sc: rnd(0.65, 0.8), vis: 0, hide: 0, th: 0.5, // hide 0 = standing in the grass, 1 = sunk out of it
    hop: null, hops: 0, dir: 0, nextShuffle: rnd(1, 4), ph: rnd(0, 6), tilt: 0.5,
  }))
  const place = (c, seen) => { const s = spot(seen); if (!s) return false; [c.x, c.z] = s; c.yaw = rnd(0, 6.28); c.st = 'graze'; c.hide = 1; c.hop = null; c.nextShuffle = rnd(1, 4); return true }
  const startHop = (c, dx, dz, len, h, dur) => { // a hop along (dx, dz); never lands in a no-go place
    for (const turn of [0, 0.5, -0.5, 1, -1, 1.6, -1.6]) {
      const a = Math.atan2(dx, dz) + turn, x1 = c.x + Math.sin(a) * len, z1 = c.z + Math.cos(a) * len
      if (!blocked(x1, z1)) { c.hop = { t: 0, dur, x0: c.x, z0: c.z, x1, z1, h }; c.yaw = a; return true }
    }
    return false
  }
  if (demo) { // staged: three grazers 8-15 m ahead of the start, one 20 m ahead on the line the hero walks
    [[-8, -9], [8, -12], [-7, -15], [0.5, -20]].forEach(([x, z], i) => { const c = C[i]; c.x = x; c.z = z; c.yaw = Math.PI + rnd(-1, 1); c.st = 'graze'; c.hide = 0; c.vis = 1; c.t = 1e9; c.sc = +params.get('cs') || 0.7 })
    for (let i = 4; i < N; i++) C[i].t = 1e9
  }

  const M = new THREE.Matrix4(), A = new THREE.Matrix4(), B = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3(), Sc = new THREE.Vector3()
  let live = 0, sitting = 0, bolting = 0

  function update(dt, t) {
    const want = demo ? 4 : Math.ceil(N * (1 - 0.5 * ss(0.3, 0.9, night())))
    live = sitting = bolting = 0; uNight.value = night()
    for (let i = 0; i < N; i++) {
      const c = C[i], dh = Math.hypot(heroPos.x - c.x, heroPos.z - c.z)
      if (c.st === 'away') {
        c.vis = 0
        if ((c.t -= dt) <= 0 && i < want && !demo) { if (place(c, c.first !== false && !c.seenOnce)) { c.seenOnce = true } else c.t = 2 }
      } else {
        live++
        c.hide += ((c.st === 'sunk' ? 1 : 0) - c.hide) * Math.min(1, dt * (c.st === 'sunk' ? 3 : 2.2)) // eases up out of / down into the grass
        if (c.st === 'sunk') { if (c.hide > 0.97) { c.st = 'away'; c.t = demo ? 1e9 : rnd(20, 40) } }
        else if (c.hop) {
          const h = c.hop; h.t += dt
          if (h.t >= h.dur) { c.x = h.x1; c.z = h.z1; c.hop = null; if (c.st === 'bolt') { if (--c.hops <= 0) c.st = 'sunk'; else startHop(c, c.x - heroPos.x, c.z - heroPos.z, rnd(3, 4.2), 0.32, 0.5) || (c.st = 'sunk') } }
        } else if (c.st !== 'bolt') {
          if (dh < BOLT) { c.st = 'bolt'; c.hops = 2 + (Math.random() < 0.5 ? 1 : 0); if (!startHop(c, c.x - heroPos.x, c.z - heroPos.z, rnd(3, 4.2), 0.32, 0.5)) c.st = 'sunk' }
          else if (dh > FAR && !demo) c.st = 'sunk' // fell behind: fade out, come back near him
          else if (dh < SEE) c.st = 'sit'
          else if (c.st === 'sit' && dh > SEE + 2) c.st = 'graze'
          else if (c.st === 'graze') { // small shuffles between mouthfuls (not at night: they are still)
            if ((c.nextShuffle -= dt) <= 0) { c.nextShuffle = rnd(2, 5); if (night() < 0.5 && Math.random() < 0.7) startHop(c, Math.sin(c.yaw) + rnd(-0.4, 0.4), Math.cos(c.yaw) + rnd(-0.4, 0.4), rnd(0.3, 0.8), 0.1, 0.28); else c.yaw += rnd(-0.6, 0.6) }
          }
        }
        if (c.st === 'sit' && !c.hop) { let d = Math.atan2(heroPos.x - c.x, heroPos.z - c.z) - c.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); c.yaw += d * Math.min(1, dt * 4) } // turns to look at him
        if (c.st === 'sit') sitting++
        if (c.st === 'bolt') bolting++
      }
      // ---- pose into the instance matrix
      let x = c.x, z = c.z, y, tilt, lift = 0
      if (c.hop) {
        const h = c.hop, s = Math.min(1, h.t / h.dur)
        x = h.x0 + (h.x1 - h.x0) * s; z = h.z0 + (h.z1 - h.z0) * s
        y = gy(h.x0, h.z0) + (gy(h.x1, h.z1) - gy(h.x0, h.z0)) * s
        lift = 4 * h.h * s * (1 - s); tilt = -0.45 + 0.9 * s // nose up on take-off, down as it lands
      } else {
        y = gy(x, z)
        tilt = c.st === 'sit' ? -0.6 + 0.5 * ss(0.3, 0.9, night()) : c.st === 'graze' ? 0.05 + 0.08 * Math.sin(t * 5 + c.ph) * (Math.sin(t * 0.7 + c.ph) > 0.2 ? 1 : 0.2) : 0 // head down, chewing
      }
      c.tilt += (tilt - c.tilt) * Math.min(1, dt * (c.hop ? 20 : 7))
      const k = Math.max(0.001, c.sc * (c.st === 'away' ? 0 : 1)), sink = c.hide * 0.5 * k
      if (c.st === 'away') { M.makeScale(0, 0, 0) } else {
        // T(pos) Ry(yaw) T(0,0,-.12) Rx(tilt) T(0,0,.12) S: pitch about the hind feet so sitting up rises on the haunches
        M.makeTranslation(x, y + lift - sink, z)
        q.setFromEuler(e.set(0, c.yaw, 0)); A.makeRotationFromQuaternion(q); M.multiply(A)
        A.makeTranslation(0, 0, -0.12 * k); M.multiply(A)
        q.setFromEuler(e.set(c.tilt, 0, 0)); A.makeRotationFromQuaternion(q); M.multiply(A)
        A.makeScale(k, k, k); B.makeTranslation(0, 0, 0.12); M.multiply(A).multiply(B)
      }
      mesh.setMatrixAt(i, M)
    }
    mesh.instanceMatrix.needsUpdate = true
  }

  window.__probes.critters = () => ({ live, sitting, bolting, states: C.map(c => c.st + (c.st === 'away' ? ':' + Math.round(c.t) : '')).join(' '),
    screen: C.filter(c => c.st !== 'away').map(c => { P.set(c.x, gy(c.x, c.z) + 0.4, c.z).project(camera); return [Math.round((P.x + 1) * 640), Math.round((1 - P.y) * 360), +Math.hypot(c.x - heroPos.x, c.z - heroPos.z).toFixed(1)] }) })
  update(0, 0)
  return { update }
}
