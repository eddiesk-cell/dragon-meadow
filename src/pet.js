// Lane pet — a small floating fluff that follows the hero. Contract: PLAN.md §Contract (lane "pet").
// Fur: one shared shell-fur material. Each part is its base mesh drawn SHELLS times (instanced, aK = 0..1 up the hair);
// strands are cut per fragment from a hashed 3-D cell of the UNdisplaced surface point, so when the shells comb with
// motion, wind and gravity the strands lean together instead of smearing.
import {
  uniform, attribute, varying, vec3, float, color, floor, fract, sin, dot, length, normalize, mix, smoothstep, step, max, pow, abs, fwidth,
  positionGeometry, normalGeometry, normalView, positionViewDirection,
} from 'three/tsl'

const SHELLS = 24, DENS = 230 // strands per metre (cell ≈ 4 mm)
const ss = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k) }
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a))

export async function createPet(ctx) {
  const { THREE, scene, camera, params, heroPos } = ctx
  const ground = (x, z) => ctx.heightAt(x, z)

  // --- fur material
  const uTime = uniform(0), uDay = uniform(1),  uComb = uniform(new THREE.Vector3()) // comb: lean of the tips, fraction of hair length, body space
  const k = attribute('aK', 'float'), L = attribute('aLen', 'float'), pg = positionGeometry, ng = normalGeometry
  const sway = vec3(sin(uTime.mul(3.1).add(pg.y.mul(45))), sin(uTime.mul(2.3).add(pg.z.mul(40))).mul(0.4), sin(uTime.mul(2.7).add(pg.x.mul(42)))).mul(0.12)
  const fur = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0 })
  fur.positionNode = pg.add(ng.mul(L.mul(k))).add(uComb.add(sway).mul(L.mul(k).mul(k)))
  const kv = varying(k), pb = varying(pg), nb = normalize(varying(ng))
  // lattice turned off the axes, so flat parts (ears) never show a woven grid; plus a little curl up the strand
  const q0 = vec3(dot(pb, vec3(0.8, 0.36, -0.48)), dot(pb, vec3(-0.6, 0.48, -0.64)), dot(pb, vec3(0, 0.8, 0.6))).mul(DENS)
  const q = q0.add(vec3(sin(q0.y.mul(0.37).add(kv.mul(5))), sin(q0.z.mul(0.41).add(kv.mul(4))), sin(q0.x.mul(0.39).add(kv.mul(4.6)))).mul(kv.mul(0.45)))
  const h = fract(sin(dot(floor(q), vec3(127.1, 311.7, 74.7))).mul(43758.5453))
  const f = fract(q).sub(0.5).sub(fract(vec3(h.mul(13.1), h.mul(71.7), h.mul(37.3))).sub(0.5).mul(0.35)) // jittered strand centre
  const ft = f.sub(nb.mul(dot(f, nb))) // offset from the strand centre, in the surface plane
  const tuft = sin(pb.x.mul(70).add(sin(pb.y.mul(55)).mul(2))).mul(sin(pb.z.mul(64).add(sin(pb.x.mul(48)).mul(1.7)))).mul(0.18).add(0.82)
  const len = h.mul(0.45).add(0.55).mul(tuft) // per-strand length, clumped into tufts → ragged fluffy outline
  const fill = smoothstep(0.35, 1.2, length(fwidth(q))) // strands thinner than a pixel → fatten them into a soft volume instead of sparkling
  fur.opacityNode = max(step(length(ft), float(0.56).mul(float(1).sub(pow(kv.div(len), 1.6))).add(fill.mul(0.2).mul(max(float(1).sub(kv.div(len)), 0)))), step(kv, 0.001)) // full strands that taper late; shell 0 is solid skin
  fur.alphaTest = 0.5
  const coat = mix(mix(color(0xfbf2e4), color(0xf6cfa0), smoothstep(0.55, 1, uDay).mul(0.7)), color(0xf9b49c), varying(attribute('aTint', 'float'))) // cream (honey by day, so it parts from grass and stone), peach blush
  fur.colorNode = mix(coat.mul(color(0xc4ab92)), coat, max(smoothstep(0, 0.7, kv), float(1).sub(varying(L).mul(25)))).mul(h.mul(0.12).add(0.94)) // warm shaded roots → light tips (short fur stays light)
  fur.emissiveNode = coat.mul(pow(float(1).sub(abs(dot(normalView, positionViewDirection))), 3).mul(kv).mul(0.3).add(smoothstep(0.2, 0.9, nb.z).mul(smoothstep(0, 0.6, uDay)).mul(0.22))) // + day fill on the face side // soft halo where light skims the tips

  const aK = new THREE.InstancedBufferAttribute(Float32Array.from({ length: SHELLS }, (_, i) => i / (SHELLS - 1)), 1)
  const tv = new THREE.Vector3(), tn = new THREE.Vector3()
  const furry = (g, len, tint = () => 0) => {
    const P = g.attributes.position, N = g.attributes.normal, a = new Float32Array(P.count), b = new Float32Array(P.count)
    for (let i = 0; i < P.count; i++) { tv.fromBufferAttribute(P, i); tn.fromBufferAttribute(N, i); a[i] = len(tv, tn); b[i] = tint(tv, tn) }
    const geo = new THREE.InstancedBufferGeometry().copy(g)
    geo.setAttribute('aLen', new THREE.BufferAttribute(a, 1))
    geo.setAttribute('aTint', new THREE.BufferAttribute(b, 1))
    geo.setAttribute('aK', aK)
    geo.instanceCount = SHELLS
    const m = new THREE.Mesh(geo, fur)
    m.frustumCulled = false
    m.castShadow = true
    return m
  }

  // --- body: ~0.42 m of fluff, local +Z is the face
  const R = 0.15, body = new THREE.Group()
  const eyeDir = [-1, 1].map(s => new THREE.Vector3(0.36 * s, 0.12, 0.92).normalize())
  const cheek = [-1, 1].map(s => new THREE.Vector3(0.62 * s, -0.2, 0.76).normalize())
  const near = (n, dirs, a, b) => Math.max(...dirs.map(d => ss(a, b, n.dot(d))))
  body.add(furry(new THREE.SphereGeometry(R, 48, 32).scale(1, 0.94, 1),
    (p, n) => 0.07 * (1 - 0.45 * ss(0.45, 0.9, n.z)) * (1 - 0.7 * near(n, eyeDir, 0.86, 0.97)), // shorter on the face, short round the eyes
    (p, n) => 0.9 * near(n, cheek, 0.84, 0.97)))

  // big dark glossy eyes, each with two catchlights
  const eyeMat = new THREE.MeshStandardNodeMaterial({ color: 0x1a100c, roughness: 0.12, metalness: 0 })
  const glint = new THREE.MeshBasicNodeMaterial({ color: 0xffffff })
  const eyes = eyeDir.map(d => {
    const e = new THREE.Group()
    e.position.copy(d).multiplyScalar(R * 1.07)
    e.lookAt(tv.copy(d).multiplyScalar(2))
    const g1 = new THREE.Mesh(new THREE.SphereGeometry(0.013, 12, 8), glint), g2 = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), glint)
    g1.position.set(-0.014, 0.018, 0.028); g2.position.set(0.014, -0.014, 0.029)
    e.add(new THREE.Mesh(new THREE.SphereGeometry(0.046, 24, 16).scale(1, 1.08, 0.7), eyeMat), g1, g2)
    body.add(e)
    return e
  })
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8).scale(1.3, 0.9, 0.8), new THREE.MeshStandardNodeMaterial({ color: 0xe0897a, roughness: 0.4 }))
  nose.position.set(0, -0.012, R * 1.13)
  body.add(nose)

  // two long floppy leaf ears: a sphere pinched to a point at both ends, widest a third down, the lower half drooping
  const earGeo = s => {
    const g = new THREE.SphereGeometry(1, 20, 24), P = g.attributes.position
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), t = (1 - y) / 2, r = Math.hypot(x, z) || 1, sn = Math.sin(Math.PI * t)
      const px = (x / r) * 0.055 * Math.pow(sn, 0.75) * (1 - 0.3 * t), py = -0.27 * t, pz = (z / r) * 0.011 * Math.pow(sn, 0.6), b = -s * 0.12 * t * t
      P.setXYZ(i, px * Math.cos(b) - py * Math.sin(b), px * Math.sin(b) + py * Math.cos(b), pz)
    }
    g.computeVertexNormals()
    return g
  }
  const ears = [-1, 1].map(s => {
    const pivot = new THREE.Group()
    pivot.position.set(0.075 * s, 0.115, -0.01)
    pivot.add(furry(earGeo(s), () => 0.014, (p, n) => 0.45 * ss(0.5, 0.92, n.z) * ss(0.03, 0.09, Math.hypot(p.x, p.y)))) // peach inner ear, cream rim
    body.add(pivot)
    return pivot
  })

  const tail = new THREE.Group(), puff = furry(new THREE.SphereGeometry(0.035, 16, 12), () => 0.05)
  tail.position.set(0, -0.03, -0.13); puff.position.z = -0.04
  tail.add(puff); body.add(tail)

  const paws = new THREE.Group(), pawGeo = new THREE.SphereGeometry(0.026, 12, 8).scale(1, 0.75, 1.25)
  for (const [x, z] of [[-0.07, 0.07], [0.07, 0.07], [-0.075, -0.06], [0.075, -0.06]]) {
    const m = furry(pawGeo, () => 0.01, (p, n) => 0.9 * ss(-0.3, -0.9, n.y)) // peach pads underneath
    m.position.set(x, -0.135, z)
    paws.add(m)
  }
  body.add(paws)

  const root = new THREE.Group()
  root.name = 'pet'
  root.add(body)
  scene.add(root)

  // --- behaviour: spring-follow the hero's right shoulder, hovering above the waist-high grass
  const HOVER = 1.2, close = params.get('pet') === 'close'
  const p = new THREE.Vector3(), v = new THREE.Vector3(), hv = new THREE.Vector3(), raw = new THREE.Vector3(), tgt = new THREE.Vector3(), sniffAt = new THREE.Vector3()
  const lastHero = heroPos.clone(), fwd = new THREE.Vector2(0, -1), vPrev = new THREE.Vector3(), comb = new THREE.Vector3()
  p.set(heroPos.x + 1.3, ground(heroPos.x + 1.3, heroPos.z) + HOVER, heroPos.z)
  root.position.copy(p)
  let yaw = Math.PI, mode = 'follow', modeT = 0, nextSniff = 10 + Math.random() * 5, twL = 0, twR = 0, nextTwitch = 3, nextBlink = 2, blink = 0
  let nextHop = 3, glance = 0, nextGlance = 3, wasMoving = false, heroAir = false, flap = 0, acc = 0, sniffDip = 0

  window.__probes.pet = () => ({
    dist: +Math.hypot(p.x - heroPos.x, p.z - heroPos.z).toFixed(2), hover: +(p.y - ground(p.x, p.z)).toFixed(2), speed: +v.length().toFixed(2), mode,
  })

  return {
    update(dt, t) {
      uTime.value = t
      uDay.value = 1 - Math.min(1, ctx.night ?? 0)
      // the hero, as the pet sees him: smoothed velocity, heading, stop and jump moments
      raw.subVectors(heroPos, lastHero).divideScalar(Math.max(dt, 1e-3))
      lastHero.copy(heroPos)
      hv.lerp(raw, 1 - Math.exp(-dt * 6))
      const hs = Math.hypot(hv.x, hv.z), moving = hs > 0.4
      if (hs > 0.3) fwd.lerp(tn.set(hv.x / hs, hv.z / hs, 0), 1 - Math.exp(-dt * 4)).normalize()
      const air = heroPos.y - ground(heroPos.x, heroPos.z) > 0.1
      if (air && !heroAir && raw.y > 1) v.y += 3 // he jumps → it hops
      heroAir = air
      if (wasMoving && !moving) twL = twR = 1 // he stops → ears twitch
      wasMoving = moving
      if (moving && (nextHop -= dt) < 0) { v.y += 1.3; nextHop = 3 + Math.random() * 3 } // a small hop now and then while walking
      if ((nextTwitch -= dt) < 0) { Math.random() < 0.5 ? (twL = 1) : (twR = 1); nextTwitch = 2.5 + Math.random() * 4 }

      // now and then, while he stands still, drift off to sniff a flower and come back
      if (mode === 'follow') {
        if (!moving && (nextSniff -= dt) < 0) {
          const a = (Math.random() - 0.5) * 1.6, d = 1.6 + Math.random() * 0.6, rx = -fwd.y * Math.cos(a) - fwd.x * Math.sin(a), rz = fwd.x * Math.cos(a) - fwd.y * Math.sin(a)
          sniffAt.set(heroPos.x + rx * d, 0, heroPos.z + rz * d)
          sniffAt.y = ground(sniffAt.x, sniffAt.z) + 0.95
          mode = 'sniff'; modeT = 0
        }
      } else if ((modeT += dt) > 3.4 || moving) { mode = 'follow'; nextSniff = 9 + Math.random() * 7 }

      if (mode === 'sniff') tgt.copy(sniffAt)
      else {
        tgt.set(heroPos.x - fwd.y * 1.3 + fwd.x * 0.25 + hv.x * 0.45, 0, heroPos.z + fwd.x * 1.3 + fwd.y * 0.25 + hv.z * 0.45)
        tgt.y = ground(tgt.x, tgt.z) + HOVER + 0.07 * Math.sin(t * 2.2)
      }

      // critically damped spring, then keep it off the grass and on a 0.9–2.8 m leash
      const W = mode === 'sniff' ? 2.5 : 3.2
      vPrev.copy(v)
      v.addScaledVector(tn.subVectors(tgt, p), W * W * dt).addScaledVector(v, -2 * W * dt)
      p.addScaledVector(v, dt)
      p.y = Math.max(p.y, ground(p.x, p.z) + 0.85)
      const dx = p.x - heroPos.x, dz = p.z - heroPos.z, dh = Math.hypot(dx, dz), lim = Math.min(Math.max(dh, 0.9), 2.8)
      if (dh !== lim && dh > 1e-4) { p.x = heroPos.x + (dx / dh) * lim; p.z = heroPos.z + (dz / dh) * lim }

      // face where it goes; when slow, look at him (or at the flower)
      const sp = Math.hypot(v.x, v.z), look = mode === 'sniff' ? sniffAt : heroPos
      const want = glance > 0 ? Math.atan2(camera.position.x - p.x, camera.position.z - p.z) : sp > 0.35 ? Math.atan2(v.x, v.z) : Math.atan2(look.x - p.x, look.z - p.z)
      const dy = wrap(want - yaw) * Math.min(1, dt * 5)
      yaw += dy
      // every few seconds turn and look back at the camera, so the eyes and face show from behind
      glance = Math.max(0, glance - dt)
      if ((nextGlance -= dt) < 0) { if (mode === 'follow') glance = 1.4; nextGlance = 4 + Math.random() * 3 }
      root.position.copy(p)
      root.rotation.y = yaw

      // squash & stretch (volume kept): stretch up when rising, along the path when speeding up
      const c = Math.cos(yaw), s = Math.sin(yaw), fwdV = (v.x * s + v.z * c) * (1 - Math.min(1, glance * 4)) // no forward lean while turned back to look
      acc += (Math.min(0.16, tn.subVectors(v, vPrev).length() / Math.max(dt, 1e-3) * 0.03) - acc) * Math.min(1, dt * 8)
      const sy = 1 + Math.max(-0.14, Math.min(0.18, v.y * 0.1)), sz = 1 + acc
      body.scale.set(1 / Math.sqrt(sy * sz), sy / Math.sqrt(sz), sz / Math.sqrt(sy))
      const atSpot = mode === 'sniff' && p.distanceTo(sniffAt) < 0.35
      sniffDip += ((atSpot ? 1 : 0) - sniffDip) * Math.min(1, dt * 4)
      body.rotation.x = Math.max(-0.25, Math.min(0.35, fwdV * 0.12)) + sniffDip * (0.45 + 0.05 * Math.sin(t * 22))
      body.rotation.z = Math.max(-0.3, Math.min(0.3, -dy / Math.max(dt, 1e-3) * 0.06)) // bank into turns
      body.position.y = sniffDip * 0.02 * Math.sin(t * 22)

      // ears flap gently to stay aloft, trail back with speed, droop as it nose-dives, twitch on cue
      flap += dt * (4 + sp * 1.5)
      twL = Math.max(0, twL - dt * 2.5); twR = Math.max(0, twR - dt * 2.5)
      ears.forEach((e, i) => {
        const tw = i ? twR : twL, side = i ? 1 : -1
        e.rotation.z = side * (2.4 + Math.sin(flap + i * 0.3) * (0.16 + Math.min(sp, 3) * 0.05) + Math.sin(t * 30) * 0.3 * tw * tw - sniffDip * 0.3)
        e.rotation.x = Math.min(sp * 0.12, 0.5)
      })
      tail.rotation.y = Math.sin(t * 7) * (0.25 + Math.min(sp, 2) * 0.15)
      paws.rotation.x = -Math.max(-0.3, Math.min(0.3, fwdV * 0.15))
      if ((nextBlink -= dt) < 0) { blink = 0.14; nextBlink = 2.5 + Math.random() * 3 }
      blink = Math.max(0, blink - dt)
      for (const e of eyes) e.scale.y = blink > 0 ? 0.12 : 1

      // fur combs back against the motion, sags a little, sways in the meadow wind (wind from field.js: +X, +Z)
      const wind = 0.18 + 0.1 * Math.sin(t * 1.7) + 0.06 * Math.sin(t * 4.3)
      const wx = 0.94 * wind - v.x * 0.12, wz = 0.34 * wind - v.z * 0.12
      comb.set(wx * c - wz * s, -0.3 - v.y * 0.1, wx * s + wz * c) // world → body space (yaw only)
      uComb.value.copy(comb.clampLength(0, 0.8))

      // proof view: ?pet=close looks at it from ~1.2 m, front three-quarter
      if (close) {
        const a = yaw + 0.55
        camera.position.set(p.x + Math.sin(a) * 1.2, p.y + 0.2, p.z + Math.cos(a) * 1.2)
        camera.lookAt(p.x, p.y + 0.02, p.z)
      }
    },
  }
}
