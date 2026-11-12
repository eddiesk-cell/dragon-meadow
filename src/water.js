// Lane water (water2) — the still pond at the rock island's foot (PLAN.md Phase 6): a planar mirror with soft ripples,
// and post lanterns on its shore whose light it doubles. Publishes ctx.pond, pushes ctx.keepClear.
//
// The pond is the meadow's own hollow filled to LEVEL: the water is the low ground connected to the hollow's deepest
// point, so its shore is the terrain's contour, never a painted edge. One ground patch (ctx.addGroundPatch) deepens the
// bed toward BED m, takes the grass out from under the water and darkens a damp bank; the water is a plain depth-tested
// surface that lets the shallows show through. ctx.heightAt gets a wading floor: the hero sinks WADE m at most.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  reflector, texture, uniform, vec2, vec3, vec4, float, positionWorld, positionView, cameraPosition, cameraWorldMatrix,
  cameraNear, cameraFar, viewportDepthTexture, perspectiveDepthToViewZ, mx_noise_float, normalize, length, mix, max,
  smoothstep, pow, exp, viewportSharedTexture, getScreenPosition, cameraViewMatrix, cameraProjectionMatrix,
} from 'three/tsl'

// C, S: the patch square over the hollow below the rock island (field.js's ground dips to −1.9 m round (20, −60)).
const C = { x: 20, z: -52 }, S = 124, LEVEL = -0.5, BED = 1.2, WADE = 0.45
const ss = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k) }

export async function createWater(ctx) {
  const { THREE, scene } = ctx
  if (ctx.params.get('water') === '0') return null // A/B for fps and look
  const P = ctx.addGroundPatch(C.x - S / 2, C.z - S / 2, S), N = P.size, NN = N * N, cell = S / N, x0 = C.x - S / 2, z0 = C.z - S / 2
  const X = o => x0 + (o % N + 0.5) * cell, Z = o => z0 + (Math.floor(o / N) + 0.5) * cell

  // --- the water: flood the low ground (below LEVEL) from the hollow's deepest point near C
  const h = new Float32Array(NN)
  let seed = -1
  for (let o = 0; o < NN; o++) {
    h[o] = ctx.heightAt(X(o), Z(o))
    if (Math.hypot(X(o) - C.x, Z(o) - C.z) < 30 && (seed < 0 || h[o] < h[seed])) seed = o
  }
  const wet = new Uint8Array(NN), q = [seed]
  let edge = false // true if the flood reached the patch border (a cut shore): move C or grow S
  wet[seed] = 1
  while (q.length) {
    const o = q.pop(), i = o % N
    if (i === 0 || i === N - 1 || o < N || o >= NN - N) edge = true
    for (const k of [i ? o - 1 : -1, i < N - 1 ? o + 1 : -1, o - N, o + N]) if (k >= 0 && k < NN && !wet[k] && h[k] < LEVEL) wet[k] = 1, q.push(k)
  }
  // signed metres to the shore (> 0 in the water): two-pass chamfer distance on each side
  const chamfer = side => {
    const d = Float32Array.from(wet, w => w === side ? 1e9 : 0)
    for (const s of [1, -1]) for (let o = s > 0 ? 0 : NN - 1; o >= 0 && o < NN; o += s) {
      const i = o % N
      for (const [di, dj, w] of [[-1, 0, 1], [0, -1, 1], [-1, -1, 1.414], [1, -1, 1.414]]) {
        const ii = i + di * s, k = o + (di + dj * N) * s
        if (ii >= 0 && ii < N && k >= 0 && k < NN) d[o] = Math.min(d[o], d[k] + w)
      }
    }
    return d
  }
  const din = chamfer(1), dout = chamfer(0), e = new Float32Array(NN)
  for (let o = 0; o < NN; o++) e[o] = (wet[o] ? din[o] - 0.5 : 0.5 - dout[o]) * cell

  // --- the carve: the shallows keep the meadow's own gentle slope (so the shoreline is its smooth contour, not the
  // terrain mesh's 2 m triangles), then the bed falls away to BED m; no grass under water; a dark damp bank
  const put = THREE.DataUtils.toHalfFloat, pd = P.tex.image.data
  let area = 0
  for (let o = 0; o < NN; o++) {
    const n = LEVEL - h[o], out = -e[o], k = o * 4
    if (wet[o]) area += cell * cell
    pd[k] = put(wet[o] ? Math.min(0, n - BED * ss(0.4, 7, e[o])) : 0)
    pd[k + 1] = put(wet[o] ? 0 : ss(0.2, 1.6, out))
    pd[k + 2] = put(0)
    pd[k + 3] = put(wet[o] ? 0.45 : 0.7 + 0.3 * ss(0, 2.5, out))
  }
  P.tex.needsUpdate = true

  const inside = (x, z) => { // metres inside the shore (< 0 on land), bilinear
    const u = (x - x0) / cell - 0.5, v = (z - z0) / cell - 0.5
    if (!(u >= 0 && v >= 0 && u <= N - 1 && v <= N - 1)) return -S
    const i = Math.min(N - 2, u | 0), j = Math.min(N - 2, v | 0), fu = u - i, fv = v - j, o = j * N + i
    return (e[o] * (1 - fu) + e[o + 1] * fu) * (1 - fv) + (e[o + N] * (1 - fu) + e[o + N + 1] * fu) * fv
  }
  const ground = ctx.heightAt // includes the carve (field reads the patch live)
  ctx.heightAt = (x, z) => { const g = ground(x, z); return inside(x, z) > 0 ? Math.max(g, LEVEL - WADE) : g }

  // keepClear: the biggest circles that fit in the water, largest first (flora also asks ctx.pond.inside)
  const circles = []
  for (let t = 0; t < 6; t++) {
    let best = -1, br = 3
    for (let o = 0; o < NN; o++) if (e[o] > br && !circles.some(c => Math.hypot(X(o) - c.x, Z(o) - c.z) < c.r)) best = o, br = e[o]
    if (best < 0) break
    circles.push({ x: X(best), z: Z(best), r: br })
  }
  const deep = circles[0] || { x: C.x, z: C.z }

  // the shader's map: (metres inside the shore, ground height)
  const md = new Uint16Array(NN * 4)
  for (let o = 0; o < NN; o++) md[o * 4] = put(e[o]), md[o * 4 + 1] = put(h[o])
  const map = new THREE.DataTexture(md, N, N, THREE.RGBAFormat, THREE.HalfFloatType)
  map.magFilter = map.minFilter = THREE.LinearFilter
  map.needsUpdate = true

  // --- the surface
  const uTime = uniform(0), uSky = uniform(new THREE.Color()), uNight = uniform(0)
  const pond = xz => texture(map, xz.sub(vec2(x0, z0)).div(S)).level(0), wp = positionWorld.xz
  const ripple = vec2( // slow, faint: the pond is a mirror that breathes
    mx_noise_float(vec3(wp.mul(0.45), uTime.mul(0.35))), mx_noise_float(vec3(wp.mul(0.45).add(31.7), uTime.mul(0.35))),
  ).add(vec2(mx_noise_float(vec3(wp.mul(1.6), uTime.mul(0.9))), mx_noise_float(vec3(wp.mul(1.6).add(7.3), uTime.mul(0.9)))).mul(0.4))
  const toCam = cameraPosition.sub(positionWorld), dist = length(toCam)
  // Same samples and depth attachment as post.js's scene pass, so the mirror pass reuses its render pipelines instead of
  // compiling a second set for everything it sees (that compile stalled the page for seconds after load).
  const mirror = reflector({ resolutionScale: 0.5, samples: ctx.renderer.samples, depth: true })
  mirror.target.rotateX(-Math.PI / 2)
  mirror.target.position.set(deep.x, LEVEL, deep.z)
  scene.add(mirror.target)
  mirror.uvNode = mirror.uvNode.add(ripple.mul(float(0.006).mul(float(12).div(max(dist, 12)))))
  const cosV = normalize(toCam).y.add(ripple.x.mul(0.03)).clamp(0, 1)
  const R = mix(float(0.62), float(1), float(0.02).add(pow(float(1).sub(cosV), 5).mul(0.98))) // stylised: a strong mirror even looking down
  // What is under this water pixel (the bed, a wading leg): light from it comes back up through the water, less the
  // further it travels in it, so shallows and the shore show through and the deep reads as dark water.
  const sceneZ = perspectiveDepthToViewZ(viewportDepthTexture(), cameraNear, cameraFar)
  const under = cameraWorldMatrix.mul(vec4(positionView.xyz.mul(sceneZ.div(positionView.z)), 1)).xyz
  const T = exp(length(under.sub(positionWorld)).mul(-2.5))
  const body = vec3(0.012, 0.045, 0.04).mul(uSky.mul(1.4))
  const alpha = float(1).sub(float(1).sub(R).mul(T))
  // The mirror leaves out the grass (below), so a reflected ray that would end in the far bank's grass sees sky instead,
  // a bright seam at the waterline: march it over the map, and where it leaves the water below the grass tops, show the
  // bank as it is on screen (blurred grass colour, never upside-down blades).
  const r = normalize(positionWorld.sub(cameraPosition)).mul(vec3(1, -1, 1))
  let hitAt = vec3(0), found = float(0)
  for (const t of [1, 2.5, 4.5, 7, 10, 14, 19, 26]) {
    const p = positionWorld.add(r.mul(t)), g = pond(p.xz)
    // soft at the shore and at the grass tops, so the band's edge never steps with the march
    const hit = smoothstep(-0.5, 0.5, g.x.negate()).mul(smoothstep(0, 0.35, g.y.add(0.9).sub(p.y))).mul(float(1).sub(found))
    hitAt = hitAt.add(vec3(p.x, max(p.y, g.y.add(0.3)), p.z).mul(hit))
    found = found.add(hit)
  }
  hitAt = hitAt.div(max(found, 1e-3))
  const turf = viewportSharedTexture(getScreenPosition(cameraViewMatrix.mul(vec4(hitAt, 1)).xyz, cameraProjectionMatrix).clamp(0, 1)).rgb
  const seen = mix(mirror.rgb, turf.mul(0.7), found).mul(vec3(0.82, 0.9, 0.88))
  // fog off: the mirror image already carries the haze of the whole path, eye → water → object
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, fog: false })
  m.colorNode = seen.mul(R).add(body.mul(float(1).sub(T)).mul(float(1).sub(R))).div(alpha)
  m.opacityNode = alpha.mul(smoothstep(0, 0.05, float(LEVEL).sub(under.y))).mul(smoothstep(-0.3, 0.3, pond(wp).x))
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(S, S).rotateX(-Math.PI / 2), m)
  surface.position.set(C.x, LEVEL, C.z)
  surface.renderOrder = -1 // first among the see-through things, so motes, fur and effects still draw over it
  scene.add(surface)

  // The mirror leaves out the grass (none stands in the water; the bank's would read as upside-down blades) — and the
  // mirror pass is cheaper for it.
  const grass = [ctx.grass?.blades, ctx.grass?.flowers].filter(Boolean)
  const base = mirror.reflector, render = base.updateBefore
  base.updateBefore = frame => {
    for (const g of grass) g.visible = false
    try { return render.call(base, frame) } finally { for (const g of grass) g.visible = true }
  }

  // --- lanterns on the shore (town-kit piece; its glass carries the glow), lit by ctx.night
  const glass = new THREE.MeshStandardNodeMaterial({ color: 0xffe2b0, roughness: 0.3 })
  glass.emissiveNode = vec3(1, 0.6, 0.24).mul(uNight.mul(9).add(1.4))
  const kit = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/world/town-kit.glb')
  const proto = kit.scene.getObjectByName('lantern')
  const lanterns = []
  for (const a of [1.05, 1.57, 2.62, 3.4, 3.67, 5.9, 6.02]) { // world bearings from the deepest water: near shore (none on the walk north from the start), far ends
    let r = 0
    while (inside(deep.x + Math.cos(a) * r, deep.z + Math.sin(a) * r) > 0) r += 0.25
    const x = deep.x + Math.cos(a) * (r + 2.5), z = deep.z + Math.sin(a) * (r + 2.5)
    if (ctx.keepClear.some(c => Math.hypot(x - c.x, z - c.z) < c.r)) continue // not in the island's apron, the egg, a house
    const l = proto.clone()
    l.traverse(o => { if (o.isMesh) { o.castShadow = true; if (o.material.name === 'window') o.material = glass } })
    l.position.set(x, ctx.heightAt(x, z) + 0.3, z)
    l.rotation.y = a
    scene.add(l)
    lanterns.push(l)
  }

  for (const c of circles) ctx.keepClear.push({ x: c.x, z: c.z, r: c.r + 2 })
  ctx.pond = { x: deep.x, z: deep.z, level: LEVEL, inside } // inside(x, z) > 0: water there
  let wade = 0, frames = 0, lastNow = 0, hitch = 0 // wade: deepest the hero's feet have been under the surface
  const r1 = v => Math.round(v * 10) / 10
  window.__probes.water = () => ({ level: LEVEL, area: Math.round(area), edge, lanterns: lanterns.map(l => [r1(l.position.x), r1(l.position.z)]), circles: circles.length,
    deep: [r1(deep.x), r1(deep.z)], wade: Math.round(wade * 100) / 100, hitchMs: Math.round(hitch), heroIn: r1(inside(ctx.heroPos.x, ctx.heroPos.z)) })

  return {
    update(dt, t) {
      const now = performance.now()
      if (++frames > 30) hitch = Math.max(hitch, now - lastNow) // after load: does the mirror ever stall the page?
      lastNow = now
      uTime.value = t
      uSky.value.copy(ctx.fogColor)
      uNight.value = ctx.night
      if (inside(ctx.heroPos.x, ctx.heroPos.z) > 0) wade = Math.max(wade, LEVEL - ctx.heroPos.y)
    },
  }
}
