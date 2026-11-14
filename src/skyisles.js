// Lane skyisles: floating islands of pale skystone, their springs pouring off the edges as waterfalls that turn to mist
// before they land; a slow bob; vines glow by ctx.night. Contract: PLAN.md Phase 6 "Lane skyisles".
// Models: public/models/flora/skyisle.glb (tools/flora/skyisle.py) — isle_a/b/c, each with fall_<n> lip markers.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { uniform, vec3, float, mix, smoothstep, uv, positionLocal, positionWorld, normalWorld, vertexColor, mx_noise_float, abs, pow, max } from 'three/tsl'

// [model, degrees right of the start view (−Z), distance m, width m, elevation° of its lowest point seen from the start,
// yaw°]. The rock island (landmarks, at 50,−105) fills the right of the start view and the golden-afternoon sun sits
// upper left (az −26° to −35°), so the in-frame ones layer in the open sky between them, away from the sun as in day.png;
// the rest wait behind the rock and for whoever turns round. Heights follow from the elevation: all hang 150 m+ up.
const ISLES = [
  ['isle_a', -6, 820, 120, 8.5, 20],
  ['isle_c', -55, 1200, 75, 12, 140],
  ['isle_b', 7, 900, 105, 12.5, 70],
  ['isle_c', 2, 600, 45, 6, 300],
  ['isle_a', 1, 1600, 120, 4, 210],
  ['isle_b', -14, 700, 38, 16, 10],
  ['isle_a', 28, 1700, 140, 10, 160],
  ['isle_c', 75, 900, 85, 9, 45],
  ['isle_a', 160, 1500, 200, 9, 95],
]
const OFF = new URLSearchParams(location.search).get('skyisles') === '0' // ?skyisles=0: measure the scene without them
const FALL_SPEED = 26 // m/s the streaks scroll down

export async function createSkyisles(ctx) {
  if (OFF) return null
  const { THREE, scene, camera } = ctx
  const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/flora/skyisle.glb')
  const kit = Object.fromEntries(gltf.scene.children.map(o => [o.name, o]))

  const uNight = uniform(0), uTime = uniform(0), uTint = uniform(new THREE.Color()), uFill = uniform(new THREE.Color())
  const vc = vertexColor()
  const stone = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, side: THREE.DoubleSide })
  stone.colorNode = vc.rgb
  // Bounce: the sunlit meadow and cloud sea light the islands from below and a soft sky fill lifts the shade, so the cliffs
  // read pale and warm as in day.png (moon-lavender at night); vines drink the day and give it back.
  const bounce = max(normalWorld.y.negate(), 0).mul(0.5).add(0.2)
  stone.emissiveNode = vc.rgb.mul(uFill).mul(bounce).add(vec3(0.25, 1.0, 0.72).mul(vc.a.mul(uNight).mul(2.4)))

  // Waterfall: a camera-facing sheet, top at y 0, bottom at y −1 (scaled to width × drop). Streaks scroll down in world
  // metres; the lower part spreads wide, softens and fades out as mist long before it could land.
  const fallGeo = new THREE.PlaneGeometry(1, 1, 1, 40).translate(0, -0.5, 0)
  const fallMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide })
  const v = uv().y.oneMinus() // 0 at the lip, 1 at the end
  fallMat.positionNode = vec3(positionLocal.x.mul(pow(v, 2.2).mul(2.6).add(1)), positionLocal.y, positionLocal.z)
  const u = uv().x.sub(0.5).mul(2)
  const sY = positionWorld.y.mul(0.05).add(uTime.mul(FALL_SPEED * 0.05)), seed = positionWorld.x.add(positionWorld.z).mul(0.002)
  const n1 = mx_noise_float(vec3(u.mul(4), sY, seed)), n2 = mx_noise_float(vec3(u.mul(11), sY.mul(2.4), seed.add(3.1)))
  const n3 = mx_noise_float(vec3(u.mul(3), sY.mul(3.5), seed.add(5.3))) // short clumps of water: they read as falling
  const sheet = n1.mul(0.45).add(n2.mul(0.25)).add(n3.mul(0.45)).mul(0.5).add(0.5)
  const mist = smoothstep(0.3, 0.9, v)
  const puff = mx_noise_float(vec3(u.mul(1.8), positionWorld.y.mul(0.018).add(uTime.mul(0.12)), seed.add(7))).mul(0.5).add(0.5)
  const edge = smoothstep(1, mix(float(0.5), float(0.05), mist), abs(u).add(n2.mul(0.12)))
  const alpha = mix(smoothstep(0.2, 0.7, sheet).mul(0.75).add(0.25), puff.mul(0.6), mist)
  fallMat.opacityNode = alpha.mul(edge).mul(smoothstep(0, 0.015, v)).mul(smoothstep(1, 0.55, v))
  fallMat.colorNode = uTint.mul(mix(sheet.mul(0.3).add(0.82), float(1), mist))

  const isles = [], falls = [], wp = new THREE.Vector3()
  ISLES.forEach(([name, az, d, w, h, yaw], i) => {
    const isle = kit[name].clone()
    const s = w / 100
    const x = Math.sin(az * Math.PI / 180) * d, z = -Math.cos(az * Math.PI / 180) * d
    kit[name].geometry.computeBoundingBox()
    const y = Math.max(ctx.heightAt(0, 0) + 1.8 + Math.tan(h * Math.PI / 180) * d - kit[name].geometry.boundingBox.min.y * s, Math.max(ctx.heightAt(x, z), 0) + 150 + 3 * s)
    isle.scale.setScalar(s)
    isle.position.set(x, y, z)
    isle.rotation.y = yaw * Math.PI / 180
    isle.traverse(o => { if (o.isMesh) { o.material = stone; o.castShadow = o.receiveShadow = false } })
    scene.add(isle)
    isles.push({ isle, y, s, ph: i * 1.7, w: 2 * Math.PI / (28 + 9 * (i % 4)) })
    for (const m of isle.children.filter(o => o.name.startsWith('fall_'))) {
      const f = new THREE.Mesh(fallGeo, fallMat)
      f.scale.set(m.userData.w * s, m.userData.drop * s, 1)
      f.frustumCulled = false
      f.renderOrder = 1
      scene.add(f)
      falls.push({ f, m })
    }
  })

  const GLOW = new THREE.Color(0.55, 1.1, 1.25), WARM = new THREE.Color(1, 0.88, 0.74), MOON = new THREE.Color(0.32, 0.3, 0.55), tmp = new THREE.Color()
  function update(dt, t) {
    uTime.value = t
    uNight.value = ctx.night
    // Falls take the sky's light by day (white, a touch of haze), and glow pale cyan at night.
    const day = THREE.MathUtils.clamp(ctx.sunDir.y * 4 + 0.35, 0.25, 1)
    uTint.value.copy(ctx.fogColor).multiplyScalar(0.25).add(tmp.setScalar(0.95 * day)).lerp(GLOW, ctx.night)
    uFill.value.copy(WARM).multiplyScalar(day).lerp(MOON, ctx.night)
    for (const o of isles) {
      o.isle.position.y = o.y + 3 * o.s * Math.sin(t * o.w + o.ph)
      o.isle.rotation.z = 0.006 * Math.sin(t * o.w * 0.7 + o.ph)
    }
    for (const { f, m } of falls) {
      m.getWorldPosition(wp)
      f.position.copy(wp)
      f.rotation.y = Math.atan2(camera.position.x - wp.x, camera.position.z - wp.z)
    }
  }
  update(0, 0)

  const r = v => Math.round(v), box = new THREE.Box3(), c = new THREE.Vector3()
  // Screen box [x0, y0, x1, y1] in px of each island in front of the camera, and the sun's px, to check the layout.
  const px = v => [r((v.x + 1) * innerWidth / 2), r((1 - v.y) * innerHeight / 2)]
  window.__probes.skyisles = () => {
    const alt = isles.map(o => o.isle.position.y - Math.max(ctx.heightAt(o.isle.position.x, o.isle.position.z), 0))
    const dist = isles.map(o => Math.hypot(o.isle.position.x - ctx.heroPos.x, o.isle.position.z - ctx.heroPos.z))
    const boxes = isles.map(o => {
      box.setFromObject(o.isle)
      const pts = [0, 1, 2, 3, 4, 5, 6, 7].map(k => new THREE.Vector3(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z).project(camera)).filter(p => p.z < 1).map(px)
      return pts.length < 8 ? null : [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))]
    })
    const sun = px(c.copy(ctx.sunDir).multiplyScalar(2000).add(camera.position).project(camera))
    return { isles: isles.length, falls: falls.length, alt: [r(Math.min(...alt)), r(Math.max(...alt))], dist: [r(Math.min(...dist)), r(Math.max(...dist))], night: +ctx.night.toFixed(2), tod: +ctx.tod.toFixed(3), sun, boxes }
  }
  return { update }
}
