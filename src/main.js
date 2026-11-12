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
  sunDir: new THREE.Vector3(-0.45, 0.42, -0.78).normalize(), // writer: sky (live, follows ctx.tod) — direction TO the sun
  fogColor: new THREE.Color(0xd9dcdf),                       // writer: sky (live) — field, sky and post all match it
  tod: 0.35,                                                 // writer: sky — time of day 0..1 (0.25 sunrise, 0.5 noon, 0.75 sunset)
  night: 0,                                                  // writer: sky — 0 day … 1 full night: how much the plants glow
  keepClear: [],                                             // append-only {x, z, r}: ring, landmarks, settlements, water push; flora skips
  time: 0,                                                   // writer: main
  timeScale: 1,                                              // writer: vfx (hitstop); main scales every dt by it
}
window.__ctx = ctx

const systems = []
async function load(name, fn) {
  try {
    const sys = await (await import(`./${name}.js`))[fn](ctx)
    if (sys) systems.push(sys)
  } catch (e) { fail(name, e) }
}
// Order matters: field publishes heightAt and ring carves its bowl into it before anything stands on it; sky sets
// lights + fog; springs hang off the hero's bones; vfx before the fighters that call it; pet follows heroPos; dragon last.
await load('field', 'createField')
await load('ring', 'createRing')
await load('landmarks', 'createLandmarks')     // rock island, stone face
await load('settlements', 'createSettlements') // towns, castles, the city
await load('water', 'createWater')
await load('flora', 'createFlora')             // after everything that pushes ctx.keepClear
await load('skyisles', 'createSkyisles')
await load('sky', 'createSky')
await load('hero', 'createHero')
await load('springs', 'createSprings') // cloth on the hero: needs ctx.heroRig
await load('vfx', 'createVfx')
await load('monster', 'createMonster')
await load('combat', 'createCombat')
await load('pet', 'createPet')
await load('dragon', 'createDragon')
await load('birds', 'createBirds')
await load('motes', 'createMotes')
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
  const dt = Math.min((now - last) / 1000, 0.1) * ctx.timeScale
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
