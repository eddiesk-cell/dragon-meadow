// Sky, haze, light and the day–night cycle. Contract: PLAN.md §Contract + Phase 6 "Lane sky6".
// Writes ctx.tod, ctx.night, ctx.sunDir, ctx.fogColor (all live). haze(dir) paints the fog AND the sky at the horizon,
// so a fully hazed hill is exactly the sky behind it: no hard line. Clouds, stars, aurora and the moon live above the haze.
import {
  Fn, If, vec2, vec3, vec4, float, uniform, normalize, dot, max, min, pow, exp, smoothstep, mix, length, clamp,
  sin, fract, floor, step, abs, positionWorld, cameraPosition, normalWorldGeometry, fog, mx_fractal_noise_float,
} from 'three/tsl'

const TAU = Math.PI * 2
// ?tod= pins: golden afternoon (mix-day.png), sun 4° over the sea, full night with the moon where the day sun was.
const PINS = { day: 0.64, dusk: 0.73, night: 0.14 }
const ss = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k) }

// Equinox sun: rises behind the start (+Z), noon 32° up to the left (−X), sets straight ahead over the sea (−Z).
// At the day pin it stands 20° up, 35° left of the start view: top-left of frame, as in mix-day.png.
const sunAt = (tod, v) => { const a = (tod - 0.5) * TAU; return v.set(-0.8434 * Math.cos(a), 0.5373 * Math.cos(a), -Math.sin(a)) }

// Linear-light palette keyed by sun height (sunDir.y). Night ← twilight ← sunset ← dusk ← golden ← noon.
// zenith, horizon (= fog), sun-side glow, key-light colour, hemi sky, hemi ground, cloud lit, cloud shade | key I, hemi I, cloud cover
const KEYS = [
  [-0.30, [.008, .012, .060], [.050, .060, .170], [0, 0, 0], [.55, .66, 1], [.30, .42, .85], [.02, .035, .05], [.07, .08, .17], [.012, .015, .045], 0, .9, .32],
  [-0.10, [.020, .030, .130], [.17, .11, .24], [.30, .09, .08], [.55, .66, 1], [.42, .38, .70], [.05, .05, .06], [.32, .13, .20], [.04, .035, .09], 0, .8, .25],
  [0.00, [.060, .080, .280], [.66, .38, .38], [1.4, .45, .12], [1, .45, .2], [.80, .58, .62], [.12, .10, .08], [1.3, .55, .38], [.22, .14, .26], 1.3, .9, .16],
  [0.08, [.070, .140, .460], [.86, .60, .52], [1.5, .72, .28], [1, .62, .36], [.85, .78, .85], [.22, .22, .12], [1.6, .95, .66], [.34, .28, .42], 1.9, 1.0, .12],
  [0.20, [.045, .150, .580], [.60, .68, .88], [1.3, .90, .50], [1, .86, .68], [.72, .84, 1], [.30, .36, .16], [1.9, 1.75, 1.6], [.46, .50, .72], 2.6, 1.2, .10],
  [0.55, [.035, .130, .550], [.52, .66, .95], [.80, .75, .60], [1, .96, .90], [.70, .82, 1], [.30, .36, .16], [2.0, 2.0, 2.0], [.52, .58, .78], 3.0, 1.3, .12],
]

export async function createSky(ctx) {
  const { THREE, scene, params } = ctx
  const C = () => new THREE.Color()
  const pal = { zenith: C(), glow: C(), key: C(), hemiSky: C(), hemiGround: C(), cloudLit: C(), cloudShade: C(), keyI: 0, hemiI: 0, cover: 0 }
  const moonDir = new THREE.Vector3()
  ctx.moonDir = moonDir // extra, read-only for others: direction TO the moon

  const uSun = uniform(ctx.sunDir), uMoon = uniform(moonDir), uHorizon = uniform(ctx.fogColor)
  const uZenith = uniform(pal.zenith), uGlow = uniform(pal.glow), uCloudLit = uniform(pal.cloudLit), uCloudShade = uniform(pal.cloudShade)
  const uDisc = uniform(C()), uNight = uniform(0), uCover = uniform(0.1), uTime = uniform(0)

  // Haze: horizon→zenith gradient, a warm glow round the sun and along its horizon, a cool halo round the moon.
  const haze = Fn(([d]) => {
    const e = max(d.y, 0)
    const base = mix(uHorizon, uZenith, pow(smoothstep(0, 0.75, e), 0.55))
    const mu = max(dot(d, uSun), 0)
    const az = max(dot(normalize(d.xz.add(1e-4)), normalize(uSun.xz.add(1e-4))), 0)
    const glow = pow(mu, 5).mul(0.3).add(pow(mu, 48).mul(0.9)).add(pow(az, 3).mul(exp(e.mul(-7))).mul(0.45))
    const halo = pow(max(dot(d, uMoon), 0), 40).mul(uNight).mul(vec3(0.07, 0.09, 0.18))
    return base.add(uGlow.mul(glow)).add(halo)
  })

  // Cumulus on a flat deck: 5-octave noise, lit on the side facing the sun, silver-edged near it, dissolving into the haze low down.
  const clouds = Fn(([d]) => {
    const p = d.xz.div(d.y.add(0.1)).mul(0.55).add(vec2(uTime.mul(0.004), uTime.mul(0.0015)))
    const toSun = normalize(uSun.xz.add(1e-4)).mul(0.07)
    const n = mx_fractal_noise_float(vec3(p, uTime.mul(0.002)), 5, 2.1, 0.5)
    const n2 = mx_fractal_noise_float(vec3(p.add(toSun), uTime.mul(0.002)), 5, 2.1, 0.5)
    const dens = smoothstep(uCover, uCover.add(0.32), n)
    const lit = clamp(n.sub(n2).mul(5).add(0.55), 0, 1)
    const rim = pow(max(dot(d, uSun), 0), 6).mul(dens.oneMinus()).mul(1.6)
    const col = mix(uCloudShade, uCloudLit, lit).add(uCloudLit.mul(rim))
    return vec4(mix(col, uHorizon, exp(d.y.mul(-8)).mul(0.65)), dens.mul(smoothstep(0.015, 0.17, d.y)))
  })

  // Stars: one per lit cell of a 3-D grid on the sphere, twinkling; the Milky Way band crowds them and glows faintly.
  const h3 = c => fract(sin(vec3(dot(c, vec3(127.1, 311.7, 74.7)), dot(c, vec3(269.5, 183.3, 246.1)), dot(c, vec3(113.5, 271.9, 124.6)))).mul(43758.5453))
  const starLayer = (d, scale, prob, size) => {
    const p = d.mul(scale), h = h3(floor(p))
    const r = length(fract(p).sub(0.5).sub(h.sub(0.5).mul(0.6)))
    const tw = sin(uTime.mul(h.y.mul(3).add(1)).add(h.z.mul(40))).mul(0.3).add(0.7)
    return step(prob.oneMinus(), h.x).mul(smoothstep(size, 0, r)).mul(tw).mul(h.y.mul(h.y).mul(5).add(0.4))
  }
  const BAND = new THREE.Vector3(0.55, 0.42, 0.72).normalize()
  const stars = d => {
    const bd = dot(d, vec3(BAND.x, BAND.y, BAND.z)), band = exp(bd.mul(bd).mul(-28))
    const s = starLayer(d, 90, float(0.05), 0.2).mul(2.2).add(starLayer(d, 210, band.mul(0.22).add(0.07), 0.16))
    const neb = band.mul(mx_fractal_noise_float(d.mul(6), 3, 2, 0.5).mul(0.5).add(0.5)).mul(vec3(0.09, 0.07, 0.17))
    return vec3(0.85, 0.9, 1).mul(s).add(neb)
  }

  // Aurora: two vertical curtains hanging ahead (scale-free: one unit = curtain distance), bright green at the sharp
  // lower hem, violet as they fade upward, ray-streaked, folding slowly. Each ray is hit analytically, no marching.
  const curtain = (d, A, slope, ph) => {
    const hz = max(length(d.xz), 1e-3), h = d.xz.div(hz), den = h.y.sub(h.x.mul(slope)) // < 0 when looking toward it
    const wig = x => sin(x.mul(2.5).add(uTime.mul(0.05)).add(ph)).mul(0.3).add(sin(x.mul(6.1).sub(uTime.mul(0.09)).add(ph * 2)).mul(0.1))
    const r0 = float(-A).div(min(den, -1e-3)), x = h.x.mul(r0)
    const r = float(-A).add(wig(x)).div(min(den, -1e-3)), y = r.mul(d.y).div(hz).div(A) // hit height in curtain units
    const u = h.x.mul(r).div(A)
    const rays = pow(sin(u.mul(9).add(sin(u.mul(2.3).add(uTime.mul(0.2))).mul(3)).add(uTime.mul(0.1))).mul(0.5).add(0.5), 3)
      .mul(sin(u.mul(23).sub(uTime.mul(0.3))).mul(0.4).add(0.6)).mul(0.85).add(0.15)
    const fold = smoothstep(0.25, 0.9, sin(u.mul(1.3).add(uTime.mul(0.07)).add(ph)).mul(0.5).add(0.5))
    const dy = y.sub(sin(u.mul(1.7).add(uTime.mul(0.03)).add(ph)).mul(0.04).add(0.12)) // height above the undulating hem
    const hem = smoothstep(0, 0.025, dy)
    const col = vec3(0.12, 1.0, 0.45).mul(exp(dy.mul(-7))).add(vec3(0.5, 0.16, 1.0).mul(smoothstep(0.03, 0.14, dy).mul(exp(dy.mul(-2.2))).mul(0.55)))
    return col.mul(hem).mul(rays).mul(fold.mul(0.9).add(0.1)).mul(smoothstep(-0.02, -0.25, den)).mul(smoothstep(4, 1, r.div(A)))
  }

  const skyColor = Fn(([dir]) => {
    const d = dir.toVar() // evaluated here, not first inside the If below (it would stay unset when the If is skipped)
    const up = smoothstep(0, 0.14, d.y)
    const sunDisc = uDisc.mul(smoothstep(0.999925, 0.999955, dot(d, uSun)))
    const extra = vec3(0).toVar()
    If(uNight.greaterThan(0.01), () => {
      const moon = vec3(2.2, 2.15, 2.0).mul(smoothstep(0.99974, 0.99979, dot(d, uMoon))).mul(float(0.85).add(mx_fractal_noise_float(d.mul(900), 2, 2, 0.5).mul(0.25)))
      const aur = curtain(d, 1.0, 0.5, 0).add(curtain(d, 1.7, -0.3, 2.4).mul(0.6)).mul(0.7)
      extra.assign(stars(d).mul(uNight.mul(uNight)).add(aur.mul(uNight)).mul(up).add(moon.mul(uNight)))
    })
    const cl = clouds(d)
    return mix(haze(d).add(sunDisc).add(extra), cl.rgb, cl.a)
  })
  scene.backgroundNode = skyColor(normalize(normalWorldGeometry))

  // Aerial perspective, Phase 6: the world shows through. Thin air (scale height 200 m): ~8 % at 100 m, ~45 % at 600 m,
  // ~65 % at 1 km, ~93 % at 2 km, finished by 2.9 km; plus a ground haze (scale height 25 m) that softens low land — the
  // 200 m crest ~40 % — while the castle on its headland and the sky islands stay readable. Thicker and bluer at night.
  const uFogK = uniform(1)
  const toFrag = positionWorld.sub(cameraPosition), dist = length(toFrag), x = max(dist.sub(15), 0)
  const avgY = clamp(positionWorld.y.add(cameraPosition.y).mul(0.5), -40, 600)
  const air = x.mul(0.0008).add(x.mul(0.0005).pow(2)).mul(exp(avgY.mul(-1 / 200)))
  const ground = x.mul(0.003).mul(exp(max(avgY, 0).mul(-1 / 25)))
  scene.fogNode = fog(haze(normalize(toFrag)), max(float(1).sub(exp(air.add(ground).mul(uFogK).negate())), smoothstep(2300, 2900, dist)))
  scene.fog = scene.background = null

  const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1)
  const key = new THREE.DirectionalLight(0xffffff, 1) // the sun by day, the moon by night
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  const sc = key.shadow.camera
  sc.left = sc.bottom = -20; sc.right = sc.top = 20; sc.near = 1; sc.far = 160
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.03
  key.shadow.radius = 3
  scene.add(hemi, key, key.target)

  const mode = params.get('tod'), pin = PINS[mode] ?? (mode && isFinite(+mode) ? +mode : null)
  const daySecs = mode === 'cycle' ? 40 : 360 // ?tod=cycle: a whole day in 40 s, for the day→night walk clip
  let tod = pin ?? PINS.day
  const tmp = C(), texel = 40 / 2048
  let lightIs = 'sun'

  const cols = [pal.zenith, ctx.fogColor, pal.glow, pal.key, pal.hemiSky, pal.hemiGround, pal.cloudLit, pal.cloudShade]
  function setPalette(s) {
    let i = 0
    while (i < KEYS.length - 2 && s > KEYS[i + 1][0]) i++
    const a = KEYS[i], b = KEYS[i + 1], k = ss(a[0], b[0], s)
    cols.forEach((c, j) => c.setRGB(...a[j + 1]).lerp(tmp.setRGB(...b[j + 1]), k))
    pal.keyI = a[9] + (b[9] - a[9]) * k
    pal.hemiI = a[10] + (b[10] - a[10]) * k
    pal.cover = a[11] + (b[11] - a[11]) * k
  }

  function update(dt, t) {
    if (pin == null) tod = (tod + dt / daySecs) % 1
    ctx.tod = tod
    sunAt(tod, ctx.sunDir)
    moonDir.copy(ctx.sunDir).negate()
    const s = ctx.sunDir.y
    setPalette(s)
    ctx.night = ss(0.15, -0.12, s)
    uNight.value = ctx.night
    uTime.value = t
    uCover.value = pal.cover
    uFogK.value = 1 + 0.6 * ctx.night

    const sunUp = ss(-0.02, 0.06, s), moonUp = ss(-0.02, -0.14, s)
    uDisc.value.copy(pal.key).multiplyScalar(40 * sunUp)
    lightIs = sunUp >= moonUp ? 'sun' : 'moon'
    const dir = lightIs === 'sun' ? ctx.sunDir : moonDir
    key.color.copy(pal.key)
    key.intensity = pal.keyI * sunUp + 0.8 * moonUp
    hemi.color.copy(pal.hemiSky)
    hemi.groundColor.copy(pal.hemiGround)
    hemi.intensity = pal.hemiI

    // shortcut: world-space snap, not light-space; fine for a walk, upgrade if shadows shimmer when running.
    const hp = ctx.heroPos, x = Math.round(hp.x / texel) * texel, z = Math.round(hp.z / texel) * texel
    key.target.position.set(x, hp.y, z)
    key.position.copy(dir).multiplyScalar(80).add(key.target.position)
  }
  update(0, 0)

  const r3 = v => Math.round(v * 1000) / 1000
  window.__probes.sky = () => ({ tod: r3(ctx.tod), night: r3(ctx.night), sunY: r3(ctx.sunDir.y), light: lightIs, fog: 'haze-matched aerial perspective', shadow: key.castShadow })
  return { update }
}
