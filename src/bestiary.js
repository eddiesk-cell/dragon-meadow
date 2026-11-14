// Phase 4d lane bestiary — ?bestiary=1: every rigged creature on a plinth in the real world, turning and cycling its
// clips, with a name + land label. &focus=<id> frames one large. Without the param it costs nothing. See PLAN.md.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as THREE from 'three/webgpu'
import { createSprings } from './springs.js'
import { attribute, positionLocal, modelPosition, time, vec3, sin, cos, max, mod, floor, step } from 'three/tsl'

// id, name, land, size in metres (BESTIARY.md; models are rigged at 1.80 m), options. Order = build order along the arc.
// Options: real (the glb is already at true scale), idle (its resting loop), swarm (copies on the plinth), lie (lies
// behind the arc, no plinth: Old Glim is 16 m long), prop [glb in models/props, bone that holds it, and if it would
// reach below the plinth: 'slide' it up through the hand (a spear grounds its butt); 'rope': its chain hangs from the
// bone under gravity every frame and the anchor rests and drags on the plinth (the anchor)].
const ROSTER = [
  ['chalk-hob', 'Chalk Hob', 'Dragon Meadow', 1.3],
  ['wreckback', 'Wreckback', 'The Undercliff', 2.2],
  ['lantern-cap', 'Lantern-cap', 'Lanternwood', 1.6],
  ['rootbinder', 'The Rootbinder', 'Lanternwood', 4.0],
  ['driftwight', 'The Driftwight', 'The Undercliff', 3.2],
  ['stiltstalker', 'Stiltstalker', 'Mirrormere', 2.8, { prop: ['reed-spear', 'rightHand', 'slide'] }],
  ['old-glim', 'Old Glim', 'Mirrormere', 16, { real: true, idle: 'Swim', lie: true }],
  ['tolling-warden', 'The Tolling Warden', 'Bellholm', 3.4, { prop: ['anchor', 'rightHand', 'rope'] }],
  ['scarhorn', 'Scarhorn', 'The Greyspine', 2.6, { rad: 1.6 }], // its charge strides wider than the default plinth
  ['gapshrike', 'The Gapshrike', 'The Greyspine', 2.4],
  ['ribmite', 'Ribmites', 'The Redwaste', 0.3, { real: true, swarm: 14 }],
  ['marrowkeeper', 'The Marrowkeeper', 'The Redwaste', 3.5],
  ['rime-warden', 'The Rime Warden', 'Wyrmcrown', 4.5],
]
const RIG = 1.8, R = 20.4, SPAN = 1.0, PLINTH = 0.75 // arc radius (m), half-angle (rad), plinth height (m)

// Ribmites: rigid beetles whose legs walk in a tripod gait in the shader (attributes _leg, _legt); a scuttle, legs ~3 cm.
export function scuttle(model) {
  model.traverse(m => {
    if (!m.isMesh) return
    const old = m.material, leg = attribute('_leg', 'float'), lt = attribute('_legt', 'float')
    m.material = new THREE.MeshStandardNodeMaterial({ map: old.map, normalMap: old.normalMap, roughnessMap: old.roughnessMap, roughness: old.roughness, metalness: old.metalness, color: old.color })
    const ph = time.mul(14).add(mod(leg.add(floor(leg.sub(1).div(2))), 2).mul(Math.PI)).add(modelPosition.x.mul(7)).add(modelPosition.z.mul(5))
    m.material.positionNode = positionLocal.add(vec3(0, max(sin(ph), 0).mul(0.028), cos(ph).mul(0.035)).mul(lt).mul(step(0.5, leg))) // a scuttle, legs ~3 cm
  })
}

// The tolling warden's anchor on its chain (gallery and world): the rope state for chain(), from the fist `bone` down the
// anchor prop `p`'s 8 chain bones. top/x/z/rad: the plinth (roam sets them every frame to the ground under the creature).
export function makeRope({ p, bone, s, top, x, z, rad, root }) {
  const bones = [8, 7, 6, 5, 4, 3, 2, 1].map(k => p.getObjectByName('chain_' + k)), h = bone.getWorldPosition(new THREE.Vector3())
  // points: the 8 links from the fist down, then the anchor's crown (its shank is 1.08 m below the ring in the model)
  const lens = [...bones.map(() => 0.14 * s), 1.08 * s]
  const rope = { bone, bones, lens, pts: lens.map((_, k) => h.clone().setY(h.y - lens.slice(0, k + 1).reduce((a, b) => a + b, 0))), old: null, top, x, z, rad, root, s }
  // start with the anchor lying outward from the fist: hung straight down it balances on its crown under a still fist
  rope.pts.at(-1).copy(rope.pts.at(-2)).addScaledVector(new THREE.Vector3(h.x - x, 0, h.z - z).normalize(), lens.at(-1))
  rope.old = rope.pts.map(q => q.clone())
  return rope
}

// A hanging chain: Verlet points from the fist down to the anchor's ring, held to their link length, kept on and above
// the plinth (the anchor lies and drags on it); then each chain bone is set from its point toward the next one up.
const fist = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), q = new THREE.Quaternion(), pq = new THREE.Quaternion()
export const chain = (r, dt) => {
  const fl = (x, z) => r.floor?.(x, z) ?? r.top // r.floor(x, z): the ground under a point when it is not a flat plinth (roam)
  r.root.updateMatrixWorld(true); r.bone.getWorldPosition(fist)
  const g = 9.8 * Math.min(dt, 1 / 30) ** 2
  // damping: the anchor (k > 6) settles instead of swinging like a pendulum
  r.pts.forEach((p, k) => { const v = p.clone().sub(r.old[k]).multiplyScalar(k > 6 ? 0.9 : 0.96); r.old[k].copy(p); if (k > 6) v.y = Math.min(v.y, 0); p.add(v).y -= g }) // the heavy anchor never flies up on its own momentum: no overshoot above the fist
  { // an anchor propped up with a slack chain is leaning on the body column or balanced on its crown, not held:
    // slide its ring round the body and outward so it lies down (it stood up after Death, and leaned after rising)
    const ring = r.pts.at(-2), crown = r.pts.at(-1), ox = ring.x - r.x, oz = ring.z - r.z, rr = Math.hypot(ox, oz) || 1e-6
    const slack = fist.distanceTo(ring) < 0.95 * 8 * r.lens[0]
    if (slack && crown.y < fl(crown.x, crown.z) + 0.2 * r.s && ring.y > fl(ring.x, ring.z) + 0.3 * r.s) {
      const sg = (-oz * (ring.x - crown.x) + ox * (ring.z - crown.z)) < 0 ? -1 : 1, st = 0.02 * r.s / rr
      ring.x += (-oz * sg + ox * 0.5) * st; ring.z += (ox * sg + oz * 0.5) * st
    }
  }
  for (let n = 0; n < (r.iter || 12); n++) { // r.iter: more passes when the fist moves (roam)
    r.pts.forEach((p, k) => {
      const a = k ? r.pts[k - 1] : fist, d = p.distanceTo(a) || 1e-6, e = (d - r.lens[k]) / d
      // the anchor (ring and crown) is 12x a link's weight, so the fist drags it instead of whipping it into the air
      const wa = k > 7 ? 0.08 : 1, wp = k > 6 ? 0.08 : 1
      if (k) { dir.subVectors(p, a).multiplyScalar(e / (wa + wp)); a.addScaledVector(dir, wa); p.addScaledVector(dir, -wp) } else p.lerp(a, e)
    })
    for (const p of r.pts) { // on the plinth: above its top, inside its rim, outside the body (a 0.4 m-rig column)
      // the rim and the body column must leave a chord longer than the shank (2.04 m on the warden), or the anchor is forced upright
      const ox = p.x - r.x, oz = p.z - r.z, rr = Math.hypot(ox, oz) || 1e-6, lim = r.rad - 0.08, body = 0.4 * r.s, top = fl(p.x, p.z)
      if (p.y > top + 0.3 * r.s) continue // only what lies on the stone is fenced in: a raised fist carries the chain out past the rim
      if (rr > lim) p.x = r.x + ox * lim / rr, p.z = r.z + oz * lim / rr
      else if (rr < body && p.y < top + 1.6 * r.s) p.x = r.x + ox * body / rr, p.z = r.z + oz * body / rr
      if (rr <= r.rad) p.y = Math.max(p.y, top + (p === r.pts.at(-1) ? 0.14 * r.s : p === r.pts.at(-2) ? 0.1 * r.s : 0.04)) // crown, ring, links
    }
  }
  r.pts.forEach((p, k) => { if (p.y < fl(p.x, p.z) + 0.15 * r.s && (k < 8 || r.pts[7].y < fl(r.pts[7].x, r.pts[7].z) + 0.3 * r.s)) r.old[k].x += (p.x - r.old[k].x) * 0.6, r.old[k].z += (p.z - r.old[k].z) * 0.6 }) // friction on the stone
  for (let k = r.bones.length - 1; k >= 0; k--) { // anchor (chain_1, the root) first, up to the fist; +Y to the next link up
    const b = r.bones[k], toward = k ? r.pts[k - 1] : fist
    b.parent.updateMatrixWorld(true)
    b.position.copy(b.parent.worldToLocal(r.pts[k].clone()))
    if (k === r.bones.length - 1) dir.subVectors(r.pts[k], r.pts[k + 1]).normalize() // the ring: its shank runs to the crown (−Y)
    else dir.subVectors(toward, r.pts[k]).normalize()
    q.setFromUnitVectors(up, dir); b.parent.getWorldQuaternion(pq)
    if (k === r.bones.length - 1) { // the stock (crossbar, local x) always lies level: x = shank × up; near-vertical shank keeps last frame's stock so it cannot flip
      const prev = r.stock || (r.stock = new THREE.Vector3(1, 0, 0)), sx = dir.clone().cross(up)
      if (sx.lengthSq() < 0.0975) sx.copy(prev).addScaledVector(dir, -dir.dot(prev))
      sx.normalize(); if (sx.dot(prev) < 0) sx.negate()
      r.stock.copy(sx); sx.copy(r.stock).multiplyScalar(Math.cos(0.95)).addScaledVector(dir.clone().cross(r.stock), Math.sin(0.95)) // lowest lying pose: the flukes' span is the longer one, so level-stock would stand them 1.1 m up; 0.95 rad off level (stock 0.8 m half-span, flukes 1.1 m) leaves every tip under ~0.7 m
      q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(sx, dir, sx.clone().cross(dir)))
    }
    b.quaternion.copy(pq.invert().multiply(q)); b.updateMatrixWorld(true)
  }
}

export async function createBestiary(ctx) {
  const { THREE, scene, camera, params } = ctx
  if (params.get('bestiary') !== '1') return null
  const focus = params.get('focus')
  const A = new THREE.Vector3(0, 0, 60) // the camera's end of the arc; creatures stand R metres north of it
  const stone = new THREE.MeshStandardMaterial({ color: 0x8d8b84, roughness: 1 })
  const loader = new GLTFLoader()
  const v = new THREE.Vector3()
  // lowest/highest vertex in the current pose, world space (skinned or rigid)
  const extent = root => {
    root.updateMatrixWorld(true)
    let lo = Infinity, hi = -Infinity
    root.traverse(o => {
      if (!o.isMesh) return
      o.skeleton?.update()
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

  const items = [], lamps = []
  const arc = ROSTER.filter(r => !r[4]?.lie)
  const radOf = ([, , , size, o = {}]) => o.lie ? size / 2 : o.rad || Math.max(1.1, size * 0.45)
  // plinths are spaced by their own widths (rim to rim 0.6 m of grass, the base flares 12%), so none ever touch
  const ang = j => -SPAN + (2 * SPAN * cum[j]) / cum.at(-1)
  const cum = arc.reduce((c, r, k) => [...c, k ? c[k - 1] + 1.12 * (radOf(arc[k - 1]) + radOf(r)) + 0.6 : 0], [])
  for (const [i, [id, name, land, size, o = {}]] of ROSTER.entries()) {
    try {
      const gltf = await loader.loadAsync(import.meta.env.BASE_URL + `models/bestiary/${id}.glb`)
      const j = arc.indexOf(ROSTER[i]), a = o.lie ? ang(arc.findIndex(r => r[0] === 'ribmite')) - 0.09 : ang(j), d = o.lie ? R + 16 : R
      const x = A.x + d * Math.sin(a), z = A.z - d * Math.cos(a)
      const top = ctx.heightAt(x, z) + (o.lie ? 0 : PLINTH)
      const rad = radOf(ROSTER[i])
      if (!o.lie) {
        const plinth = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 1.12, PLINTH + 0.6, 24), stone)
        plinth.position.set(x, top - (PLINTH + 0.6) / 2, z)
        plinth.castShadow = plinth.receiveShadow = true
        scene.add(plinth)
      }
      ctx.keepClear.push({ x, z, r: rad + 1, bare: o.lie ? 0 : rad + 0.1 }) // bare: radius (m) the field strips of grass; Old Glim has no plinth, she lies on grass

      const model = gltf.scene, root = new THREE.Group(), s = o.real ? 1 : size / RIG
      model.traverse(m => {
        if (!m.isMesh) return
        m.castShadow = m.receiveShadow = true; m.frustumCulled = false
        if (m.material.name === 'glim-lamps') lamps.push(m.material) // Old Glim's flank lamps glow at night
      })
      root.add(model); root.scale.setScalar(s); root.position.set(x, top, z); scene.add(root)
      if (o.swarm) { // ribmites: rigid beetles whose legs walk in a tripod gait in the shader (attributes _leg, _legt)
        scuttle(model)
        for (let k = 1; k < o.swarm; k++) {
          const c = model.clone(), r = rad * 0.85 * Math.sqrt(k / o.swarm), t = k * 2.4 // sunflower spacing: none overlap
          c.position.set(Math.cos(t) * r, 0, Math.sin(t) * r); c.rotation.y = t * 1.7; root.add(c)
        }
      }

      const mixer = new THREE.AnimationMixer(model), actions = {}
      for (const c of gltf.animations) {
        // a clip that travels (the Scarhorn's charge carries 7.6 m of root motion) runs in place on its plinth
        const hp = c.tracks.find(t => /hips\.position$/i.test(t.name))?.values
        if (hp && Math.hypot(hp.at(-3) - hp[0], hp.at(-1) - hp[2]) > 1) for (let k = 0; k < hp.length; k += 3) hp[k] = hp[0], hp[k + 2] = hp[2]
        actions[c.name] = mixer.clipAction(c)
      }
      // The idle, then each other clip in turn with the idle between, back to the idle.
      const idle = o.idle || 'Idle'
      const names = Object.keys(actions).filter(n => n !== idle)
      const seq = [idle, ...names.flatMap(n => [n, idle])]
      const len = n => (n === idle ? 2.5 : Math.min(Math.max(actions[n].getClip().duration, 2), 4.5))
      const total = seq.reduce((t, n) => t + len(n), 0)
      let cur = null
      const play = n => {
        const act = actions[n]
        if (!act || act === cur) return // the ribmites have no clips
        act.reset().fadeIn(0.3).play(); cur?.fadeOut(0.3)
        cur = act; cur.name = n
      }
      play(idle); mixer.update(0.4) // let the fade-in finish, else this measures the rest pose
      const [lo, hi] = extent(root)
      let rope = null
      if (o.prop) { // held in the idle pose: its grip at the bone, then grounded on the plinth (see ROSTER)
        const p = (await loader.loadAsync(import.meta.env.BASE_URL + `models/props/${o.prop[0]}.glb`)).scene, bone = model.getObjectByName(o.prop[1])
        p.traverse(m => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false } })
        if (o.prop[2] === 'rope') { // the anchor stays in the model (the turntable carries it); its chain bones follow the rope
          model.add(p)
          rope = makeRope({ p, bone, s, top, x, z, rad, root })
        } else {
          const pivot = new THREE.Group(); model.add(pivot); pivot.add(p); model.updateMatrixWorld(true)
          p.position.sub(model.worldToLocal(p.getObjectByName('grip').getWorldPosition(new THREE.Vector3()))) // grip at the pivot
          pivot.position.copy(model.worldToLocal(bone.getWorldPosition(new THREE.Vector3()))); model.updateMatrixWorld(true)
          const below = top - extent(p)[0] // how far it reaches under the plinth top
          if (below > 0) p.position.y += below / s
          pivot.updateMatrixWorld(true); bone.attach(pivot)
        }
      }
      const el = document.createElement('div')
      el.style.cssText = 'position:absolute;transform:translate(-50%,-100%);text-align:center;white-space:nowrap'
      el.innerHTML = `<div style="font-size:20px;font-weight:bold">${name}</div><div style="font-size:13px;opacity:.85;font-style:italic">${land}</div>`
      label.append(el)
      // the Rootbinder's six crown roots: stiff springs, run after the mixer (its clips hold them at rest) and the turntable
      const springs = id === 'rootbinder' ? await createSprings(ctx, { model, prefix: 'spring_crown', kind: 'root', probe: 'crown' }) : null
      items.push({ id, size, root, mixer, springs, seq, len, total, play, el, pos: new THREE.Vector3(x, top, z), yaw: 0, lie: !!o.lie, rope, clipName: idle, phase: i * 3.1, height: hi - lo, footY: lo - top })
    } catch (e) { window.__errors.push(`bestiary: ${id}: ${e.message || e}`) }
  }

  const cur = (it, t) => {
    if (it.id === focus && params.get('clip')) return params.get('clip') // ?focus=id&clip=Name holds one clip, for review shots
    let k = (t + it.phase) % it.total
    for (const n of it.seq) { const l = it.len(n); if (k < l) return n; k -= l }
    return it.seq[0]
  }
  const target = items.find(it => it.id === focus)
  const tp = new THREE.Vector3(), cp = new THREE.Vector3(), sp = new THREE.Vector3()
  const apply = (dt, t) => {
    for (const m of lamps) m.emissiveIntensity = 0.3 + 2.7 * ctx.night
    for (const it of items) {
      it.clipName = cur(it, t); it.play(it.clipName); it.mixer.update(dt)
      it.yaw = it.lie ? Math.PI // lies away from the view behind the Ribmites, the gallery's smallest creature, so her reared head clears the plinths in front
        : target === it
        ? Math.atan2(A.x - it.pos.x, A.z - it.pos.z) + Math.sin(t * 0.4) * 0.25 // faces the camera, a gentle sway
        : Math.atan2(A.x - it.pos.x, A.z - it.pos.z) + (params.get('still') ? 0 : t * 0.3)
      it.root.rotation.y = it.yaw
      if (it.rope) chain(it.rope, dt)
      it.springs?.update(dt, t)
    }
    if (target) {
      const p = target.pos, fs = Math.max(target.size, 1.2), d = fs * 1.3 + 1
      cp.set(A.x - p.x, 0, A.z - p.z).normalize().multiplyScalar(d).add(p)
      cp.y = ctx.heightAt(cp.x, cp.z) + fs * 0.6 + PLINTH
      tp.set(p.x, p.y + Math.min(fs, target.height) * 0.5, p.z)
    } else {
      const ph = params.get("pan") ? +params.get("pan") : Math.sin(t * 0.12), phi = SPAN * 0.7 * ph
      cp.set(A.x + 4 * ph, 0, A.z + 4)
      cp.y = ctx.heightAt(cp.x, cp.z) + 3.2
      tp.set(A.x + R * Math.sin(phi), ctx.heightAt(A.x + R * Math.sin(phi), A.z - R * Math.cos(phi)) + 1.8, A.z - R * Math.cos(phi))
    }
    camera.position.copy(cp); camera.lookAt(tp); camera.updateMatrixWorld(true)
    for (const it of items) {
      sp.copy(it.pos); sp.y += it.height + 0.5; sp.project(camera)
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
