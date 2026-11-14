// Lens: sun shafts, bloom, tone curve, grade, vignette, grain. Contract: PLAN.md §Contract + Phase 6 "Lane sky6".
// Live with the day: bloom only catches the sun and bright cloud by day, and only glowing things at night.
// Falls back to a plain render if the node graph fails to build or render.
import {
  Fn, If, Loop, pass, renderOutput, toneMapping, vec2, vec3, vec4, float, uniform, uv,
  mix, smoothstep, length, dot, sin, fract, clamp, exp, min, max,
} from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js'

const SHAFT_STEPS = 28

export async function createPost(ctx) {
  const { THREE, renderer, scene, camera } = ctx
  const plain = { render: () => renderer.render(scene, camera) }
  const uTime = uniform(0), uNight = uniform(0)
  const uSunUV = uniform(new THREE.Vector3()) // xy: the sun on screen (uv), z: shaft strength (0 when it is down or behind)
  const scenePass = pass(scene, camera)
  const color = scenePass.getTextureNode('output')
  // The bloom sees the frame capped at 3 (hue kept): the 40× sun disc would otherwise smear a white veil over half the sky.
  const glow = bloom(color.mul(min(float(1), float(3).div(max(color.r, max(color.g, color.b)).add(1e-4)))), 0.2, 0.6, 1.1)
  const grain = fract(sin(dot(uv().mul(1024).add(uTime.mul(37.13)), vec2(127.1, 311.7))).mul(43758.5453))

  // Sun shafts: march from each pixel toward the sun, gathering only the sun's own bright sky, so anything in front
  // of it (a canopy, a castle, the dragon) leaves dark gaps that streak outward. Dithered by the grain.
  const shafts = Fn(() => {
    const acc = vec3(0).toVar()
    If(uSunUV.z.greaterThan(0.001), () => {
      const delta = uv().sub(uSunUV.xy).mul(0.85 / SHAFT_STEPS)
      const p = uv().sub(delta.mul(grain)).toVar(), w = float(1).toVar()
      Loop(SHAFT_STEPS, () => {
        const c = color.sample(p).rgb
        const near = exp(length(p.sub(uSunUV.xy).mul(vec2(1.6, 1))).mul(-10)) // tight: rays, not a veil over open sky
        acc.addAssign(c.mul(smoothstep(1.3, 4, dot(c, vec3(0.2126, 0.7152, 0.0722)))).mul(w.mul(near)))
        w.mulAssign(0.95)
        p.subAssign(delta)
      })
      acc.mulAssign(uSunUV.z.div(SHAFT_STEPS))
    })
    return acc
  })()

  const toned = toneMapping(renderer.toneMapping, float(renderer.toneMappingExposure), color.add(glow).add(shafts))
  // Soft look (Eddie 2026-11-14: "the world is too crisp ... blend it a bit to make it soft"): a diffusion filter, as on a
  // film lens. A blurred copy of the finished frame is mixed in (takes the edge off blades, facets and silhouettes) and
  // screened on top (a gentle glow round light things). ?soft=0 is the old crisp frame, 1.5 the default (Eddie: between middle and softest), 2 dreamy.
  const soft = Math.max(0, +(ctx.params.get('soft') ?? 1.5))
  const haze = soft ? gaussianBlur(toned, null, 5, { resolutionScale: 0.5 }) : null
  const graded = Fn(() => {
    const c = toned.rgb.toVar()
    if (haze) {
      c.assign(mix(c, haze.rgb, Math.min(0.6, 0.28 * soft)))
      c.addAssign(haze.rgb.mul(float(1).sub(c)).mul(Math.min(0.5, 0.16 * soft)))
    }
    const lum = dot(c, vec3(0.2126, 0.7152, 0.0722))
    c.assign(mix(vec3(lum), c, mix(1.12, 1.18, uNight)))                               // a little richer
    c.mulAssign(mix(vec3(1.02, 1.0, 0.97), vec3(0.94, 1.0, 1.08), uNight))           // warm day, cool night
    c.addAssign(vec3(0.008, 0.01, 0.03).mul(uNight))                                   // night blacks lift to indigo
    const d = length(uv().sub(0.5).mul(vec2(1.1, 1.0)))
    c.mulAssign(mix(float(1), smoothstep(0.85, 0.3, d), mix(0.22, 0.4, uNight)))     // vignette
    c.addAssign(grain.sub(0.5).mul(0.02))                                              // film grain
    return vec4(clamp(c, 0, 1), 1)
  })()

  const pipe = new THREE.RenderPipeline(renderer)
  pipe.outputColorTransform = false
  pipe.outputNode = renderOutput(graded, THREE.NoToneMapping, THREE.SRGBColorSpace)

  const v = new THREE.Vector3(), fwd = new THREE.Vector3()
  function track() {
    const n = ctx.night
    uNight.value = n
    glow.threshold.value = 1.1 - 0.75 * n
    glow.strength.value = 0.2 + 0.35 * n
    glow.radius.value = 0.6 + 0.15 * n
    // The sun on screen; shafts fade as it sinks, leaves the frame or goes behind the camera.
    v.copy(ctx.sunDir).multiplyScalar(1000).add(camera.position).project(camera)
    camera.getWorldDirection(fwd)
    const onScreen = Math.max(0, 1 - Math.max(Math.abs(v.x), Math.abs(v.y)) / 1.6)
    const up = Math.min(1, Math.max(0, ctx.sunDir.y / 0.06))
    uSunUV.value.set(v.x * 0.5 + 0.5, 0.5 - v.y * 0.5, fwd.dot(ctx.sunDir) > 0 ? 0.35 * onScreen * up * (1 - n) : 0)
  }

  let failed = false, frames = [], fps = 0
  window.__probes.post = () => ({ pipeline: !failed, fps, bloomThreshold: +glow.threshold.value.toFixed(2), shafts: +uSunUV.value.z.toFixed(2), sunPx: [Math.round(uSunUV.value.x * innerWidth), Math.round(uSunUV.value.y * innerHeight)] })
  return {
    render() {
      if (failed) return plain.render()
      const now = performance.now()
      uTime.value = now / 1000
      frames.push(now); while (now - frames[0] > 2000) frames.shift()
      fps = Math.round(frames.length / 2) // frames the page itself drew over the last 2 s
      try { track(); pipe.render() } catch (e) {
        failed = true
        window.__errors.push(`post: ${e.message} (fell back to plain render)`)
        plain.render()
      }
    },
  }
}
