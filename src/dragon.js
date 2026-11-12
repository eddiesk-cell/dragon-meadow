// Lane dragon: winter dragon flying a banked figure-eight (or ?dragon=near circle) over the meadow.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export async function createDragon(ctx) {
  const { THREE, scene, params } = ctx
  const near = params.get('dragon') === 'near'
  const gltf = await new GLTFLoader().loadAsync('/models/dragon.glb')
  const model = gltf.scene
  const holder = new THREE.Group() // holder carries path pose; model carries scale
  model.scale.setScalar(3) // ~7 m shipped span -> ~18 m
  model.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true } })
  holder.add(model)
  scene.add(holder)

  const mixer = new THREE.AnimationMixer(model)
  const clips = Object.fromEntries(gltf.animations.map(c => [c.name, c]))
  let clip = 'fly'
  mixer.clipAction(clips.fly).play()

  // Path: figure-eight R=75 ahead of start; near mode: R=6 circle ~16 m ahead; the proof camera is aimed at it in front.
  const pos = (t, out) => {
    if (near) {
      const u = 0.95 * t + 1.0
      out.set(6 * Math.sin(u), 0, -16 + 6 * Math.cos(u))
      out.y = ctx.heightAt(out.x, out.z) + 16
    } else {
      const u = 0.11 * t
      out.set(75 * Math.sin(u), 0, -110 + 90 * Math.sin(u) * Math.cos(u))
      out.y = ctx.heightAt(out.x, out.z) + 32 + 8 * Math.sin(0.7 * u)
    }
    return out
  }
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), v0 = new THREE.Vector3(), v1 = new THREE.Vector3()
  const x = new THREE.Vector3(), y = new THREE.Vector3(), z = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0)
  const m = new THREE.Matrix4(), qT = new THREE.Quaternion()
  let roll = 0, speed = 0, alt = 0, t = 0

  const update = dt => {
    t += dt
    const e = 0.2
    pos(t, p0); pos(t + e, p1)
    v1.subVectors(p1, p0).divideScalar(e)
    pos(t - e, p1); v0.subVectors(p0, p1).divideScalar(e)
    speed = v1.length()
    const turn = (v0.x * v1.z - v0.z * v1.x) / (v0.length() * v1.length() + 1e-6) / e // signed rad/s
    roll += (THREE.MathUtils.clamp(turn * 2.2, -0.6, 0.6) - roll) * Math.min(1, dt * 2)
    z.copy(v1).normalize()
    x.crossVectors(up, z).normalize()
    y.crossVectors(z, x)
    // bank: rotate up/right about forward; positive turn (CCW from above) lifts the left side -> negative roll about +Z
    x.applyAxisAngle(z, roll); y.applyAxisAngle(z, roll)
    m.makeBasis(x, y, z)
    holder.position.copy(p0)
    holder.quaternion.setFromRotationMatrix(m)
    mixer.update(dt)
    if (near) ctx.camera.lookAt(p0) // proof mode only: hero camera is level, a 16 m-high dragon would sit out of frame
    alt = p0.y - ctx.heightAt(p0.x, p0.z)
  }
  update(0.016)
  window.__probes.dragon = () => ({ clip, alt, speed, x: holder.position.x, z: holder.position.z })
  return { update }
}
