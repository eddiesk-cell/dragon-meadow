// Hero lane: the Drifter, third-person camera, WASD/Shift/Space, ?auto=walk|run for proof.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export async function createHero(ctx) {
  const { THREE, scene, camera, params, heroPos } = ctx
  const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/hero.glb')
  const model = gltf.scene
  model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false } })
  const root = new THREE.Group()
  root.add(model)
  scene.add(root)

  const mixer = new THREE.AnimationMixer(model)
  const actions = {}
  for (const c of gltf.animations) actions[c.name.toLowerCase()] = mixer.clipAction(c)
  let clip = '', cur = null
  const play = name => {
    const a = actions[name.toLowerCase()]
    if (!a || name === clip) return
    a.reset().fadeIn(0.25).play()
    cur?.fadeOut(0.25)
    cur = a; clip = name
    if (name === 'Jump') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true }
  }

  // Input flags; ?auto= sets the same ones the keys do.
  const keys = new Set()
  const auto = params.get('auto')
  if (auto) { keys.add('w'); if (auto === 'run') keys.add('shift') }
  addEventListener('keydown', e => { keys.add(e.key.toLowerCase()); if (e.key === ' ') e.preventDefault() })
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()))
  addEventListener('blur', () => keys.clear())

  // Orbit: drag the mouse/finger. Camera starts behind the hero (hero faces -Z).
  let yaw = 0, pitch = 0.10, dragging = false
  const el = ctx.renderer.domElement
  el.addEventListener('pointerdown', e => { dragging = true; el.setPointerCapture(e.pointerId) })
  el.addEventListener('pointerup', () => (dragging = false))
  el.addEventListener('pointermove', e => {
    if (!dragging) return
    yaw -= e.movementX * 0.005
    pitch = THREE.MathUtils.clamp(pitch + e.movementY * 0.005, -0.15, 1.2)
  })

  const pos = heroPos.set(0, ctx.heightAt(0, 0), 0)
  let vy = 0, grounded = true, face = Math.PI, jumpT = 0
  const camTarget = new THREE.Vector3(), camGoal = new THREE.Vector3()
  const DIST = 4.5

  const dirOf = () => {
    const f = (keys.has('w') || keys.has('arrowup')) - (keys.has('s') || keys.has('arrowdown'))
    const r = (keys.has('d') || keys.has('arrowright')) - (keys.has('a') || keys.has('arrowleft'))
    // forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw)
    return [-Math.sin(yaw) * f + Math.cos(yaw) * r, -Math.cos(yaw) * f - Math.sin(yaw) * r]
  }

  window.__probes.hero = () => ({ clip, x: +pos.x.toFixed(2), z: +pos.z.toFixed(2), feetGap: +(pos.y - ctx.heightAt(pos.x, pos.z)).toFixed(3) })

  return {
    update(dt) {
      const [dx, dz] = dirOf()
      const len = Math.hypot(dx, dz), moving = len > 0.01
      const speed = keys.has('shift') ? 5 : 1.6
      if (moving) {
        pos.x += (dx / len) * speed * dt
        pos.z += (dz / len) * speed * dt
        let d = Math.atan2(dx, dz) - face
        d = Math.atan2(Math.sin(d), Math.cos(d))
        face += d * Math.min(1, dt * 10)
      }
      if (keys.has(' ') && grounded) { vy = 5; grounded = false; jumpT = 0.9 }
      const gy = ctx.heightAt(pos.x, pos.z)
      if (!grounded) {
        vy -= 14 * dt; pos.y += vy * dt; jumpT -= dt
        if (pos.y <= gy && vy < 0) { pos.y = gy; grounded = true; vy = 0 }
      } else pos.y = gy

      play(!grounded && actions.jump ? 'Jump' : !moving ? 'Idle' : keys.has('shift') ? 'Run' : 'Walk')
      mixer.update(dt)
      root.position.copy(pos)
      root.rotation.y = face

      // Camera: orbit target at chest height, never under the ground.
      camTarget.set(pos.x, pos.y + 1.5, pos.z)
      const cp = Math.cos(pitch)
      camGoal.set(camTarget.x + Math.sin(yaw) * cp * DIST, camTarget.y + Math.sin(pitch) * DIST, camTarget.z + Math.cos(yaw) * cp * DIST)
      camGoal.y = Math.max(camGoal.y, ctx.heightAt(camGoal.x, camGoal.z) + 0.4)
      camera.position.lerp(camGoal, 1 - Math.exp(-dt * 12))
      camera.lookAt(camTarget.x, camTarget.y + 0.3, camTarget.z)
    },
  }
}
