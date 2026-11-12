// Lane monster — the Barrow Troll: asleep on a stone at the barrow door, wakes, roars, stalks the hero round the
// standing stones, telegraphed attacks, flinches and staggers, dies. Contract: PLAN.md Phase 3 (ctx.monster).
// Design: WORLD.md "The first monster". Club + seat stone: tools/monster/club.py → public/models/club.glb.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const S = 3 / 1.8                  // troll.glb is rigged at 1.80 m; the Barrow Troll stands 3 m
const R = 1.0, WAKE = 25, LEASH = 38, STIR = 2.5
const WALK = 1.6, RUN = 3.6        // m/s; the clips' own stride speeds (measured from their feet) are 1.21 and 3.44
const ss = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k) }
// Attacks in CLIP seconds: anticipation [0, wind] plays slowed to `windT` game seconds (the telegraph), the rest at
// `fast`; the hit window is [h0, h1]; `end` cuts a long clip short. `reach` = centre distance it is chosen within.
// `swing` lays a procedural overhead arc on the arms (the source clips barely lift them): see armArc().
const ATTACKS = {
  kick:  { clip: 'Kick (Front)', wind: 0.35, windT: 0.75, fast: 1.1, h0: 0.42, h1: 0.7, reach: 2.8, radius: 1.1, dmg: 12, at: 'foot' },
  punch: { clip: 'Punch (Cross)', wind: 0.2, windT: 0.6, fast: 1.2, h0: 0.24, h1: 0.4, reach: 3.6, radius: 1.1, dmg: 15, at: 'club' },
  smash: { clip: 'Hammer Overhead Smash', wind: 1.25, windT: 1.25, fast: 1, h0: 1.38, h1: 1.52, end: 2.8, reach: 4.4, radius: 1.5, dmg: 28, at: 'club', swing: 1 },
  slam:  { clip: 'AoE Ground Slam', wind: 1.25, windT: 1.25, fast: 1, h0: 1.38, h1: 1.52, end: 2.8, reach: 5.2, radius: 4.2, dmg: 22, at: 'ground', swing: 2 },
}

export async function createMonster(ctx) {
  const { THREE, scene, params } = ctx
  const load = n => new GLTFLoader().loadAsync(import.meta.env.BASE_URL + `models/${n}.glb`)
  const [gltf, props] = await Promise.all([load('troll'), load('club')])
  const model = gltf.scene, root = new THREE.Group()
  model.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.frustumCulled = false } })
  root.add(model); root.scale.setScalar(S); scene.add(root)
  const bone = n => model.getObjectByName(n)

  // The club: one of the ring's stones, gripped mid-palm, head out past the thumb and tipped toward the fingers, so
  // it points forward-down when the arm hangs and back over the head when the arm is raised. Pinned in the rest pose.
  const club = props.scene.getObjectByName('club'), hand = bone('rightHand')
  club.traverse(o => { if (o.isMesh) o.castShadow = true })
  club.scale.setScalar(1 / S)
  club.position.set(-0.8, 1.31, 0.15)
  club.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-0.5, -0.15, 1).normalize())
  model.add(club); model.updateMatrixWorld(true); hand.attach(club)
  const HEAD = new THREE.Vector3(0, 1.55, 0) // club's own metres: the heavy torn-out foot

  // Home: on a seat stone just outside the barrow door, facing out (?fight=1: facing the hero it starts beside).
  const ring = ctx.ring, C = ring?.center ?? new THREE.Vector3(325, 0, 180)
  const D = ring?.barrow?.doorDir ?? new THREE.Vector3(-C.x, 0, -C.z).normalize()
  const home = (ring?.barrow?.door ?? C).clone().addScaledVector(D, ring?.barrow ? 1.2 : 0)
  home.y = ctx.heightAt(home.x, home.z)
  const fight = params.get('fight')
  let yaw = fight ? 0 : Math.atan2(D.x, D.z)
  const seat = props.scene.getObjectByName('seat')
  seat.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true })
  seat.position.set(home.x - Math.sin(yaw) * 0.5, 0, home.z - Math.cos(yaw) * 0.5)
  seat.position.y = ctx.heightAt(seat.position.x, seat.position.z) + 0.05
  seat.rotation.y = yaw
  scene.add(seat)
  if (fight) { ctx.heroPos.set(home.x - 3.5, 0, home.z + 11.5); ctx.heroPos.y = ctx.heightAt(ctx.heroPos.x, ctx.heroPos.z); ctx.heroAct?.face(0, -1) }

  // Clips: crossfaded one at a time; a once-clip clamps and fires `done`.
  const mixer = new THREE.AnimationMixer(model), actions = {}
  for (const c of gltf.animations) actions[c.name] = mixer.clipAction(c)
  let cur = null, done = false
  mixer.addEventListener('finished', e => { if (e.action === cur) done = true })
  const play = (name, { loop = true, fade = 0.3, speed = 1, from = 0 } = {}) => {
    const a = actions[name]
    if (a === cur) { a.timeScale = speed; return a }
    a.reset().setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
    a.clampWhenFinished = !loop; a.timeScale = speed; a.time = from
    a.fadeIn(fade).play(); cur?.fadeOut(fade)
    cur = a; done = false
    return a
  }

  const pos = root.position.copy(home), V = new THREE.Vector3(), W = new THREE.Vector3()
  const M = ctx.monster = {
    pos, radius: R, height: 3, hp: 200, maxHp: 200, alive: true, state: 'asleep',
    attack: { active: false, center: new THREE.Vector3(), radius: 1, dmg: 0 },
    takeHit,
  }
  let st = 0, atk = null, last = '', poise = 0, roared = false, struck = false, notice = 0, pause = 0
  const go = (state, clip, opts) => { M.state = state; st = 0; if (clip) play(clip, opts) }
  go('asleep', 'Sit', { speed: 0.5 })
  const stones = (ring?.stones ?? []).map(s => ({ x: s.pos.x, z: s.pos.z, r: s.radius + R }))

  function takeHit({ dmg = 10, dir, point } = {}) {
    if (!M.alive) return
    M.hp = Math.max(0, M.hp - dmg); poise += dmg
    ctx.vfx?.flash(model)
    if (M.state === 'asleep') notice = STIR // a blow wakes it at once
    if (M.hp <= 0) return die()
    if (M.state === 'asleep' || M.state === 'waking' || M.state === 'roar') return
    if (dmg >= 25 || poise >= 60) { poise = 0; endAttack(); go('stagger', 'Stagger', { loop: false, fade: 0.1 }) }
    else if (M.state !== 'attack') go('hit', 'Hit (Front)', { loop: false, fade: 0.1 })
  }
  function die() {
    endAttack(); M.alive = false
    go('dead', 'Death (Collapse)', { loop: false, fade: 0.15 })
    if (ring) ring.mist = 0 // the sea breeze clears the bowl (ring.js eases toward it)
  }
  function endAttack() { atk = null; M.attack.active = false }

  // Turn toward a point at most `rate` rad/s; returns the remaining angle.
  const turn = (x, z, rate, dt) => {
    let d = Math.atan2(x - pos.x, z - pos.z) - yaw
    d = Math.atan2(Math.sin(d), Math.cos(d))
    yaw += Math.sign(d) * Math.min(Math.abs(d), rate * dt)
    return Math.abs(d)
  }
  // Walk toward (x, z), stepping round the standing stones: steer off any stone whose disc the path would cross,
  // then push out of any disc it still touches, so it can never pass through one.
  const walk = (x, z, speed, dt) => {
    let dx = x - pos.x, dz = z - pos.z
    const len = Math.hypot(dx, dz) || 1
    dx /= len; dz /= len
    for (const s of stones) {
      const ox = s.x - pos.x, oz = s.z - pos.z, along = ox * dx + oz * dz, side = ox * dz - oz * dx
      if (along > 0 && along < Math.min(len, s.r + 4) && Math.abs(side) < s.r + 0.5) {
        const k = (s.r + 0.5 - Math.abs(side)) / (s.r + 0.5) * 2, sg = side >= 0 ? 1 : -1
        dx += dz * sg * k; dz -= dx * sg * k // aim past the stone's far side
      }
    }
    turn(pos.x + dx, pos.z + dz, 3, dt)
    pos.x += Math.sin(yaw) * speed * dt; pos.z += Math.cos(yaw) * speed * dt
    for (const s of stones) {
      const ox = pos.x - s.x, oz = pos.z - s.z, d = Math.hypot(ox, oz)
      if (d < s.r) { pos.x = s.x + ox / d * s.r; pos.z = s.z + oz / d * s.r }
    }
  }

  // Bend a bone about a MODEL-space axis on top of the clip (parent order; matrices must be fresh).
  const qp = new THREE.Quaternion(), qd = new THREE.Quaternion(), qr = new THREE.Quaternion()
  const bend = (b, axis, ang) => {
    if (!ang) return
    b.parent.getWorldQuaternion(qp).premultiply(qr.copy(root.quaternion).invert()) // parent in model space
    qd.setFromAxisAngle(axis, ang)
    b.quaternion.premultiply(qp.clone().invert().multiply(qd).multiply(qp))
    b.updateMatrixWorld(true)
  }
  const AX = new THREE.Vector3(1, 0, 0)
  const rArm = bone('rightUpperArm'), lArm = bone('leftUpperArm'), spine = bone('spine'), neck = bone('neck')
  // Overhead arc for smash/slam, by clip time u: raise behind the head, hold, whip down, club in the turf, recover.
  const armArc = u => u < 1.0 ? -2.6 * ss(0.05, 1.0, u) : u < 1.25 ? -2.6 - 0.12 * ss(1.0, 1.25, u)
    : u < 1.4 ? -2.72 + 3.6 * ss(1.25, 1.4, u) : u < 1.9 ? 0.88 : 0.88 * (1 - ss(1.9, 2.7, u))
  const lean = u => u < 1.25 ? -0.2 * ss(0.1, 1.0, u) : u < 1.4 ? -0.2 + 0.55 * ss(1.25, 1.4, u) : 0.35 * (1 - ss(1.9, 2.7, u))

  const lt = bone('leftToes'), rt = bone('rightToes'), lf = bone('leftFoot'), rf = bone('rightFoot')
  let yOff = 0
  const hero = ctx.heroPos
  window.__probes.monster = () => ({ state: M.state, hp: M.hp, dist: +Math.hypot(hero.x - pos.x, hero.z - pos.z).toFixed(1), attack: atk ? last : null })

  return {
    update(dt) {
      st += dt
      const dist = Math.hypot(hero.x - pos.x, hero.z - pos.z), leashed = Math.hypot(hero.x - C.x, hero.z - C.z) > LEASH
      M.attack.active = false
      switch (M.state) {
        case 'asleep':
          if (dist < WAKE) notice += dt
          if (notice >= STIR) go('waking', 'Stand Up', { loop: false, fade: 0.4 })
          break
        case 'waking':
          turn(hero.x, hero.z, 0.8, dt)
          if (done) { go('roar', 'Channel (Two-Handed)', { loop: false, fade: 0.25 }); roared = false }
          break
        case 'roar':
          turn(hero.x, hero.z, 1.2, dt)
          if (!roared && st > 0.45) {
            roared = true
            ctx.vfx?.blast(V.set(pos.x, pos.y, pos.z), 13); ctx.vfx?.shake(1, 0.9)
            if (ring) ring.mist = 0.45 // the roar blows the pooled mist outward
          }
          if (done) go('stalk', 'Walk')
          break
        case 'stalk': {
          if (leashed) { go('home', 'Walk'); break }
          const pick = Object.entries(ATTACKS).filter(([k, a]) => dist < a.reach && k !== last)
          if (pick.length && st > 0.4 && turn(hero.x, hero.z, 2, dt) < 0.35) {
            ;[last, atk] = pick[Math.floor(Math.random() * pick.length)]
            struck = false; go('attack', atk.clip, { loop: false, fade: 0.2, speed: atk.wind / atk.windT })
            break
          }
          const run = dist > 7, speed = run ? RUN : WALK
          if (dist > 2.4) { play(run ? 'Run' : 'Walk', { speed: run ? RUN / 3.44 : WALK / 1.21 }); walk(hero.x, hero.z, speed, dt) }
          else play('Idle')
          break
        }
        case 'attack': {
          const t = cur.time
          if (t < atk.wind) turn(hero.x, hero.z, 1.6, dt) // tracks the hero through the wind-up, committed after
          else cur.timeScale = atk.fast
          if (t >= atk.h0 && t <= atk.h1) {
            const a = M.attack
            a.active = true; a.radius = atk.radius; a.dmg = atk.dmg
            if (atk.at === 'foot') lt.getWorldPosition(a.center)
            else club.localToWorld(a.center.copy(HEAD))
            if (atk.at === 'ground') a.center.y = ctx.heightAt(a.center.x, a.center.z)
            if (!struck && atk.swing) { // the stone hits the turf
              struck = true
              W.copy(a.center).setY(ctx.heightAt(a.center.x, a.center.z))
              ctx.vfx?.dust(W, atk.swing === 2 ? 3 : 1.8); ctx.vfx?.shake(atk.swing === 2 ? 0.9 : 0.6, 0.45)
              if (atk.swing === 2) ctx.vfx?.blast(W, 8)
            }
          }
          if (done || t >= (atk.end ?? Infinity)) { endAttack(); pause = 0.5 + Math.random() * 0.8; go('recover', 'Idle', { fade: 0.35 }) }
          break
        }
        case 'recover':
          turn(hero.x, hero.z, 1.5, dt)
          if (st > pause) go('stalk')
          break
        case 'hit': case 'stagger':
          if (done) go('stalk', 'Idle', { fade: 0.25 })
          break
        case 'home':
          if (!leashed && dist < WAKE) { go('stalk', 'Walk'); break }
          if (Math.hypot(home.x - pos.x, home.z - pos.z) > 1) walk(home.x, home.z, WALK, dt)
          else { play('Idle'); turn(hero.x, hero.z, 1, dt) }
          break
      }
      poise = Math.max(0, poise - dt * 8)

      mixer.update(dt)
      const gy = ctx.heightAt(pos.x, pos.z)
      root.position.y = gy + yOff
      root.rotation.y = yaw
      root.updateMatrixWorld(true)
      if (M.state === 'asleep') bend(neck, AX, 0.45) // chin on its chest
      if (M.state === 'attack' && atk.swing) {
        const u = cur.time
        bend(spine, AX, lean(u) * atk.swing * 0.7)
        bend(rArm, AX, armArc(u))
        if (atk.swing === 2) bend(lArm, AX, armArc(u))
      }
      // Feet on the ground: the clips float or sink a little; settle the lowest foot onto the turf (not once dead —
      // lying down, the body is the lowest thing). Toes rest 0.009 and ankles 0.094 above the sole, model units.
      if (M.alive) {
        const low = Math.min(lt.getWorldPosition(V).y - 0.009 * S, rt.getWorldPosition(V).y - 0.009 * S,
          lf.getWorldPosition(V).y - 0.094 * S, rf.getWorldPosition(V).y - 0.094 * S) - gy
        yOff -= low * Math.min(1, dt * 12)
        root.position.y = gy + yOff
      }
    },
  }
}
