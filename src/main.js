// Dragon Meadow — the frame every lane plugs into. Contract: PLAN.md §Contract.
import * as THREE from 'three/webgpu'

const params = new URLSearchParams(location.search)
window.__errors = []
window.__probes = {} // each lane adds window.__probes.<lane> = () => ({...facts}); tools/shot.mjs prints them
const fail = (where, e) => { console.error(`[${where}]`, e); window.__errors.push(`${where}: ${e?.message || e}`) }

const renderer = new THREE.WebGPURenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.prepend(renderer.domElement)
await renderer.init()

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 3000)
camera.position.set(0, 2.2, 6)

// Shared state. Each field names its single writer; everyone else only reads.
const ctx = {
  THREE, renderer, scene, camera, params,
  heroPos: new THREE.Vector3(),                              // writer: hero.js, every frame
  heightAt: () => 0,                                         // writer: field.js (replaces this at create)
  sunDir: new THREE.Vector3(-0.45, 0.42, -0.78).normalize(), // writer: main (fixed) — sun low, ahead of the hero: backlit grass
  fogColor: new THREE.Color(0xd9dcdf),                       // writer: main (fixed) — field, sky and post all match it
  time: 0,                                                   // writer: main
}
window.__ctx = ctx

const systems = []
async function load(name, fn) {
  try {
    const sys = await (await import(`./${name}.js`))[fn](ctx)
    if (sys) systems.push(sys)
  } catch (e) { fail(name, e) }
}
// Order matters: field publishes heightAt, sky sets lights + fog, hero stands on heightAt, pet follows heroPos, dragon last.
await load('field', 'createField')
await load('sky', 'createSky')
await load('hero', 'createHero')
await load('pet', 'createPet')
await load('dragon', 'createDragon')
let post = null
try { post = await (await import('./post.js')).createPost(ctx) } catch (e) { fail('post', e) }

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

let last = performance.now(), frames = 0
renderer.setAnimationLoop(() => {
  const now = performance.now()
  const dt = Math.min((now - last) / 1000, 0.1)
  last = now
  ctx.time += dt
  for (const s of systems) {
    try { s.update?.(dt, ctx.time) } catch (e) { fail('update', e); s.update = null }
  }
  if (post) post.render()
  else renderer.render(scene, camera)
  if (++frames === 12) {
    window.__ready = true
    document.getElementById('load').style.opacity = 0
    setTimeout(() => (document.getElementById('hint')?.style.setProperty('opacity', 0)), 9000)
  }
})
