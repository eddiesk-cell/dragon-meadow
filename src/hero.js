// Hero lane: the Drifter, third-person camera, WASD/Shift/Space, ?auto=walk|run for proof.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js'

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
  // keys are ignored while it holds lockMove. With hold the promise still resolves when the clip ends, but the last
  // pose stays until stop() (Death lies still). Contract: PLAN.md Phase 3, ctx.heroAct.
  let act = null // { action, lockMove, hold, resolve }
  const endAct = () => { const r = act?.resolve; act = null; r?.() }
  mixer.addEventListener('finished', e => { if (e.action === act?.action) act.hold ? act.resolve() : endAct() })
  ctx.heroAct = {
    play(name, { loop = false, fade = 0.15, speed = 1, lockMove = false, hold = false } = {}) {
      const a = actions[name.toLowerCase()]
      if (!a) return Promise.reject(new Error(`hero has no clip "${name}"`))
      endAct()                                        // a new action cuts the one before it
      a.reset().setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
      a.clampWhenFinished = !loop; a.timeScale = speed
      a.fadeIn(fade).play()
      if (cur !== a) cur?.fadeOut(fade)
      cur = a; clip = name
      return new Promise(resolve => { act = { action: a, lockMove, hold, resolve } })
    },
    stop: endAct,                                     // hand the body back to walk / run / idle
    busy: () => !!act,
    face(x, z) { face = Math.atan2(x, z) },          // turn to face a world direction at once
  }
  // ?hold=1 proof: Death (Collapse) held; the probe compares the pose now with the one it ended in (cloth bones swing).
  const bones = []; model.traverse(o => o.isBone && !o.name.startsWith('spring_') && bones.push(o))
  const snap = () => bones.flatMap(b => [...b.position.toArray(), ...b.quaternion.toArray()])
  let held = null
  if (params.get('hold')) ctx.heroAct.play('Death (Collapse)', { hold: true, lockMove: true }).then(() => { held = { t: ctx.time, pose: snap() } })

  // Input flags; ?auto=walk|run sets the same ones the keys do (other autos, e.g. fight, steer themselves).
  const keys = new Set()
  let jumpQueued = false // latched on keydown: a tap shorter than one frame still jumps
  const auto = params.get('auto')
  if (auto === 'walk' || auto === 'run') { keys.add('w'); if (auto === 'run') keys.add('shift') }
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

  // Camera collision: rays from his head to the camera stop 0.3 m short of anything flagged userData.cameraBlock
  // (stones, landmarks, buildings: Contract). Five parallel rays, the centre and 0.2 m / 0.12 m off it across the view,
  // so the near plane's edges stay out of a stone's edge too. They test each flagged mesh's convex hull, built once: it
  // holds the mesh, so outside it is outside the stone, and a ray costs ~0.2 ms instead of ~1.7 ms on a 10k-triangle
  // stone (three has no BVH). So flag pieces, not one merged town. The list is re-read every second: modules add props late.
  const ray = new THREE.Raycaster(), seg = new THREE.Vector3(), corner = new THREE.Vector3(), solids = [], blocks = []
  const side = new THREE.Vector3(), lift = new THREE.Vector3(), from = new THREE.Vector3(), to = new THREE.Vector3()
  const OFF = [[0, 0], [0.2, 0], [-0.2, 0], [0, 0.12], [0, -0.12]] // [across, up] in metres
  const hulls = new WeakMap(), hullMat = new THREE.MeshBasicMaterial()
  const hullOf = m => {
    if (!hulls.has(m)) {
      let h = m // instanced, skinned, or flat with no hull: the mesh itself
      if (!m.isInstancedMesh && !m.isSkinnedMesh) try {
        const p = m.geometry.attributes.position
        h = new THREE.Mesh(new ConvexGeometry(Array.from({ length: p.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(p, i))), hullMat)
        h.matrixWorld = m.matrixWorld // the same matrix: the hull moves with its mesh
      } catch { h = m }
      hulls.set(m, h)
    }
    return hulls.get(m)
  }
  const hitAt = (list, from, to, pad) => { // distance to the first of `list` on from→to (+pad), or undefined
    seg.subVectors(to, from); const len = seg.length()
    ray.set(from, seg.divideScalar(len)); ray.far = len + pad
    return ray.intersectObjects(list, false)[0]?.distance
  }
  let scanT = 0, pulled = 0, frames = 0, behind = 0, inStone = 0
  // The ring's stone meshes, found from ctx.ring.stones[].pos (not from the flag): they block the camera even unflagged, and
  // ?camtest=1 swings the orbit behind the nearest of them (in ?auto=fight, the barrow-door stones) and checks the real meshes.
  const camtest = params.get('camtest')
  let rocks = []
  const findRocks = () => { // the mesh standing at the first ring stone, then every mesh in its group with the same stone material
    const p = ctx.ring?.stones?.[0]?.pos
    if (p) scene.traverse(o => { if (!rocks.length && o.isMesh && o.getWorldPosition(corner).setY(p.y).distanceTo(p) < 0.01) rocks = o.parent.children.filter(m => m.material === o.material) })
  }

  const dirOf = () => {
    const f = (keys.has('w') || keys.has('arrowup')) - (keys.has('s') || keys.has('arrowdown'))
    const r = (keys.has('d') || keys.has('arrowright')) - (keys.has('a') || keys.has('arrowleft'))
    // forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw)
    return [-Math.sin(yaw) * f + Math.cos(yaw) * r, -Math.cos(yaw) * f - Math.sin(yaw) * r]
  }

  window.__probes.hero = () => ({ clip, x: +pos.x.toFixed(2), z: +pos.z.toFixed(2), feetGap: +(pos.y - ctx.heightAt(pos.x, pos.z)).toFixed(3), strapSkin: strap?.skin.length ?? 0, strapLift: strap?.lift.map(x => +x.toFixed(3)),
    cam: { blocks: blocks.length, pulled, frames, ...(camtest && { rocks: rocks.length, behind, inStone }) }, // frames: pulled in front of a block, goal behind one, camera inside one
    hold: held && { secs: +(ctx.time - held.t).toFixed(2), drift: +Math.max(...snap().map((q, i) => Math.abs(q - held.pose[i]))).toFixed(5) } })

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

      // Camera: orbit target at head height, never under the ground, never inside a block.
      camTarget.set(pos.x, pos.y + 1.5, pos.z)
      if ((scanT -= dt) <= 0) {
        scanT = 1; solids.length = 0
        scene.traverse(o => o.userData.cameraBlock && o.traverse(m => m.isMesh && solids.push(m)))
        if (!rocks.length) findRocks()
        for (const m of rocks) solids.includes(m) || solids.push(m) // shortcut: ring.js:121 does not flag its stones yet (Contract); drop this line once it does
        blocks.length = 0; blocks.push(...solids.map(hullOf))
      }
      let R = DIST, near = Infinity
      if (camtest) for (const o of rocks) { // swing ±30° across the nearest stone, 2.5 m beyond it, low: its goal keeps landing behind stone
        const p = o.getWorldPosition(corner), d = Math.hypot(p.x - pos.x, p.z - pos.z)
        if (d < near) { near = d; R = Math.min(d + 2.5, 16); yaw = Math.atan2(p.x - pos.x, p.z - pos.z) + 0.5 * Math.sin(ctx.time * 0.9); pitch = 0.05 + 0.1 * Math.abs(Math.sin(ctx.time * 0.6)) }
      }
      const cp = Math.cos(pitch)
      camGoal.set(camTarget.x + Math.sin(yaw) * cp * R, camTarget.y + Math.sin(pitch) * R, camTarget.z + Math.cos(yaw) * cp * R)
      camGoal.y = Math.max(camGoal.y, ctx.heightAt(camGoal.x, camGoal.z) + 0.4)
      if (camtest) behind += hitAt(rocks, camTarget, camGoal, 0) !== undefined
      camera.position.lerp(camGoal, 1 - Math.exp(-dt * 12))
      // After the lerp, so a lagging camera never trails through stone.
      const cl = camera.position.distanceTo(camTarget)
      side.subVectors(camera.position, camTarget).cross(camera.up).normalize(); lift.subVectors(camera.position, camTarget).cross(side).normalize()
      let k = cl
      for (const [x, y] of OFF) {
        from.copy(camTarget).addScaledVector(side, x).addScaledVector(lift, y)
        const d = hitAt(blocks, from, to.copy(camera.position).addScaledVector(side, x).addScaledVector(lift, y), 0.3)
        if (d !== undefined) k = Math.min(k, d - 0.3)
      }
      if (k < cl) { camera.position.lerp(camTarget, 1 - Math.max(k, 0.2) / cl); pulled++ }
      camera.lookAt(camTarget.x, camTarget.y + 0.3, camTarget.z)
      frames++
      if (camtest) { // independent check: the camera and its near-plane corners all on his side of every stone
        camera.updateMatrixWorld()
        let inside = hitAt(rocks, camTarget, camera.position, 0) !== undefined // against the real stone meshes, not the hulls
        for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) inside ||= hitAt(rocks, camTarget, corner.set(x, y, -1).unproject(camera), 0) !== undefined
        inStone += inside
      }
    },
  }
}
