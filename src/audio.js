// Lane sound — PLAN.md "Lane sound". Day and night beds and themes crossfading with ctx.night, water lapping at the pond's
// nearest shore, the towns' murmur and a far bell; the hero's steps (grass, stone, water) on his feet's real contacts, jump
// and land, sword swings and hits; the troll's grunts and club impacts; the dragon's wingbeats on each downstroke, its roar
// when it comes down and lands, and the wind rising with its speed under the rider. Every file is in public/audio/, made
// locally by tools/audio/gen.py (sounds.json lists them). Reads ctx and the other modules' probes only.
// Silent until the first key or click (browsers require one); M mutes; ?audio=off leaves it out. Publishes ctx.audio = { listener, play }.
// ?audio=log keeps a timeline in __probes.audio().log; __probes.audio(true) adds the traces of the feet (height, x, z) and
// the wing tip (tools/audio/capture.mjs reads the feet's contacts from where they plant, not from this file's height rule).
export async function createAudio(ctx) {
  const { THREE, scene, camera, params, heroPos } = ctx
  if (params.get('audio') === 'off') return null // A/B: the world without its sound
  const { smoothstep } = THREE.MathUtils
  const listener = new THREE.AudioListener()
  camera.add(listener)
  const ac = listener.context
  const lim = ac.createDynamicsCompressor() // limiter on the master: stacked sounds never clip
  for (const [k, v] of Object.entries({ threshold: -10, knee: 0, ratio: 20, attack: 0.002, release: 0.25 })) lim[k].value = v
  listener.setFilter(lim)
  const MASTER = 0.6 // the whole mix sits at about -17 LUFS (tools/audio/capture.mjs measures it)
  let muted = false
  listener.setMasterVolume(MASTER)
  const wake = () => ac.state === 'running' || ac.resume()
  addEventListener('pointerdown', wake)
  addEventListener('keydown', e => { wake(); if (e.key.toLowerCase() === 'm' && !e.repeat) listener.setMasterVolume((muted = !muted) ? 0 : MASTER) })

  const LOG = params.get('audio') === 'log', log = [], feet = [], wings = []
  const note = (...e) => { if (LOG && log.length < 5000) log.push([+ctx.time.toFixed(3), ...e]) }
  const trace = (list, row) => { if (LOG) { list.push(row); if (list.length > 6000) list.shift() } }

  // Loaded in the background: the world never waits for its sound.
  const base = import.meta.env.BASE_URL + 'audio/'
  let buf = null, leadMs = 0
  fetch(base + 'sounds.json').then(r => r.json()).then(async man => {
    const b = {}
    await Promise.all(Object.entries(man).map(([n, s]) => // a sound that fails is reported and left out; the rest still play
      Promise.all(s.files.map(f => fetch(base + f).then(r => r.arrayBuffer()).then(a => ac.decodeAudioData(a))))
        .then(x => (b[n] = x), e => window.__errors.push(`audio: ${n}: ${e?.message || e}`))))
    for (const n of ['step-grass', 'step-stone', 'step-water', 'wingbeat']) for (const x of b[n] || []) { // decoder delay, if any
      const d = x.getChannelData(0); let i = 0; while (i < d.length && Math.abs(d[i]) < 0.05) i++
      leadMs = Math.max(leadMs, i / x.sampleRate * 1000)
    }
    buf = b; startLoops()
  }).catch(e => window.__errors.push(`audio: ${e?.message || e}`))

  // One-shots: a pool of positional voices, one random take per call, pitch varied ±6 %.
  const pool = Array.from({ length: 16 }, () => { const a = new THREE.PositionalAudio(listener); scene.add(a); return a })
  let pi = 0
  const play = (name, pos, { gain = 1, rate = 1, ref = 6 } = {}) => {
    const takes = buf?.[name]
    if (!takes) return
    const a = pool[pi++ % pool.length]
    if (a.isPlaying) a.stop()
    a.position.copy(pos); a.updateMatrixWorld()
    a.setBuffer(takes[Math.floor(Math.random() * takes.length)])
    a.setRefDistance(ref); a.setPlaybackRate(rate * (0.94 + Math.random() * 0.12)); a.setVolume(gain); a.play()
  }
  ctx.audio = { listener, play }

  // Loops: beds, themes and wind follow the camera; water and towns sit in the world.
  const v = new THREE.Vector3(), loops = {}
  const loop = (name, at, ref = 1, max = 1) => {
    if (!buf[name]) return null
    const a = at ? new THREE.PositionalAudio(listener) : new THREE.Audio(listener)
    if (at) { a.setDistanceModel('linear'); a.setRefDistance(ref); a.setMaxDistance(max); a.position.copy(at); scene.add(a) }
    a.setBuffer(buf[name][0]); a.setLoop(true); a.setVolume(0); a.offset = Math.random() * a.buffer.duration; a.play()
    return a
  }
  // shortcut: Springwell's centre is PLAN's fixed spot and its streets a 60 m disc; upgrade when settlements publishes them.
  // Crestwatch and the harbour city Asterhaven (198 m walls) from the settlements probe.
  const st = window.__probes.settlements?.(), crest = st?.crestwatch?.at ?? [-122, -390], city = st?.asterhaven?.at ?? [-1500, 650]
  const towns = [[-75, 500, 60], [crest[0], crest[1], 70], [city[0], city[1], 200]].map(([x, z, r]) => ({ x, z, r, p: new THREE.Vector3(x, ctx.heightAt(x, z) + 6, z) }))
  // The pond as points 2 m apart: the water source moves to the one nearest the camera, so it laps at the shore you are near.
  const pond = ctx.pond, wet = []
  if (pond) for (let x = -60; x <= 60; x += 2) for (let z = -60; z <= 60; z += 2) if (pond.inside(pond.x + x, pond.z + z) > 0) wet.push([pond.x + x, pond.z + z])
  function startLoops() {
    for (const n of ['theme-day', 'theme-night', 'bed-day', 'bed-night', 'chimes', 'wind']) loops[n] = loop(n)
    if (wet.length) loops.water = loop('water', v.set(pond.x, pond.level, pond.z), 3, 45)
    towns.forEach((t, i) => (loops['town' + i] = loop('town', t.p, t.r / 3, t.r * 2.8))) // heard ~2.8 radii out
    note('loops', Object.keys(loops).filter(k => loops[k]).join(' '))
  }

  // Hero: a step when a foot that swung clear (8 cm over its stance) ends its fall (its downward speed under a fifth of
  // that fall's fastest): the heel strike, on any clip. The slow roll onto the sole that follows is not the step.
  const bones = ['leftFoot', 'rightFoot'].map(n => ctx.heroRig?.model.getObjectByName(n)).filter(Boolean)
  const foot = bones.map(() => ({ floor: Infinity, armed: false, h: 0, fast: 0, top: -Infinity }))
  const ring = ctx.ring
  const surface = (x, z) => pond?.inside(x, z) > 0 ? 'step-water'
    : (ring && Math.hypot(x - ring.center.x, z - ring.center.z) < ring.radius + 3) || towns.some(t => Math.hypot(x - t.x, z - t.z) < t.r) ? 'step-stone' : 'step-grass'
  const last = new THREE.Vector3().copy(heroPos), dragonAt = new THREE.Vector3()
  let speed = 0, air = false, airT = 0, swing = null, swingU = 0, hits = 0, atk = null, mState = '', impact = null
  let dState = ctx.dragon?.state, wy = 0, wvy = 0, wLow = Infinity, dSpeed = 0, windAmt = 0, mixT = 0, bellT = 20
  const wing = ctx.dragon?.model.getObjectByName('wing-l-hand')
  if (ctx.dragon && !wing) console.warn('audio: the dragon has no wing-l-hand bone, so no wingbeats')
  const mix = {}

  window.__probes.audio = full => ({ loaded: !!buf, state: ac.state, muted, sounds: buf && Object.keys(buf).length, leadMs: +leadMs.toFixed(1),
    mix: Object.fromEntries(Object.entries(mix).map(([k, g]) => [k, +g.toFixed(3)])), ...(LOG && { log }), ...(full && { feet, wings }) })

  return {
    update(dt) {
      if (!buf || dt <= 0) return
      const ride = window.__probes.ride?.().mode ?? 'foot', onFoot = ride === 'foot'
      speed += (Math.hypot(heroPos.x - last.x, heroPos.z - last.z) / dt - speed) * Math.min(1, dt * 8)
      const rise = heroPos.y - last.y
      last.copy(heroPos)

      // Steps, from the bones (any clip, any speed: walk, run, combat footwork).
      const hs = []
      bones.forEach((b, k) => {
        b.getWorldPosition(v)
        const h = v.y - heroPos.y, s = foot[k] // over his own feet's level: the clip's foot height, not the ground under it (a shore)
        hs.push(+h.toFixed(3), +v.x.toFixed(3), +v.z.toFixed(3))
        s.floor = Math.min(h, s.floor + dt * 0.08) // follows a new stance height (another clip) within a stride
        const fall = (s.h - h) / dt // m/s downward
        if (h > s.floor + 0.08) s.armed = true
        if (s.armed) s.fast = Math.max(s.fast, fall), s.top = Math.max(s.top, h)
        // the swing's fall has ended (a run lands 5 cm over the stance it rolls down to, so: half way down, not at the floor)
        if (s.armed && s.fast > 0.3 && fall < 0.2 * s.fast && s.top - h > 0.5 * (s.top - s.floor)) {
          s.armed = false; s.fast = 0; s.top = -Infinity
          if (onFoot && speed > 0.5 && !air) {
            const n = surface(v.x, v.z)
            play(n, v, { gain: speed > 3 ? 0.9 : 0.55, rate: speed > 3 ? 1.08 : 1 }); note('step', k ? 'R' : 'L', n)
          }
        }
        s.h = h
      })
      if (hs.length) trace(feet, [+ctx.time.toFixed(3), ...hs])

      // Jump and land.
      const gap = heroPos.y - ctx.heightAt(heroPos.x, heroPos.z)
      // a jump leaves the ground upward (the spawn settling down onto it is not one)
      if (onFoot && !air && gap > 0.12 && rise > 0) { air = true; airT = 0; play('jump', heroPos, { gain: 0.5 }); note('jump') }
      if (air && (airT += dt) && (gap < 0.03 || !onFoot)) { air = false; if (onFoot && airT > 0.2) { play('land', heroPos, { gain: 0.8 }); note('land') } }

      // Sword: a new swing (a new clip, or the same clip started again), a new hit on the troll.
      const c = window.__probes.combat?.(), m = ctx.monster
      if (c) {
        if (c.swing && (c.swing !== swing || c.u < swingU)) { play('swing', heroPos, { gain: 0.7 }); note('swing', c.swing) }
        swing = c.swing; swingU = c.u ?? 0
        if (c.hits > hits) { play('hit', m?.pos ?? heroPos, { gain: 0.9 }); note('hit') }
        hits = c.hits
      }
      // Troll: a grunt as each attack winds up, a deep one for its roar, a thud when the club meets the turf or it falls.
      const mp = window.__probes.monster?.()
      if (mp && m) {
        if (mp.attack && mp.attack !== atk) { play('troll-grunt', m.pos, { gain: 0.9, ref: 8 }); note('troll-grunt', mp.attack) }
        atk = mp.attack
        if (mp.state !== mState && (mp.state === 'roar' || mp.state === 'dead')) {
          play(mp.state === 'roar' ? 'troll-grunt' : 'troll-impact', m.pos, { gain: 1.2, rate: 0.75, ref: 10 }); note('troll-' + mp.state)
        }
        mState = mp.state
        if (mp.impact && mp.impact !== impact) { play('troll-impact', m.pos, { gain: 1.2, ref: 10 }); note('troll-impact') }
        impact = mp.impact
      }

      // Dragon: a roar as it comes down (called, or on its own) and as it touches down; a wingbeat at the top of each
      // stroke (the wing tip turning down, measured in the dragon's own frame); wind under the rider rising with its speed.
      const D = ctx.dragon
      if (D) {
        dSpeed += (D.holder.position.distanceTo(dragonAt) / dt - dSpeed) * Math.min(1, dt * 4)
        dragonAt.copy(D.holder.position)
        if (D.state !== dState && (D.state === 'land' || D.state === 'touch')) {
          play('roar', D.holder.position, { gain: 1.3, ref: 30 }); note('roar', D.state)
          if (D.state === 'touch') play('troll-impact', D.holder.position, { gain: 0.8, rate: 0.8, ref: 20 })
        }
        dState = D.state
        if (wing) {
          wing.getWorldPosition(v); D.holder.worldToLocal(v)
          const vy = (v.y - wy) / dt
          if (wvy > 0 && vy <= 0 && wy - wLow > 1) { play('wingbeat', D.holder.position, { gain: 1, ref: 25 }); note('wing', +wy.toFixed(2)); wLow = wy }
          wLow = Math.min(wLow, v.y); wy = v.y; wvy = vy
          trace(wings, [+ctx.time.toFixed(3), +v.y.toFixed(3)])
        }
      }
      windAmt += ((ride === 'ride' ? smoothstep(dSpeed, 4, 28) : 0) - windAmt) * Math.min(1, dt * 2)

      // A far bell from Springwell's church: three tolls about once a minute.
      if ((bellT -= dt) < 0) { bellT = 50 + Math.random() * 25; for (let k = 0; k < 3; k++) setTimeout(() => play('bell', towns[0].p, { gain: 1, ref: 60 }), k * 2600); note('bell') }

      // Water: the source moves to the pond point nearest the camera.
      if (loops.water) {
        let best = Infinity, bx = 0, bz = 0
        for (const [x, z] of wet) { const d = (x - camera.position.x) ** 2 + (z - camera.position.z) ** 2; if (d < best) { best = d; bx = x; bz = z } }
        loops.water.position.set(bx, pond.level, bz)
      }
      const n = ctx.night, air2 = 1 - 0.6 * windAmt
      Object.assign(mix, {
        'theme-day': 0.3 * Math.sqrt(1 - n), 'theme-night': 0.3 * Math.sqrt(n),
        'bed-day': 0.6 * (1 - n) * air2, 'bed-night': 0.55 * n * air2, chimes: 0.3 * n,
        wind: 0.9 * windAmt, water: 0.8, town0: 0.7, town1: 0.7, town2: 0.8,
      })
      for (const [k, g] of Object.entries(mix)) loops[k]?.setVolume(g)
      loops.wind?.setPlaybackRate(0.85 + 0.35 * windAmt)
      if ((mixT -= dt) < 0) { mixT = 1; note('mix', Object.fromEntries(Object.entries(mix).map(([k, g]) => [k, +g.toFixed(2)])), +dSpeed.toFixed(1)) }
    },
  }
}
