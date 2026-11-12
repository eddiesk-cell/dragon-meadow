// Phase 4d lane bestiary — ?bestiary=1: every rigged creature on a plinth in the real world, turning and cycling its
// clips, with a name + land label. &focus=<id> frames one large. Without the param it costs nothing. See PLAN.md.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

// id, name, land, size in metres (BESTIARY.md; models are rigged at 1.80 m). Order = build order along the arc.
const ROSTER = [
  ['chalk-hob', 'Chalk Hob', 'Dragon Meadow', 1.3],
  ['wreckback', 'Wreckback', 'The Undercliff', 2.2],
  ['lantern-cap', 'Lantern-cap', 'Lanternwood', 1.6],
  ['driftwight', 'The Driftwight', 'The Undercliff', 3.2],
  ['stiltstalker', 'Stiltstalker', 'Mirrormere', 2.8],
  ['tolling-warden', 'The Tolling Warden', 'Bellholm', 3.4],
  ['scarhorn', 'Scarhorn', 'The Greyspine', 2.6],
  ['gapshrike', 'The Gapshrike', 'The Greyspine', 2.4],
  ['marrowkeeper', 'The Marrowkeeper', 'The Redwaste', 3.5],
  ['rime-warden', 'The Rime Warden', 'Wyrmcrown', 4.5],
]
const RIG = 1.8, R = 18, SPAN = 1.0, PLINTH = 0.75 // arc radius (m), half-angle (rad), plinth height (m)

export async function createBestiary(ctx) {
  const { THREE, scene, camera, params } = ctx
  if (params.get('bestiary') !== '1') return null
  const focus = params.get('focus')
  const A = new THREE.Vector3(0, 0, 60) // the camera's end of the arc; creatures stand R metres north of it
  const stone = new THREE.MeshStandardMaterial({ color: 0x8d8b84, roughness: 1 })
  const loader = new GLTFLoader()
  const v = new THREE.Vector3()
  // lowest/highest skinned vertex in the current pose, world space
  const extent = root => {
    root.updateMatrixWorld(true)
    let lo = Infinity, hi = -Infinity
    root.traverse(o => {
      if (!o.isSkinnedMesh) return
      o.skeleton.update()
      for (let i = 0, n = o.geometry.attributes.position.count; i < n; i++) {
        o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld)
        if (v.y < lo) lo = v.y
        if (v.y > hi) hi = v.y
      }
    })
    return [lo, hi]
  }

  const label = document.createElement('div')
  label.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden;font-family:Georgia,serif;color:#fff;text-shadow:0 1px 4px #000,0 0 2px #000'
  document.body.append(label)

  const items = []
  for (const [i, [id, name, land, size]] of ROSTER.entries()) {
    try {
      const gltf = await loader.loadAsync(import.meta.env.BASE_URL + `models/bestiary/${id}.glb`)
      const a = ROSTER.length > 1 ? -SPAN + (2 * SPAN * i) / (ROSTER.length - 1) : 0
      const x = A.x + R * Math.sin(a), z = A.z - R * Math.cos(a)
      const top = ctx.heightAt(x, z) + PLINTH
      const rad = Math.max(1.1, size * 0.45)
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 1.12, PLINTH + 0.6, 24), stone)
      plinth.position.set(x, top - (PLINTH + 0.6) / 2, z)
      plinth.castShadow = plinth.receiveShadow = true
      scene.add(plinth)
      ctx.keepClear.push({ x, z, r: rad + 1 })

      const model = gltf.scene, root = new THREE.Group(), s = size / RIG
      model.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.frustumCulled = false } })
      root.add(model); root.scale.setScalar(s); root.position.set(x, top, z); scene.add(root)

      const mixer = new THREE.AnimationMixer(model), actions = {}
      for (const c of gltf.animations) actions[c.name] = mixer.clipAction(c)
      // Idle, then each other clip in turn with Idle between, back to Idle.
      const names = Object.keys(actions).filter(n => n !== 'Idle')
      const seq = ['Idle', ...names.flatMap(n => [n, 'Idle'])]
      const len = n => (n === 'Idle' ? 2.5 : Math.min(Math.max(actions[n].getClip().duration, 2), 4.5))
      const total = seq.reduce((t, n) => t + len(n), 0)
      let cur = null
      const play = n => {
        const act = actions[n]
        if (act === cur) return
        act.reset().fadeIn(0.3).play(); cur?.fadeOut(0.3)
        cur = act; cur.name = n
      }
      play('Idle'); mixer.update(0.4) // let the fade-in finish, else this measures the rest pose
      const [lo, hi] = extent(root)
      const el = document.createElement('div')
      el.style.cssText = 'position:absolute;transform:translate(-50%,-100%);text-align:center;white-space:nowrap'
      el.innerHTML = `<div style="font-size:20px;font-weight:bold">${name}</div><div style="font-size:13px;opacity:.85;font-style:italic">${land}</div>`
      label.append(el)
      items.push({ id, size, root, mixer, seq, len, total, play, el, pos: new THREE.Vector3(x, top, z), yaw: 0, clipName: 'Idle', phase: i * 3.1, height: hi - lo, footY: lo - top })
    } catch (e) { window.__errors.push(`bestiary: ${id}: ${e.message || e}`) }
  }

  const cur = (it, t) => {
    let k = (t + it.phase) % it.total
    for (const n of it.seq) { const l = it.len(n); if (k < l) return n; k -= l }
    return 'Idle'
  }
  const target = items.find(it => it.id === focus)
  const tp = new THREE.Vector3(), cp = new THREE.Vector3(), sp = new THREE.Vector3()
  const apply = (dt, t) => {
    for (const it of items) {
      it.clipName = cur(it, t); it.play(it.clipName); it.mixer.update(dt)
      it.yaw = target === it
        ? Math.atan2(A.x - it.pos.x, A.z - it.pos.z) + Math.sin(t * 0.4) * 0.25 // faces the camera, a gentle sway
        : Math.atan2(A.x - it.pos.x, A.z - it.pos.z) + (params.get('still') ? 0 : t * 0.3)
      it.root.rotation.y = it.yaw
    }
    if (target) {
      const p = target.pos, d = target.size * 1.3 + 1
      cp.set(A.x - p.x, 0, A.z - p.z).normalize().multiplyScalar(d).add(p)
      cp.y = ctx.heightAt(cp.x, cp.z) + target.size * 0.6 + PLINTH
      tp.set(p.x, p.y + target.size * 0.5, p.z)
    } else {
      const ph = params.get("pan") ? +params.get("pan") : Math.sin(t * 0.12), phi = SPAN * 0.7 * ph
      cp.set(A.x + 4 * ph, 0, A.z + 4)
      cp.y = ctx.heightAt(cp.x, cp.z) + 3.2
      tp.set(A.x + R * Math.sin(phi), ctx.heightAt(A.x + R * Math.sin(phi), A.z - R * Math.cos(phi)) + 1.8, A.z - R * Math.cos(phi))
    }
    camera.position.copy(cp); camera.lookAt(tp); camera.updateMatrixWorld(true)
    for (const it of items) {
      sp.copy(it.pos); sp.y += it.size + 0.5; sp.project(camera)
      const show = sp.z < 1 && Math.abs(sp.x) < 1.1 && (!target || target === it)
      it.el.style.display = show ? '' : 'none'
      if (show) it.el.style.cssText += `;left:${((sp.x + 1) / 2) * innerWidth}px;top:${((1 - sp.y) / 2) * innerHeight}px`
    }
  }

  window.__probes.bestiary = () => ({
    loaded: items.length, ids: items.map(it => it.id),
    entries: items.map(it => ({ id: it.id, heightM: +it.height.toFixed(2), targetM: it.size, clip: it.clipName, footYcm: +(it.footY * 100).toFixed(1) })),
  })
  return { update: apply }
}
