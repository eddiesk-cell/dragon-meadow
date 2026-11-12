// Lens: soft bloom, tone curve, gentle grade, vignette, grain. Contract: PLAN.md §Contract (lane "sky").
// Falls back to a plain render if the node graph fails to build or render.
import {
  Fn, pass, renderOutput, toneMapping, vec2, vec3, vec4, float, uniform, uv,
  mix, smoothstep, length, dot, sin, fract, clamp,
} from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'

export async function createPost({ THREE, renderer, scene, camera, fogColor }) {
  const plain = { render: () => renderer.render(scene, camera) }
  const uTime = uniform(0)
  const scenePass = pass(scene, camera)
  const color = scenePass.getTextureNode('output')
  // Bright sky only (horizon glow ~1.2+ linear): a soft veil, never a fog machine.
  const glow = bloom(color, 0.22, 0.6, 0.95)
  const toned = toneMapping(renderer.toneMapping, float(renderer.toneMappingExposure), color.add(glow))
  const haze = vec3(fogColor.r, fogColor.g, fogColor.b)

  const graded = Fn(() => {
    const c = toned.rgb.toVar()
    const lum = dot(c, vec3(0.2126, 0.7152, 0.0722))
    c.assign(mix(vec3(lum), c, 0.9))                         // a touch less saturated
    c.assign(mix(c, haze.mul(0.35).add(0.02), 0.06))         // lifted, milky blacks
    const d = length(uv().sub(0.5).mul(vec2(1.1, 1.0)))
    c.mulAssign(mix(float(1), smoothstep(0.85, 0.3, d), 0.32)) // mild vignette
    const n = fract(sin(dot(uv().mul(1024).add(uTime.mul(37.13)), vec2(127.1, 311.7))).mul(43758.5453))
    c.addAssign(n.sub(0.5).mul(0.025))                        // film grain
    return vec4(clamp(c, 0, 1), 1)
  })()

  const pipe = new THREE.RenderPipeline(renderer)
  pipe.outputColorTransform = false
  pipe.outputNode = renderOutput(graded, THREE.NoToneMapping, THREE.SRGBColorSpace)

  let failed = false
  window.__probes.post = () => ({ pipeline: !failed })
  return {
    render() {
      if (failed) return plain.render()
      uTime.value = performance.now() / 1000
      try { pipe.render() } catch (e) {
        failed = true
        window.__errors.push(`post: ${e.message} (fell back to plain render)`)
        plain.render()
      }
    },
  }
}
