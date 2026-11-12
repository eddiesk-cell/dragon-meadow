// Sky, haze, light, shadow. Contract: PLAN.md §Contract (lane "sky").
// One function, skyColor(dir), paints both the sky dome and the fog, so a fully-hazed
// hill is exactly the sky behind it: no hard line where ground meets sky.
import {
  Fn, vec3, float, uniform, normalize, dot, max, pow, exp, smoothstep, mix, length, clamp,
  positionWorld, cameraPosition, normalWorldGeometry, fog,
} from 'three/tsl'

export async function createSky({ THREE, scene, sunDir, fogColor, heroPos }) {
  const uSun = uniform(sunDir.clone())
  const horizon = vec3(fogColor.r, fogColor.g, fogColor.b)    // Color is linear already
  const zenith = horizon.mul(vec3(0.42, 0.45, 0.50))           // cooler, dimmer grey overhead
  const warm = vec3(1.0, 0.95, 0.86)

  // Linear HDR radiance seen along world direction d.
  const skyColor = Fn(([d]) => {
    const e = d.y
    const base = mix(horizon, zenith, pow(smoothstep(0.0, 0.5, e), 0.6))
    // Glow ahead: brightest in the sun's compass direction, hugging the horizon.
    const az = max(dot(normalize(d.xz.add(1e-5)), normalize(uSun.xz)), 0)
    const band = exp(max(e, 0).mul(-4.0)).mul(pow(az, 3.0)).mul(1.1)
    // Soft overcast halo round the hidden sun (no disc).
    const halo = pow(max(dot(d, uSun), 0), 10.0).mul(0.3)
    return base.add(warm.mul(horizon).mul(band.add(halo)))
  })

  scene.backgroundNode = skyColor(normalize(normalWorldGeometry))

  // Haze: optical depth d1·x + (d2·x)² past 10 m — crisp to ~30 m (≈10%), ~60% by 100 m,
  // ~96% at the 200 m crest, >99% by 250 m — thinning slowly with height, and certain to finish by 380 m so the edge
  // of the land (and the sea far below) never draws a line.
  const toFrag = positionWorld.sub(cameraPosition)
  const dist = length(toFrag)
  const x = max(dist.sub(10), 0)
  const avgY = clamp(positionWorld.y.add(cameraPosition.y).mul(0.5), -30, 200)
  const depth = x.mul(0.0043).add(x.mul(0.0084).pow(2)).mul(exp(avgY.mul(-1 / 120)))
  const factor = max(float(1).sub(exp(depth.negate())), smoothstep(260, 380, dist))
  scene.fogNode = fog(skyColor(normalize(toFrag)), factor)
  scene.fog = scene.background = null

  scene.add(new THREE.HemisphereLight(0xdde4ec, 0x56633f, 1.35))
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.2)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  const sc = sun.shadow.camera
  sc.left = sc.bottom = -20; sc.right = sc.top = 20; sc.near = 1; sc.far = 160
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.03
  sun.shadow.radius = 3
  scene.add(sun, sun.target)

  const texel = 40 / 2048
  const follow = () => {
    // shortcut: world-space snap, not light-space; fine for a slow walk, upgrade if shadows shimmer when running.
    const x = Math.round(heroPos.x / texel) * texel, z = Math.round(heroPos.z / texel) * texel
    sun.target.position.set(x, heroPos.y, z)
    sun.position.copy(sunDir).multiplyScalar(80).add(sun.target.position)
  }
  follow()

  window.__probes.sky = () => ({ fog: scene.fogNode ? 'sky-matched exp+exp2 height haze' : 'none', shadow: sun.castShadow })
  return { update: follow }
}
