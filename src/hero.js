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

  // Sword in its scabbard across the back: mouth behind the right shoulder, tip at the left hip.
  // Strapped at two points like a real baldric (mouth rides upperChest, tip rides hips) and re-aimed every
  // frame, so a chest that leans forward in a clip cannot swing the tip off his back; contact keeps it on the skin.
  // ctx.heroRig is what the combat lane uses to draw the sword (re-attach `sword` to rightHand).
  // A missing prop is logged and the hero carries on without it.
  const P = new THREE.Vector3(), Q = new THREE.Vector3(), F = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3()
  const X = new THREE.Vector3(), v = new THREE.Vector3(), M = new THREE.Matrix4()
  const LEN = 1.075, FACE = -0.012 // scabbard length; strapped tight, its body (±0.016) may sink ~2.5 cm into the soft vest where it rests, outer face stays out — own units
  const orient = sheath => {      // mouth P → tip Q, flat side toward his front F
    Y.subVectors(P, Q).normalize(); Z.subVectors(F, P); Z.addScaledVector(Y, -Z.dot(Y)).normalize()
    sheath.quaternion.setFromRotationMatrix(M.makeBasis(X.crossVectors(Y, Z), Y, Z)); sheath.position.copy(P); sheath.updateMatrixWorld()
  }
  // The anchors sit a little INSIDE him and the skin under the scabbard pushes each end out until it rests on
  // the surface: on the shoulder blades when they swing out in the run, in against the hip when he stands.
  const aim = (s, dt) => {
    s.top.getWorldPosition(P); s.end.getWorldPosition(Q); s.fwd.getWorldPosition(F); orient(s.sheath)
    let k = 0
    for (const i of s.skin) {
      s.body.getVertexPosition(i, v).applyMatrix4(s.body.matrixWorld); s.sheath.worldToLocal(v)
      if (Math.abs(v.x) < 0.06 && v.y < 0 && v.y > -LEN && v.z < FACE) { s.tn[k++] = -v.y / LEN; s.tn[k++] = FACE - v.z }
    }
    let top = 0, tip = 0
    for (let pass = 0; pass < 2; pass++) for (let j = 0; j < k; j += 2) { // lift each end so every point along it clears
      const t = s.tn[j], n = s.tn[j + 1]
      if (t < 0.5) top = Math.max(top, (n - t * tip) / (1 - t)); else tip = Math.max(tip, (n - (1 - t) * top) / t)
    }
    s.lift[0] = Math.max(Math.min(top, 0.15), s.lift[0] - dt) // out at once, settles back within a step
    s.lift[1] = Math.max(Math.min(tip, 0.15), s.lift[1] - dt)
    const sc = s.sheath.scale.z
    P.addScaledVector(Z, -s.lift[0] * sc); F.addScaledVector(Z, -s.lift[0] * sc); Q.addScaledVector(Z, -s.lift[1] * sc); orient(s.sheath)
  }
  let strap = null
  try {
    const [swordGltf, sheathGltf] = await Promise.all(['sword', 'scabbard'].map(n => new GLTFLoader().loadAsync(import.meta.env.BASE_URL + `models/${n}.glb`)))
    const sword = swordGltf.scene, sheath = new THREE.Group()
    sheath.add(sheathGltf.scene, sword)
    sword.rotation.z = Math.PI                    // blade down into the scabbard
    sword.position.y = 0.11                       // guard sits just on the mouth
    sheath.traverse(o => { if (o.isMesh) o.castShadow = true })
    sheath.scale.setScalar(0.9)                   // as drawn in art/hero/hero-front-v1.png: pommel above his head, tip mid-thigh
    // Anchors in the model's rest (T-pose) frame: front = +Z, his right = -X; scabbard 0.95 m, tilted 0.55 rad.
    // Both a few cm inside his back (z ≈ -0.18 at the shoulder blades) so contact, not a guess, sets the gap.
    const mouth = new THREE.Vector3(-0.20, 1.50, -0.17)
    const tip = mouth.clone().addScaledVector(new THREE.Vector3(Math.sin(0.55), -Math.cos(0.55), 0.074), 0.95)
    const pin = (p, bone) => { const o = new THREE.Object3D(); o.position.copy(p); model.add(o); model.updateMatrixWorld(true); bone.attach(o); return o }
    const chest = model.getObjectByName('upperChest') || model.getObjectByName('chest'), hips = model.getObjectByName('hips')
    let body = null; model.traverse(o => { if (o.isSkinnedMesh) body ||= o })
    strap = { sheath, body, skin: [], lift: [0, 0], top: pin(mouth, chest), end: pin(tip, hips), fwd: pin(mouth.clone().setZ(0), chest) }
    aim(strap, 0)                                 // rest pose: pick the strip of back skin the scabbard lies on
    // Only the torso pushes it (skin mostly on the spine bones): a leg swinging back in the run would kick it off his back.
    const torso = new Set(['hips', 'spine', 'chest', 'upperChest', 'neck'].map(n => body.skeleton.bones.indexOf(model.getObjectByName(n))))
    const si = body.geometry.attributes.skinIndex, sw = body.geometry.attributes.skinWeight
    for (let i = 0, n = body.geometry.attributes.position.count; i < n; i++) {
      let w = 0; for (let c = 0; c < 4; c++) if (torso.has(si.getComponent(i, c))) w += sw.getComponent(i, c)
      if (w < 0.8) continue
      body.getVertexPosition(i, v).applyMatrix4(body.matrixWorld); sheath.worldToLocal(v)
      if (Math.abs(v.x) < 0.07 && v.y < 0 && v.y > -1.1 && v.z > -0.25 && v.z < 0.15) strap.skin.push(i)
    }
    strap.tn = new Float32Array(strap.skin.length * 2)
    scene.add(sheath)                             // only once every anchor is pinned
    ctx.heroRig = { model, sheath, sword, rightHand: model.getObjectByName('rightHand') }
  } catch (e) { strap = null; window.__errors.push(`hero: sword ${e?.message || e}`) }

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

  // Actions for other lanes (combat): a clip plays on top of locomotion until it ends (or stop()), and walking
  // keys are ignored while it holds lockMove. Contract: PLAN.md Phase 3, ctx.heroAct.
  let act = null // { action, lockMove, resolve }
  const endAct = () => { const r = act?.resolve; act = null; r?.() }
  mixer.addEventListener('finished', e => { if (e.action === act?.action) endAct() })
  ctx.heroAct = {
    play(name, { loop = false, fade = 0.15, speed = 1, lockMove = false } = {}) {
      const a = actions[name.toLowerCase()]
      if (!a) return Promise.reject(new Error(`hero has no clip "${name}"`))
      endAct()                                        // a new action cuts the one before it
      a.reset().setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
      a.clampWhenFinished = !loop; a.timeScale = speed
      a.fadeIn(fade).play()
      if (cur !== a) cur?.fadeOut(fade)
      cur = a; clip = name
      return new Promise(resolve => { act = { action: a, lockMove, resolve } })
    },
    stop: endAct,                                     // hand the body back to walk / run / idle
    busy: () => !!act,
    face(x, z) { face = Math.atan2(x, z) },          // turn to face a world direction at once
  }

  // Input flags; ?auto= sets the same ones the keys do.
  const keys = new Set()
  let jumpQueued = false // latched on keydown: a tap shorter than one frame still jumps
  const auto = params.get('auto')
  if (auto) { keys.add('w'); if (auto === 'run') keys.add('shift') }
  addEventListener('keydown', e => { keys.add(e.key.toLowerCase()); if (e.key === ' ') { e.preventDefault(); jumpQueued ||= !e.repeat } })
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()))
  addEventListener('blur', () => keys.clear())

  // Orbit: drag the mouse/finger. Camera starts behind the hero (hero faces -Z).
  // Deltas from clientX/Y: movementX is 0 for touch in Safari and for synthetic events.
  let yaw = 0, pitch = 0.10, drag = null
  const el = ctx.renderer.domElement
  // One pointer steers; a second finger is ignored instead of making yaw jump between the two.
  el.addEventListener('pointerdown', e => { if (drag) return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; el.setPointerCapture?.(e.pointerId) })
  const release = e => { if (drag?.id === e.pointerId) drag = null }
  addEventListener('pointerup', release)
  addEventListener('pointercancel', release)
  el.addEventListener('lostpointercapture', release) // a missed pointerup must not leave look-around dead
  el.addEventListener('pointermove', e => {
    if (drag?.id !== e.pointerId) return
    yaw -= (e.clientX - drag.x) * 0.005
    pitch = THREE.MathUtils.clamp(pitch + (e.clientY - drag.y) * 0.005, -0.15, 1.2)
    drag.x = e.clientX; drag.y = e.clientY
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

  window.__probes.hero = () => ({ clip, x: +pos.x.toFixed(2), z: +pos.z.toFixed(2), feetGap: +(pos.y - ctx.heightAt(pos.x, pos.z)).toFixed(3), strapSkin: strap?.skin.length ?? 0, strapLift: strap?.lift.map(x => +x.toFixed(3)) })

  return {
    update(dt) {
      const [dx, dz] = act?.lockMove ? [0, 0] : dirOf()
      const len = Math.hypot(dx, dz), moving = len > 0.01
      const speed = keys.has('shift') ? 5 : 1.6
      if (moving) {
        pos.x += (dx / len) * speed * dt
        pos.z += (dz / len) * speed * dt
        let d = Math.atan2(dx, dz) - face
        d = Math.atan2(Math.sin(d), Math.cos(d))
        face += d * Math.min(1, dt * 10)
      }
      if (jumpQueued && grounded) { vy = 5; grounded = false; jumpT = 0.9 }
      jumpQueued = false
      const gy = ctx.heightAt(pos.x, pos.z)
      if (!grounded) {
        vy -= 14 * dt; pos.y += vy * dt; jumpT -= dt
        if (pos.y <= gy && vy < 0) { pos.y = gy; grounded = true; vy = 0 }
      } else pos.y = gy

      if (!act) play(!grounded && actions.jump ? 'Jump' : !moving ? 'Idle' : keys.has('shift') ? 'Run' : 'Walk')
      mixer.update(dt)
      root.position.copy(pos)
      root.rotation.y = face
      if (strap) { root.updateMatrixWorld(true); aim(strap, dt) }

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
