// Lane water — the still pond at the rock island's foot (PLAN.md Phase 6 "Lane water"): a planar mirror with soft
// ripples, and post lanterns on its shore whose light it doubles. Publishes ctx.pond, pushes ctx.keepClear.
//
// The ground is not carved (field.js builds the terrain and grass before this loads). Instead the water paints over what
// the carve would remove: inside the pond, the turf and grass within GRASS of the ground are drawn as water, so the bank
// reads as a clean shoreline. shortcut: anything else standing there under GRASS m (the hero wading) is painted too;
// upgrade when field.js takes a carve hook (needsWiring) — then this becomes a plain depth-tested surface.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  reflector, texture, uniform, vec2, vec3, vec4, float, positionWorld, positionView, cameraPosition, cameraWorldMatrix,
  cameraNear, cameraFar, viewportDepthTexture, perspectiveDepthToViewZ, mx_noise_float, normalize, length, mix, max,
  smoothstep, pow, step, viewportSharedTexture, getScreenPosition, cameraViewMatrix, cameraProjectionMatrix,
} from 'three/tsl'

// The pond: an organic ellipse (centre if landmarks has no rock island, half-axes, turn) in the low meadow ahead-right, filled up to TOP m;
// the water stands BANK below that, so its shore is a low turf bank. GRASS: the tallest blade field.js grows.
const POND = { x: 48, z: -55, ax: 52, az: 27, rot: 0.35, TOP: 0.45, BANK: 0.45 }, GRASS = 1.3

export async function createWater(ctx) {
  const { THREE, scene } = ctx
  const isle = ctx.landmarks?.rockisle // src/landmarks.js: the pond lies at its south foot, toward the start
  const { ax, az, rot, TOP, BANK } = POND, level = TOP - BANK
  const cx = isle ? isle.x - 2 : POND.x, cz = isle ? isle.z + isle.r + 6 : POND.z
  const c = Math.cos(rot), s = Math.sin(rot)
  const blob = (x, z) => { // metres inside the outline (< 0 outside)
    const u = (x - cx) * c + (z - cz) * s, v = (z - cz) * c - (x - cx) * s, a = Math.atan2(v / az, u / ax)
    return (1 - Math.hypot(u / ax, v / az) / (1 + 0.09 * Math.sin(3 * a + 1) + 0.06 * Math.sin(5 * a + 2))) * az
  }
  const inside = (x, z) => Math.min(blob(x, z), (TOP - ctx.heightAt(x, z)) * 6) // > 0: water

  // --- bake the pond into one texture over its square: (metres inside the shore, ground height)
  const N = 160, S = 2.3 * ax, x0 = cx - S / 2, z0 = cz - S / 2, half = THREE.DataUtils.toHalfFloat
  const data = new Uint16Array(N * N * 4)
  let area = 0
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = x0 + (i + 0.5) * S / N, z = z0 + (j + 0.5) * S / N, e = inside(x, z), k = (j * N + i) * 4
    data[k] = half(e); data[k + 1] = half(ctx.heightAt(x, z))
    if (e > 0) area += (S / N) ** 2
  }
  const map = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.HalfFloatType)
  map.magFilter = map.minFilter = THREE.LinearFilter
  map.needsUpdate = true
  const pond = xz => texture(map, xz.sub(vec2(x0, z0)).div(S)).level(0)

  // --- the surface
  const uTime = uniform(0), uSky = uniform(new THREE.Color()), uNight = uniform(0)
  const wp = positionWorld.xz, here = pond(wp), e = here.x
  const ripple = vec2( // slow, faint: the pond is a mirror that breathes
    mx_noise_float(vec3(wp.mul(0.45), uTime.mul(0.35))), mx_noise_float(vec3(wp.mul(0.45).add(31.7), uTime.mul(0.35))),
  ).add(vec2(mx_noise_float(vec3(wp.mul(1.6), uTime.mul(0.9))), mx_noise_float(vec3(wp.mul(1.6).add(7.3), uTime.mul(0.9)))).mul(0.4))
  const toCam = cameraPosition.sub(positionWorld), dist = length(toCam)
  const mirror = reflector({ resolutionScale: 0.5 })
  mirror.target.rotateX(-Math.PI / 2)
  mirror.target.position.set(cx, level, cz)
  scene.add(mirror.target)
  mirror.uvNode = mirror.uvNode.add(ripple.mul(float(0.006).mul(float(12).div(max(dist, 12)))))
  const cosV = normalize(toCam).y.add(ripple.x.mul(0.03)).clamp(0, 1)
  const fres = float(0.02).add(pow(float(1).sub(cosV), 5).mul(0.98))
  const shallow = smoothstep(9, 0, e)
  const body = mix(vec3(0.012, 0.045, 0.04), vec3(0.05, 0.1, 0.06), shallow).mul(uSky.mul(1.4))
  const sheen = mix(float(0.62), float(1), fres) // stylised: a strong mirror even looking down
  // Nothing is carved and the mirror hides the grass, so the bank and the far meadow's grass have nothing to reflect: march
  // the reflected ray over the pond map, and where it leaves the pond below the grass tops it sees turf, not sky.
  const r = normalize(positionWorld.sub(cameraPosition)).mul(vec3(1, -1, 1))
  // The turf it hits is drawn on screen already (bank grass): sample that, so the reflection matches it, day or night.
  let hitAt = vec3(0), found = float(0)
  for (const t of [1, 2.5, 4.5, 7, 10, 14, 19, 26]) {
    const p = positionWorld.add(r.mul(t)), g = pond(p.xz)
    const hit = step(g.x, 0).mul(step(p.y, g.y.add(0.9))).mul(float(1).sub(found))
    hitAt = hitAt.add(vec3(p.x, max(p.y, g.y.add(0.3)), p.z).mul(hit))
    found = found.add(hit)
  }
  const turf = viewportSharedTexture(getScreenPosition(cameraViewMatrix.mul(vec4(hitAt, 1)).xyz, cameraProjectionMatrix).clamp(0, 1)).rgb
  const seen = mix(mirror.rgb, turf.mul(0.7), found).mul(vec3(0.82, 0.9, 0.88))
  const col = mix(body, seen, sheen)

  // The mirror never shows grass: blades standing in the pond are painted out below, so their reflections would be ghosts.
  // shortcut: finds field.js's blade meshes by their `aOffset` lattice attribute; upgrade when field publishes ctx.grass.
  const grass = []
  scene.traverse(o => o.geometry?.attributes?.aOffset && grass.push(o))
  const base = mirror.reflector, render = base.updateBefore
  base.updateBefore = frame => {
    for (const g of grass) g.visible = false
    try { return render.call(base, frame) } finally { for (const g of grass) g.visible = true }
  }

  // What is in front of this water pixel? If it is turf or grass inside the pond (what a carve would remove), paint over it.
  const sceneZ = perspectiveDepthToViewZ(viewportDepthTexture(), cameraNear, cameraFar)
  const q = cameraWorldMatrix.mul(vec4(positionView.xyz.mul(sceneZ.div(positionView.z)), 1)).xyz, there = pond(q.xz)
  const carved = step(0, there.x).mul(step(q.y, there.y.add(GRASS)))
  const hidden = step(positionView.z.add(0.05), sceneZ).mul(float(1).sub(carved)) // occluder nearer and not carved
  // fog off: the mirror image already carries the haze of the whole path, eye → water → object
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, fog: false })
  m.colorNode = col
  m.opacityNode = smoothstep(0, 1.5, e).mul(float(1).sub(hidden))
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(S, S).rotateX(-Math.PI / 2), m)
  surface.position.set(cx, level, cz)
  surface.renderOrder = -1 // first among the see-through things, so motes, fur and effects still draw over it
  scene.add(surface)

  // --- lanterns on the shore (town-kit piece; its glass carries the glow), lit by ctx.night
  const glass = new THREE.MeshStandardNodeMaterial({ color: 0xffe2b0, roughness: 0.3 })
  glass.emissiveNode = vec3(1, 0.6, 0.24).mul(uNight.mul(9).add(1.4))
  const kit = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/world/town-kit.glb')
  const proto = kit.scene.getObjectByName('lantern')
  const lanterns = []
  for (const a of [1.05, 1.57, 2.09, 2.62, 3.4, 3.67, 5.9, 6.02]) { // world bearings from the centre: near shore, then far ends
    let r = 0
    while (inside(cx + Math.cos(a) * r, cz + Math.sin(a) * r) > 0) r += 0.25
    const x = cx + Math.cos(a) * (r + 2.5), z = cz + Math.sin(a) * (r + 2.5)
    if (isle && Math.hypot(x - isle.x, z - isle.z) < isle.r + 3) continue // not inside the island's apron
    const l = proto.clone()
    l.traverse(o => { if (o.isMesh) { o.castShadow = true; if (o.material.name === 'window') o.material = glass } })
    l.position.set(x, ctx.heightAt(x, z) + 0.3, z)
    l.rotation.y = a
    scene.add(l)
    lanterns.push(l)
  }

  ctx.pond = { x: cx, z: cz, level, inside } // inside(x, z) > 0: water there
  for (const t of [-0.55, 0, 0.55]) ctx.keepClear.push({ x: cx + c * ax * t, z: cz + s * ax * t, r: az + 4 })
  window.__probes.water = () => ({ level, area: Math.round(area), lanterns: lanterns.length, unmirrored: grass.length })

  return {
    update(dt, t) {
      uTime.value = t
      uSky.value.copy(ctx.fogColor)
      uNight.value = ctx.night
    },
  }
}
