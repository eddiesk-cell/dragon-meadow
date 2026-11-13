// Sky, haze, light and the day–night cycle. Contract: PLAN.md §Contract + Phase 6 "Lane sky6".
// Writes ctx.tod, ctx.night, ctx.sunDir, ctx.fogColor (all live). haze(dir) paints the fog AND the sky at the horizon,
// so a fully hazed hill is exactly the sky behind it: no hard line. Clouds, stars, aurora and the moon live above the haze.
import {
  Fn, If, vec2, vec3, vec4, float, uniform, normalize, dot, max, min, pow, exp, smoothstep, mix, length, clamp, atan, abs,
  sin, fract, floor, step, positionWorld, cameraPosition, normalWorldGeometry, fog, mx_fractal_noise_float, mx_worley_noise_float, renderGroup,
} from 'three/tsl'

const TAU = Math.PI * 2
// ?tod= pins: golden afternoon (mix-day.png), sun 10° up just clear of the crest, full night with the moon where the day sun was.
const PINS = { day: 0.64, dusk: 0.70, night: 0.14 }
const ss = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k) }

// Equinox sun: rises behind the start (+Z), noon 32° up to the left (−X), sets straight ahead over the sea (−Z).
// At the day pin it stands 20° up, 35° left of the start view: top-left of frame, as in mix-day.png.
const sunAt = (tod, v) => { const a = (tod - 0.5) * TAU; return v.set(-0.8434 * Math.cos(a), 0.5373 * Math.cos(a), -Math.sin(a)) }

// Linear-light palette keyed by sun height (sunDir.y). Night ← twilight ← sunset ← dusk ← golden ← noon.
// zenith, horizon (= fog), sun-side glow, key-light colour, hemi sky, hemi ground, cloud lit, cloud shade | key I, hemi I, cloud cover
const KEYS = [
  [-0.25, [.007, .013, .072], [.155, .205, .390], [0, 0, 0], [.55, .66, 1], [.25, .45, .85], [.02, .045, .06], [.07, .08, .17], [.012, .015, .045], 0, 1.15, .7],
  [-0.08, [.020, .030, .130], [.24, .17, .33], [.30, .09, .08], [.55, .66, 1], [.42, .38, .70], [.05, .05, .06], [.32, .13, .20], [.04, .035, .09], 0, .8, .3],
  [0.03, [.060, .080, .280], [.66, .38, .38], [1.4, .45, .12], [1, .45, .2], [.80, .58, .62], [.12, .10, .08], [1.3, .55, .38], [.22, .14, .26], 1.3, .9, -.2],
  [0.15, [.090, .170, .520], [.86, .60, .52], [1.5, .72, .28], [1, .62, .36], [.85, .78, .85], [.22, .22, .12], [1.7, 1.0, .70], [.36, .30, .44], 2.1, 1.0, .15],
  [0.32, [.220, .360, .780], [1.12, 1.03, .92], [1.5, .90, .20], [1, .77, .47], [.82, .82, .86], [.30, .36, .16], [1.7, 1.3, .98], [.56, .50, .70], 3.2, 1.0, .17],
  [0.60, [.200, .340, .760], [.84, .86, 1.02], [1.2, .85, .40], [1, .88, .68], [.80, .82, .88], [.30, .36, .16], [2.1, 1.9, 1.7], [.56, .56, .76], 3.4, 1.05, .12],
]

export async function createSky(ctx) {
  const { THREE, scene, params } = ctx
  const C = () => new THREE.Color()
  const pal = { zenith: C(), glow: C(), key: C(), hemiSky: C(), hemiGround: C(), cloudLit: C(), cloudShade: C(), keyI: 0, hemiI: 0, cover: 0 }
  const moonDir = new THREE.Vector3()
  ctx.moonDir = moonDir // extra, read-only for others: direction TO the moon

  // Every live uniform sits in the render group: the fog is compiled into every material in the scene, and an object-group
  // uniform is only re-sent with a material three refreshes — a plain glb or MeshStandard material (settlements' harbour sea)
  // kept its first frame's values, so its fog never went to night or took the aerial tint. One shared buffer, sent per render.
  const live = v => uniform(v).setGroup(renderGroup)
  const uSun = live(ctx.sunDir), uMoon = live(moonDir), uHorizon = live(ctx.fogColor)
  const uZenith = live(pal.zenith), uGlow = live(pal.glow), uCloudLit = live(pal.cloudLit), uCloudShade = live(pal.cloudShade)
  const uDisc = live(C()), uNight = live(0), uCover = live(0.1), uTime = live(0)
  // ctx.aloft (field): 0 on foot … 1 on the dragon's back. Looking down from up there the air between eye and land is lit
  // from above with the land dark behind it: a bluer, deeper veil than the pale horizon band seen on foot. It ramps in over
  // the first 0.8° below the horizon, so the land (fogged) and the sky dome below the horizon (where the land runs past the far
  // plane) take the same colour and the far land still melts into the horizon with no line.
  const uAloft = live(0).onRenderUpdate(() => ctx.aloft ?? 0)
  const aerial = d => mix(vec3(1), vec3(0.46, 0.6, 0.8), smoothstep(0, 0.014, d.y.negate()).mul(uAloft))

  // Haze: horizon→zenith gradient, a warm glow round the sun and along its horizon, a cool halo round the moon.
  // The pale band holds to ~2° (the crest at ~4° dissolves in it); above, the zenith takes over: by ~10° by day,
  // and much faster at night so the sky above ~9° is deep indigo.
  const haze = Fn(([d]) => {
    const e = max(d.y, 0)
    const base = mix(uHorizon, uZenith, pow(smoothstep(0.03, mix(0.3, 0.15, uNight), e), mix(0.5, 1, uNight)))
    const mu = max(dot(d, uSun), 0)
    const az = max(dot(normalize(d.xz.add(1e-4)), normalize(uSun.xz.add(1e-4))), 0)
    // the glow along the sun's horizon; from the air it fades below the horizon too (on foot the land there is the horizon)
    const glow = pow(mu, 150).mul(0.3).add(pow(mu, 500).mul(0.6)).add(pow(az, 6).mul(exp(max(e, d.y.negate().mul(uAloft)).mul(-14))).mul(0.3))
    const halo = pow(max(dot(d, uMoon), 0), 120).mul(uNight).mul(vec3(0.06, 0.08, 0.16))
    // By day the glow partly replaces the blue rather than adding to it, so round the sun the sky turns gold, not white.
    // Round the sun by day the blue gives way to a gold sky (mixed, not added: gold over blue would turn pink).
    const warm = mix(base, uGlow.mul(0.6), pow(mu, 60).mul(0.9).mul(uNight.oneMinus()))
    return warm.mul(float(1).sub(min(glow, 1).mul(0.8).mul(uNight.oneMinus()))).add(uGlow.mul(glow).mul(mix(0.45, 1, uNight))).add(halo) // by day kept under ~1 in green and blue so the core stays gold through the tone curve
  })

  // Cumulus on a flat deck: banks placed by low noise, built of round puffs (Worley billows), each puff lit on its top
  // and on its sun side (density sampled a step that way: thinner there = lit), silver-edged near the sun, dissolving
  // into the haze low down. The deck curves (d.y + 0.28) so clouds near the horizon keep some height instead of streaking.
  const cloudField = p => mx_fractal_noise_float(vec3(p.mul(0.5), 1.7), 3, 2, 0.5).mul(1.3)
    .sub(mx_worley_noise_float(vec3(p.mul(2.4), 0.5)).mul(0.6)).add(mx_fractal_noise_float(vec3(p.mul(6), 3.1), 2, 2, 0.5).mul(0.12))
  const clouds = Fn(([d]) => {
    const q = d.xz.div(d.y.add(0.28)), p = q.mul(2.7).add(vec2(uTime.mul(0.006).add(3.7), uTime.mul(0.002))) // offset: the start view opens with the sun clear and a puff behind the isles
    const toLight = normalize(normalize(uSun.xz.add(1e-4)).mul(0.6).sub(normalize(q.add(1e-4))).add(1e-4)).mul(0.12) // toward the sun and up the screen, so puffs round the sun still get shaded bellies
    const low = smoothstep(0.10, 0.02, d.y).mul(0.3) // low down only the cores survive: small far puffs, never a veil
    const n = cloudField(p).sub(low), n2 = cloudField(p.add(toLight)).sub(low)
    const dens = smoothstep(uCover, uCover.add(0.08), n)
    const lit = smoothstep(-0.12, 0.12, n.sub(n2)).mul(smoothstep(0.5, 0.05, n.sub(uCover)).mul(0.45).add(0.55)) // thick cores sit in their own shade
    const rim = pow(max(dot(d, uSun), 0), 24).mul(dens.oneMinus()).mul(0.8)
    const col = mix(uCloudShade, uCloudLit, lit).add(uCloudLit.mul(rim))
    const clear = mix(float(1), smoothstep(0.9955, 0.98, max(dot(d, uSun), 0)), uNight.oneMinus()) // by day the sun burns a small gap, so its disc sits in gold sky, not behind a whitened puff
    return vec4(mix(col, uHorizon, exp(d.y.mul(-12)).mul(0.6)), dens.mul(smoothstep(0.03, 0.08, d.y)).mul(clear)) // clear haze band above the land
  })

  // Stars: one per lit cell of a 3-D grid on the sphere, twinkling; the Milky Way band crowds them and glows faintly.
  const h3 = c => fract(sin(vec3(dot(c, vec3(127.1, 311.7, 74.7)), dot(c, vec3(269.5, 183.3, 246.1)), dot(c, vec3(113.5, 271.9, 124.6)))).mul(43758.5453))
  const starLayer = (d, scale, prob, size) => {
    const p = d.mul(scale), h = h3(floor(p))
    const r = length(fract(p).sub(0.5).sub(h.sub(0.5).mul(0.6)))
    const tw = sin(uTime.mul(h.y.mul(3).add(1)).add(h.z.mul(40))).mul(0.3).add(0.7)
    return step(prob.oneMinus(), h.x).mul(smoothstep(size, 0, r)).mul(tw).mul(h.y.mul(h.y).mul(5).add(0.4))
  }
  const BAND = new THREE.Vector3(0.795, 0.19, 0.58).normalize() // the Milky Way crosses the night view upper right toward the zenith
  const stars = d => {
    const bd = dot(d, vec3(BAND.x, BAND.y, BAND.z)), band = exp(bd.mul(bd).mul(-28))
    const s = starLayer(d, 90, float(0.12), 0.2).mul(3).add(starLayer(d, 210, band.mul(0.3).add(0.18), 0.16).mul(1.4))
    const neb = band.mul(mx_fractal_noise_float(d.mul(6), 3, 2, 0.5).mul(0.5).add(0.5)).mul(vec3(0.12, 0.09, 0.22))
    return vec3(0.85, 0.9, 1).mul(s).add(neb)
  }

  // Aurora: a ribbon hanging across the sky ahead (night.png): its sharp lower hem bright green, fading upward through
  // violet, streaked by vertical rays, the hem sweeping down from the top of the view to the right and folding slowly.
  // Angular, so its width is fixed on screen: u = bearing from straight ahead (−Z), d.y = sin(elevation).
  const ribbon = (d, y0, amp, ph) => { // hem = y0 ± amp, highest at u = (π/2 − ph) / 3.5
    const u = atan(d.x, d.z.negate())
    const hem = sin(u.mul(3.5).add(ph).add(uTime.mul(0.02))).mul(amp).add(sin(u.mul(7).sub(uTime.mul(0.05)).add(ph)).mul(0.015)).add(y0)
    const dy = d.y.sub(hem)
    const rays = pow(sin(u.mul(140).add(sin(u.mul(17).add(uTime.mul(0.2))).mul(3)).add(uTime.mul(0.1))).mul(0.5).add(0.5), 3)
      .mul(sin(u.mul(330).sub(uTime.mul(0.3))).mul(0.3).add(0.7)).mul(0.75).add(0.25)
    const green = vec3(0.15, 1.0, 0.5).mul(smoothstep(-0.006, 0.004, dy)).mul(exp(dy.mul(-30)))
    const violet = vec3(0.55, 0.18, 1.0).mul(smoothstep(0.01, 0.05, dy)).mul(exp(dy.mul(-9))).mul(0.6)
    return green.add(violet).mul(rays).mul(smoothstep(1.4, 0.8, abs(u)))
  }

  const skyColor = Fn(([dir]) => {
    const d = dir.toVar() // evaluated here, not first inside the If below (it would stay unset when the If is skipped)
    const up = smoothstep(0, 0.14, d.y)
    // The sun's bright core lives in the sky only, cut by the horizon, so land in front of the sun hides it.
    const mu = max(dot(d, uSun), 0)
    const sunDisc = uDisc.mul(smoothstep(0.999925, 0.999955, mu)).add(uGlow.mul(pow(mu, 600).mul(0.8))).mul(smoothstep(-0.01, 0.03, d.y))
    const extra = vec3(0).toVar()
    If(uNight.greaterThan(0.01), () => {
      const moon = vec3(2.2, 2.15, 2.0).mul(smoothstep(0.99974, 0.99979, dot(d, uMoon))).mul(float(0.85).add(mx_fractal_noise_float(d.mul(900), 2, 2, 0.5).mul(0.25)))
      const aur = ribbon(d, 0.31, 0.09, 3.67).add(ribbon(d, 0.38, 0.05, 0.5).mul(0.3)).mul(1.3) // main hem sweeps down from top-left of view to the right
      extra.assign(stars(d).mul(uNight.mul(uNight)).add(aur.mul(uNight)).mul(up).add(moon.mul(uNight)))
    })
    const cl = clouds(d)
    return mix(haze(d).mul(aerial(d)).add(sunDisc).add(extra), cl.rgb, cl.a)
  })
  scene.backgroundNode = skyColor(normalize(normalWorldGeometry))

  // Aerial perspective, Phase 6: the world shows through. Thin air (scale height 200 m): ~40 % at 600 m, ~65 % at 1 km,
  // ~92 % at 2 km, finished by 2.9 km; plus a low haze (scale height 20 m) that softens the land near the ground — ~20 %
  // at 100 m — while the sky islands stay readable. Thicker at night.
  const uFogK = live(1)
  const toFrag = positionWorld.sub(cameraPosition), dist = length(toFrag), x = max(dist.sub(15), 0)
  const avgY = clamp(positionWorld.y.add(cameraPosition.y).mul(0.5), -40, 600)
  const air = x.mul(0.0008).add(x.mul(0.0005).pow(2)).mul(exp(avgY.mul(-1 / 200)))
  const ground = x.mul(0.002).mul(exp(max(avgY, 0).mul(-1 / 20)))
  // Sea mist along the north cliffs (PLAN: crest ~25 m by z ≈ −200, lip ≈ −222…−242). It pools at the lip up to 21 m and
  // thins fast above (8 m), so the crest dissolves into the sky behind it while the meadow stays clear and Castle Crestwatch
  // (−122, −390, on its own headland) rises out of it (with the air: base ~95 %, walls at 50 m ~60 %, towers at 70 m ~47 % by day).
  // Clear within 50 m of the eye.
  // From the air (ctx.aloft, written by field: 0 on foot … 1 on the dragon's back) the same mist is a thin veil lying in
  // banks along the coast, not a white wall over the whole north.
  const pw = positionWorld
  const bank = sin(pw.x.mul(0.011).add(sin(pw.z.mul(0.02)).mul(1.5))).mul(sin(pw.x.mul(0.023).sub(1.7))).mul(0.5).add(0.5)
  const lip = pw.z.add(225).div(60)
  const mist = exp(lip.mul(lip).negate()).mul(exp(max(pw.y.sub(21), 0).mul(-1 / 8))).mul(smoothstep(50, 200, dist)).mul(7)
    .mul(mix(float(1), bank.mul(0.1).add(0.02), uAloft))
  const thick = air.add(ground).mul(mix(float(1), 0.45, uAloft)).add(mist) // and clearer air up there: distance softens, never milks
  const fogF = max(float(1).sub(exp(thick.mul(uFogK).negate())), smoothstep(mix(2300, 1600, uAloft), mix(2900, 2500, uAloft), dist)) // whole by the far plane
  // A thin veil scatters a little more blue (strongly at night, faintly by day so the golden afternoon stays warm); as it thickens it whitens to the horizon itself, so the far land reads pale
  // and a fully hazed ridge is exactly the sky behind it.
  const fogDir = normalize(toFrag), veil = haze(fogDir).mul(mix(mix(vec3(0.96, 1.0, 1.08), vec3(0.83, 1.0, 1.32), uNight), vec3(1), fogF.mul(fogF)))
  // From the air the veil takes the aerial tint (see aerial); the mist keeps its own pale colour.
  scene.fogNode = fog(veil.mul(mix(vec3(1), aerial(fogDir), mist.div(thick.add(1e-4)).oneMinus())), fogF)
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
    ctx.night = ss(0.22, -0.12, s)
    uNight.value = ctx.night
    uTime.value = t
    uCover.value = pal.cover
    uFogK.value = 1 + 0.6 * ctx.night

    const sunUp = ss(-0.02, 0.06, s), moonUp = ss(-0.02, -0.14, s)
    uDisc.value.copy(pal.glow).multiplyScalar(25 * sunUp) // gold, so the capped bloom round it stays gold instead of ivory
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
