// Lane monster — the Barrow Troll: asleep on a stone at the barrow door, wakes, roars, stalks the hero round the
// standing stones, telegraphed attacks, flinches and staggers, dies. Contract: PLAN.md Phase 3 (ctx.monster).
// Design: WORLD.md "The first monster". Club + seat stone: tools/monster/club.py → public/models/club.glb.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const S = 3 / 1.8                  // troll.glb is rigged at 1.80 m; the Barrow Troll stands 3 m
const R = 1.0, WAKE = 25, LEASH = 38, STIR = 1.0
const WALK = 1.6, RUN = 3.6        // m/s; the clips' own stride speeds (measured from their feet) are 1.21 and 3.44
const ss = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k) }
// Attacks in CLIP seconds: the anticipation [0, wind] is slowed to last `windT` game seconds (the telegraph), the
// rest plays at `fast`; the hit window is [h0, h1]; `end` cuts a long clip short. Chosen when the hero is within
// `reach` (centre to centre). `at`: what hurts — the left foot, the club's length, or the ground round the impact.
// `swing` lays the overhead arc on one or both arms (the source clips barely lift them): see arc().
const ATTACKS = {
  kick:  { clip: 'Kick (Front)', wind: 0.35, windT: 0.75, fast: 1.1, h0: 0.42, h1: 0.7, reach: 2.6, radius: 1.0, dmg: 12, at: 'foot' },
  punch: { clip: 'Punch (Cross)', wind: 0.2, windT: 0.6, fast: 1.2, h0: 0.24, h1: 0.4, reach: 2.6, radius: 1.1, dmg: 15, at: 'club' },
  smash: { clip: 'Hammer Overhead Smash', wind: 1.25, windT: 1.25, fast: 1, h0: 1.3, h1: 1.5, end: 2.8, reach: 3.2, radius: 0.9, dmg: 28, at: 'club', swing: 1 },
  slam:  { clip: 'AoE Ground Slam', wind: 1.25, windT: 1.25, fast: 1, h0: 1.4, h1: 1.55, end: 2.8, reach: 4.6, radius: 3.6, dmg: 22, at: 'ground', swing: 2 },
}
for (const a of Object.values(ATTACKS)) a.lands = a.windT + (a.h0 - a.wind) / a.fast // game seconds from start to the hit

export async function createMonster(ctx) {
  const { THREE, scene, params } = ctx
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z)
  const load = n => new GLTFLoader().loadAsync(import.meta.env.BASE_URL + `models/${n}.glb`)
  const [gltf, props] = await Promise.all([load('troll'), load('club')])
  const model = gltf.scene, root = new THREE.Group()
  model.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.frustumCulled = false } })
  root.add(model); root.scale.setScalar(S); scene.add(root)
  const bone = n => model.getObjectByName(n)

  // The club: gripped mid-palm and pinned in the rest pose. Its direction there was solved from the clips (FK) so that
  // in Idle / Walk it hangs forward-down off the right hand, clear of the belly.
  const club = props.scene.getObjectByName('club'), hand = bone('rightHand')
  club.traverse(o => { if (o.isMesh) o.castShadow = true })
  club.scale.setScalar(1 / S)
  club.position.set(-0.8, 1.31, 0.15)
  club.quaternion.setFromUnitVectors(V3(0, 1, 0), V3(-0.458, 0.866, 0.201))
  model.add(club); model.updateMatrixWorld(true); hand.attach(club)
  const HEAD = V3(0, 2.1, 0) // club's own metres: the heavy torn-out foot

  // Home: on a seat stone just outside the barrow door, facing out. The proof views (?fight=1, ?auto=fight) seat it
  // facing the hero they start beside, so the clip sees its face.
  const ring = ctx.ring, C = ring?.center ?? V3(325, 0, 180)
  const D = ring?.barrow?.doorDir ?? V3(-C.x, 0, -C.z).normalize()
  const home = (ring?.barrow?.door ?? C).clone().addScaledVector(D, ring?.barrow ? 1.2 : 0)
  home.y = ctx.heightAt(home.x, home.z)
  const fight = params.get('fight') || params.get('auto') === 'fight'
  let yaw = fight ? 0 : Math.atan2(D.x, D.z)
  const seat = props.scene.getObjectByName('seat')
  seat.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true })
  seat.position.set(home.x - Math.sin(yaw) * 0.5, 0, home.z - Math.cos(yaw) * 0.5)
  seat.position.y = ctx.heightAt(seat.position.x, seat.position.z) + 0.05
  seat.rotation.y = yaw
  scene.add(seat)
  if (params.get('fight')) { ctx.heroPos.set(home.x - 3.5, 0, home.z + 11.5); ctx.heroPos.y = ctx.heightAt(ctx.heroPos.x, ctx.heroPos.z); ctx.heroAct?.face(0, -1) }

  // Clips: crossfaded one at a time; a once-clip clamps and sets `done`.
  const mixer = new THREE.AnimationMixer(model), actions = {}
  for (const c of gltf.animations) actions[c.name] = mixer.clipAction(c)
  let cur = null, done = false
  mixer.addEventListener('finished', e => { if (e.action === cur) done = true })
  const play = (name, { loop = true, fade = 0.3, speed = 1 } = {}) => {
    const a = actions[name]
    if (a === cur) { a.timeScale = speed; return }
    a.reset().setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
    a.clampWhenFinished = !loop; a.timeScale = speed
    a.fadeIn(fade).play(); cur?.fadeOut(fade)
    cur = a; done = false
  }

  const pos = root.position.copy(home), A = V3(), B = V3(), P = V3()
  const M = ctx.monster = {
    pos, radius: R, height: 3, hp: 200, maxHp: 200, alive: true, state: 'asleep',
    // name + lands (game s from the attack's start to its hit window) let a dodge be timed without copying ATTACKS
    attack: { active: false, center: V3(), radius: 1, dmg: 0, name: '', lands: 0 },
    takeHit,
  }
  let st = 0, atk = null, last = '', poise = 0, fx = false, notice = 0, pause = 0, impact = null, flinched = -9
  const go = (state, clip, opts) => { M.state = state; st = 0; fx = false; if (clip) play(clip, opts) }
  go('asleep', 'Sit', { speed: 0.5 })
  const stones = (ring?.stones ?? []).map(s => ({ x: s.pos.x, z: s.pos.z, r: s.radius + R }))

  function takeHit({ dmg = 10 } = {}) {
    if (!M.alive) return
    M.hp = Math.max(0, M.hp - dmg); poise += dmg
    ctx.vfx?.flash(model)
    if (M.state === 'asleep') notice = STIR // a blow wakes it at once
    if (M.hp <= 0) return die()
    if (M.state === 'asleep' || M.state === 'waking' || M.state === 'roar') return
    // A heavy blow or a flurry staggers it (even mid-swing); a light one makes it flinch, at most every 2 s and never
    // mid-swing, so a combo cannot stun-lock it.
    if (dmg >= 40 || poise >= 70) { poise = 0; endAttack(); go('stagger', 'Stagger', { loop: false, fade: 0.1 }) }
    else if (M.state !== 'attack' && ctx.time - flinched > 2) { flinched = ctx.time; go('hit', 'Hit (Front)', { loop: false, fade: 0.1 }) }
  }
  function die() {
    endAttack(); M.alive = false
    go('dead', 'Death (Collapse)', { loop: false, fade: 0.15 })
    if (ring) ring.mist = 0 // the sea breeze clears the bowl (ring.js eases toward it)
  }
  function endAttack() { atk = null; M.attack.active = false; M.attack.name = '' }

  // Turn toward a point at most `rate` rad/s; returns the angle still to go.
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
        const k = (s.r + 0.5 - Math.abs(side)) / (s.r + 0.5) * 2, sg = side >= 0 ? 1 : -1, ex = dx
        dx += dz * sg * k; dz -= ex * sg * k // aim past the stone's far side
      }
    }
    turn(pos.x + dx, pos.z + dz, 3, dt)
    pos.x += Math.sin(yaw) * speed * dt; pos.z += Math.cos(yaw) * speed * dt
    for (const s of stones) {
      const ox = pos.x - s.x, oz = pos.z - s.z, d = Math.hypot(ox, oz)
      if (d < s.r) { pos.x = s.x + ox / d * s.r; pos.z = s.z + oz / d * s.r }
    }
  }

  // Pose layers on top of the clip, in MODEL space (the troll faces +Z). Each call needs fresh parent matrices and
  // refreshes the bone's own subtree, so call them parent-first.
  const qp = new THREE.Quaternion(), qd = new THREE.Quaternion(), qm = new THREE.Quaternion(), qa = new THREE.Quaternion(), I = new THREE.Quaternion()
  const toModel = v => v.applyQuaternion(qm.copy(root.quaternion).invert())
  const rotate = (b, q) => {
    b.parent.getWorldQuaternion(qp).premultiply(qm.copy(root.quaternion).invert())
    b.quaternion.premultiply(qd.copy(qp).invert().multiply(q).multiply(qp))
    b.updateMatrixWorld(true)
  }
  const aim = (b, from, to, w) => rotate(b, qa.setFromUnitVectors(from, to).slerp(I, 1 - w))
  const mix = (out, a, b, s) => out.copy(a).applyQuaternion(qa.setFromUnitVectors(a, b).slerp(I, 1 - s))
  const AX = V3(1, 0, 0), UP = V3(0, 1, 0)
  const shoulderR = bone('rightUpperArm'), elbowR = bone('rightLowerArm'), shoulderL = bone('leftUpperArm'), elbowL = bone('leftLowerArm')
  const spine = bone('spine'), neck = bone('neck')
  // The overhead blows, solved with FK so the stone's head meets the turf ~1.4 m ahead once the feet are grounded.
  // Wind-up: arm up and back, the stone raised high behind the head. Strikes, by `swing`: 1 = a one-handed diagonal
  // chop into the ground ahead-left (the stone stays in view beside the hero instead of hiding behind him);
  // 2 = the two-handed slam, deeper bow, straight down. Model-space directions; lean in radians (forward +).
  const n = (x, y, z) => V3(x, y, z).normalize()
  const WIND = { arm: n(-0.15, 1, -0.3), club: n(-0.1, 0.85, -0.5), lean: -0.2 }
  const STRIKE = [null, { arm: n(0.1, -0.45, 0.9), club: n(0.35, -0.75, 0.55), lean: 0.4 }, { arm: n(0, -0.6, 0.8), club: n(0.1, -0.9, 0.4), lean: 0.75 }]
  // By clip time u → [weight of the layer, 0 wind-up … 1 strike]: rise, hold, an accelerating whip down, rest, recover.
  const arc = u => u < 1.25 ? [ss(0.05, 0.95, u), 0] : u < 1.9 ? [1, Math.min(1, ((u - 1.25) / 0.15) ** 2)] : [1 - ss(1.9, 2.7, u), 1]
  const armDir = (sh, el) => toModel(el.getWorldPosition(A).sub(sh.getWorldPosition(B)).normalize())
  const T1 = V3(), T2 = V3()
  function overhead(u, swing) {
    const [w, s] = arc(u), K = STRIKE[swing]
    if (w <= 0) return
    rotate(spine, qa.setFromAxisAngle(AX, (WIND.lean + (K.lean - WIND.lean) * s) * w))
    mix(T1, WIND.arm, K.arm, s)
    aim(shoulderR, armDir(shoulderR, elbowR), T1, w)
    if (swing === 2) aim(shoulderL, armDir(shoulderL, elbowL), T2.copy(T1).setX(-T1.x), w)
    mix(T1, WIND.club, K.club, s)
    aim(hand, toModel(P.copy(UP).applyQuaternion(club.getWorldQuaternion(qd))), T1, w)
  }

  const lt = bone('leftToes'), rt = bone('rightToes'), lf = bone('leftFoot'), rf = bone('rightFoot')
  const seg = new THREE.Line3()
  let yOff = 0
  const hero = ctx.heroPos
  window.__probes.monster = () => ({ state: M.state, hp: M.hp, dist: +Math.hypot(hero.x - pos.x, hero.z - pos.z).toFixed(1), attack: M.attack.name || null, impact, at: [pos.x, pos.y, pos.z].map(v => +v.toFixed(2)) })

  return {
    update(dt) {
      st += dt
      const dist = Math.hypot(hero.x - pos.x, hero.z - pos.z), leashed = Math.hypot(hero.x - C.x, hero.z - C.z) > LEASH
      M.attack.active = false
      switch (M.state) {
        case 'asleep':
          if (dist < WAKE) notice += dt
          if (notice >= STIR) go('waking', 'Stand Up', { loop: false, fade: 0.4, speed: 1.5 })
          break
        case 'waking':
          turn(hero.x, hero.z, 0.8, dt)
          if (done) go('roar', 'Channel (Two-Handed)', { loop: false, fade: 0.25, speed: 1.3 })
          break
        case 'roar':
          turn(hero.x, hero.z, 1.2, dt)
          if (!fx && st > 0.35) {
            fx = true
            ctx.vfx?.blast(pos, 13); ctx.vfx?.shake(1, 0.9)
            if (ring) ring.mist = 0.45 // the roar blows the pooled mist outward
          }
          if (done) go('stalk', 'Walk')
          break
        case 'stalk': {
          if (leashed) { go('home', 'Walk'); break }
          if (params.get('fight') === 'end' && st > 1.5) { takeHit({ dmg: M.hp }); break } // proof view: the fall
          // The opener is always the overhead smash — the clearest wind-up; after that, any blow in reach but the last.
          const pick = Object.entries(ATTACKS).filter(([k, a]) => dist < a.reach && (last ? k !== last : k === 'smash'))
          if (pick.length && st > 0.2 && turn(hero.x, hero.z, 2.5, dt) < 0.35) {
            const [name, a] = pick[Math.floor(Math.random() * pick.length)]
            atk = a; last = name; Object.assign(M.attack, { name, lands: a.lands })
            go('attack', a.clip, { loop: false, fade: 0.2, speed: a.wind / a.windT })
            break
          }
          const run = dist > 5, speed = run ? RUN : WALK
          if (dist > 2.4) { play(run ? 'Run' : 'Walk', { speed: run ? RUN / 3.44 : WALK / 1.21 }); walk(hero.x, hero.z, speed, dt) }
          else play('Idle')
          break
        }
        case 'attack': {
          const u = cur.time, a = M.attack
          if (u < atk.wind) turn(hero.x, hero.z, 1.6, dt) // tracks the hero through the wind-up, committed after
          else cur.timeScale = atk.fast
          if (u >= atk.h0 && u <= atk.h1) {
            a.active = true; a.radius = atk.radius; a.dmg = atk.dmg
            if (atk.at === 'foot') lt.getWorldPosition(a.center)
            else { // the point of the stone nearest the hero's chest
              club.getWorldPosition(seg.start); club.localToWorld(seg.end.copy(HEAD))
              seg.closestPointToPoint(P.set(hero.x, hero.y + 1, hero.z), true, a.center)
              if (atk.at === 'ground') { club.localToWorld(a.center.copy(HEAD)); a.center.y = ctx.heightAt(a.center.x, a.center.z) }
            }
          }
          if (atk.swing && !fx && u >= atk.h0 + 0.1) { // the stone meets the turf
            fx = true
            club.localToWorld(P.copy(HEAD)); club.getWorldPosition(A)
            impact = { head: +(P.y - ctx.heightAt(P.x, P.z)).toFixed(2), grip: +(A.y - pos.y).toFixed(2), ahead: +((P.x - pos.x) * Math.sin(yaw) + (P.z - pos.z) * Math.cos(yaw)).toFixed(2), u: +u.toFixed(2) }
            P.y = ctx.heightAt(P.x, P.z)
            ctx.vfx?.dust(P, atk.swing === 2 ? 3 : 1.8); ctx.vfx?.shake(atk.swing === 2 ? 0.9 : 0.6, 0.45)
            if (atk.swing === 2) ctx.vfx?.blast(P, 8)
          }
          if (done || u >= (atk.end ?? Infinity)) { endAttack(); pause = 0.5 + Math.random() * 0.8; go('recover', 'Idle', { fade: 0.35 }) }
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
        case 'dead':
          if (!fx && cur.time > 0.95) { fx = true; ctx.vfx?.dust(pos, 2.5); ctx.vfx?.shake(0.5, 0.4) } // it hits the ground
          break
      }
      poise = Math.max(0, poise - dt * 8)

      mixer.update(dt)
      const gy = ctx.heightAt(pos.x, pos.z)
      root.position.y = gy + yOff
      root.rotation.y = yaw
      root.updateMatrixWorld(true)
      if (M.state === 'asleep') rotate(neck, qa.setFromAxisAngle(AX, 0.22)) // head nodding on its chest
      if (M.state === 'attack' && atk.swing) overhead(cur.time, atk.swing)
      // Feet on the ground: the clips float or sink a little; settle the lowest foot onto the turf (not once dead —
      // lying down, the body is the lowest thing). Toes rest 0.009 and ankles 0.094 above the sole, model units.
      if (M.alive) {
        const low = Math.min(lt.getWorldPosition(A).y - 0.009 * S, rt.getWorldPosition(A).y - 0.009 * S,
          lf.getWorldPosition(A).y - 0.094 * S, rf.getWorldPosition(A).y - 0.094 * S) - gy
        yOff -= low * Math.min(1, dt * 12)
        root.position.y = gy + yOff
      }
    },
  }
}
