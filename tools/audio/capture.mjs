// Record the game WITH its sound: headless Chrome (WebGPU), frame by frame at a fixed clock (60 fps, whatever the desk's
// load), the master bus (after src/audio.js's limiter, as PCM) held to the same clock, muxed into one mp4. Then check the sound against what moved:
// steps vs the feet's contacts, wingbeats vs the wing's downstrokes, roars vs the ride's call and landing, wind vs speed,
// and the loudness (ffmpeg ebur128). Lane sound, PLAN.md.
//   node tools/audio/capture.mjs shots/sound-walk.mp4 "auto=walk" 20      (auto=run 10, auto=ride 40, "auto=walk&tod=night" 20)
// audio=log is added to the query. Writes <out>.mp4 and <out>.json (the analysis + the raw timeline); prints the analysis.
import { createServer } from 'vite'
import puppeteer from 'puppeteer-core'
import { lock } from '../lock.mjs'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const [out, query = '', secs = '20'] = process.argv.slice(2)
if (!out) { console.error('usage: node tools/audio/capture.mjs <out.mp4> [query] [secs]'); process.exit(2) }
if (out.endsWith('.json')) { // re-check a take already recorded: node tools/audio/capture.mjs shots/sound-run.json
  const j = JSON.parse(readFileSync(resolve(ROOT, out), 'utf8'))
  const r = analyse({ log: j.log, feet: j.feet, wings: j.wingTrace, state: j.state, leadMs: j.leadMs }, { log: j.ride }, j.loudness)
  console.log(JSON.stringify({ steps: r.steps, wings: r.wings, loudness: r.loudness })); process.exit(r.steps?.pass === false ? 1 : 0)
}
const CHROME = process.env.CHROME || `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
const sleep = ms => new Promise(r => setTimeout(r, ms))
const abs = resolve(ROOT, out), webm = abs + '.v.mp4', wav = abs + '.wav'
let server, browser, page, rec, report = { out, errors: [] }
const unlock = await lock()
try {
  server = await createServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1', hmr: false } }) // other lanes edit src/ meanwhile: no reloads mid-take
  await server.listen()
  // --mute-audio keeps the desk's speakers quiet; Web Audio still renders, and the tap below hears it.
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 1280, height: 720 },
    args: ['--mute-audio', '--use-angle=metal', '--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required'] })
  page = await browser.newPage()
  page.on('pageerror', e => report.errors.push(String(e).slice(0, 300)))
  await page.goto(`${server.resolvedUrls.local[0]}?${query}${query ? '&' : ''}audio=log`, { waitUntil: 'domcontentloaded' })
  // The world is held almost still (timeScale 1e-4, never 0: modules divide by dt) from its first frame until the GPU has
  // warmed up: on a busy desk its first dozen frames can take 25 s, and auto=ride calls the dragon at 1 s of game time.
  // Then the take starts at game time ~0 with the world running at speed, as a player starts once it has loaded.
  await page.waitForFunction(() => window.__ctx, { polling: 10, timeout: 60000 })
  await page.evaluate(() => { window.__ctx.timeScale = 1e-4; window.__n = 0; const f = () => { window.__n++; requestAnimationFrame(f) }; requestAnimationFrame(f) })
  await page.waitForFunction(() => window.__ready && window.__probes.audio?.().loaded, { polling: 200, timeout: 180000 })
  for (let ok = 0, i = 0; ok < 2; i++) { // two seconds in a row at ≥ 40 frames
    if (i > 120) throw new Error('the page never reached 40 fps')
    const n0 = await page.evaluate(() => window.__n); await sleep(1000); ok = (await page.evaluate(() => window.__n)) - n0 >= 40 ? ok + 1 : 0
  }
  await page.evaluate(() => document.getElementById('hint')?.remove())
  // The tap: the master bus as 16-bit stereo PCM. An AudioWorklet on the audio thread posts 4096-frame blocks, each with
  // the audio frame it starts at, so the take is cut out by audio time, exactly.
  const rate = await page.evaluate(async () => {
    const l = window.__ctx.audio.listener, ac = l.context
    const src = `registerProcessor('tap', class extends AudioWorkletProcessor {
      constructor() { super(); this.L = new Float32Array(4096); this.R = new Float32Array(4096); this.n = 0 }
      process([i]) { const L = i[0], R = i[1] || L; if (!L) return true
        this.L.set(L, this.n); this.R.set(R, this.n); this.n += L.length
        if (this.n === 4096) { this.port.postMessage([this.L, this.R, currentFrame + L.length - 4096]); this.L = new Float32Array(4096); this.R = new Float32Array(4096); this.n = 0 }
        return true } })`
    await ac.audioWorklet.addModule(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })))
    const tap = new AudioWorkletNode(ac, 'tap', { channelCount: 2, channelCountMode: 'explicit' }), sink = ac.createGain()
    sink.gain.value = 0; tap.connect(sink).connect(ac.destination); (l.getFilter() || l.gain).connect(tap)
    const parts = []
    tap.port.onmessage = ({ data }) => parts.push(data)
    window.__rec = { take(from, n) { // frames [from, from + n) as interleaved int16, base64
      const out = new Int16Array(n * 2)
      for (const [L, R, s] of parts) for (let i = Math.max(0, from - s); i < L.length && s + i - from < n; i++) {
        const f = s + i - from; out[2 * f] = Math.max(-1, Math.min(1, L[i])) * 32767; out[2 * f + 1] = Math.max(-1, Math.min(1, R[i])) * 32767
      }
      const b = new Uint8Array(out.buffer); let s = ''; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode(...b.subarray(i, i + 32768)); return btoa(s) } }
    return ac.sampleRate
  })
  // The take, frame by frame at a fixed clock: each frame the world steps 1/FPS, the audio clock runs to that frame's end
  // and is held, then the frame is grabbed. Picture and sound share one timeline and every frame is drawn, however busy
  // the desk. (A real-time screencast gave ~14 frames a second and drifted 3 s behind its sound; an in-page MediaRecorder
  // cost the game 20 fps.)
  const FPS = 60, N = Math.round(+secs * FPS), cdp = await page.createCDPSession()
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', webm], { stdio: ['pipe', 'inherit', 'inherit'] })
  const base = await page.evaluate(async () => {
    const ac = window.__ctx.audio.listener.context
    await ac.suspend(); window.__film(); window.__ctx.timeScale = 1
    return ac.currentTime
  })
  rec = ff
  report.t0 = +(await page.evaluate(() => window.__ctx.time)).toFixed(3) // game time at the video's start: log time − t0 = video time
  const w0 = performance.now()
  for (let k = 0; k < N; k++) {
    await page.evaluate(async (dt, end) => {
      window.__step(dt)
      const ac = window.__ctx.audio.listener.context
      if (ac.currentTime < end) { await ac.resume(); while (ac.currentTime < end) await new Promise(r => setTimeout(r, 0)); await ac.suspend() }
    }, 1 / FPS, base + (k + 1) / FPS + 0.1 * (k === N - 1)) // the last frame runs 0.1 s on, so the tap posts the take's last block
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 95, optimizeForSpeed: true })
    if (!ff.stdin.write(Buffer.from(data, 'base64'))) await once(ff.stdin, 'drain')
  }
  ff.stdin.end(); await once(ff, 'close'); rec = null
  report.capture = { frames: N, framesPerWallSec: +(N / ((performance.now() - w0) / 1000)).toFixed(1), game: +((await page.evaluate(() => window.__ctx.time)) - report.t0).toFixed(3) }
  if (Math.abs(report.capture.game - N / FPS) > 0.01) report.errors.push(`capture: the world ran ${report.capture.game} s of ${N / FPS}`)
  await sleep(300) // the tap's last messages
  const body = Buffer.from(await page.evaluate((f, n) => window.__rec.take(f, n), Math.round(base * rate), Math.round(N / FPS * rate)), 'base64')
  const data = await page.evaluate(() => ({ audio: window.__probes.audio(true), ride: window.__probes.ride?.(), errors: window.__errors }))
  report.errors.push(...data.errors)

  const head = Buffer.alloc(44)
  head.write('RIFF', 0); head.writeUInt32LE(36 + body.length, 4); head.write('WAVEfmt ', 8); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20)
  head.writeUInt16LE(2, 22); head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34)
  head.write('data', 36); head.writeUInt32LE(body.length, 40)
  writeFileSync(wav, Buffer.concat([head, body]))
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', abs])
  report.file = fileCheck(abs, N / FPS)
  if (!report.file.ok) report.errors.push('capture: the file ' + JSON.stringify(report.file))
  report = { ...report, ...analyse(data.audio, data.ride, ffmpegLoudness(wav)), audioSecs: +(body.length / 4 / rate).toFixed(1) }
  writeFileSync(abs.replace(/\.mp4$/, '') + '.json', JSON.stringify({ ...report, log: data.audio.log, ride: data.ride?.log, feet: data.audio.feet, wingTrace: data.audio.wings }))
} catch (e) {
  report.errors.push('capture: ' + String(e).slice(0, 300))
} finally {
  rec?.kill()
  await browser?.close().catch(() => {})
  await server?.close().catch(() => {})
  rmSync(webm, { force: true }); rmSync(wav, { force: true })
  unlock()
}
console.log(JSON.stringify(report))
process.exit(report.errors.length ? 1 : 0)

// What the FILE shows, not what the game rendered: distinct frames a second (a frame within 0.3/255 of the one before, at
// 160x90 grey, is a repeat), the longest freeze, and each stream's length against the take's (a picture that runs long
// or short has drifted from the sound).
function fileCheck(file, want) {
  const len = s => +execFileSync('ffprobe', ['-v', 'error', '-select_streams', s, '-show_entries', 'stream=duration:format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).split(/[\s,]+/).map(parseFloat).find(x => x > 0) // stream length, else the file's (N/A for a copied stream)
  const g = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-vf', 'scale=160:90,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 30 })
  const ts = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', file], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter(Boolean).map(parseFloat)
  const W = 160 * 90, n = Math.floor(g.length / W)
  let distinct = 1, freeze = 0, last = ts[0] ?? 0
  for (let i = 1; i < n; i++) {
    let d = 0; for (let k = 0; k < W; k += 4) d += Math.abs(g[i * W + k] - g[(i - 1) * W + k])
    if (d / (W / 4) >= 0.3) { distinct++; freeze = Math.max(freeze, (ts[i] ?? last) - last); last = ts[i] ?? last }
  }
  const v = len('v'), a = len('a'), r = { frames: n, distinctFps: +(distinct / v).toFixed(1), freezeS: +freeze.toFixed(2), videoS: v, audioS: a, wantS: want }
  r.ok = r.distinctFps >= 45 && r.freezeS <= 0.15 && Math.abs(v - want) <= 0.1 && Math.abs(a - v) <= 0.15
  return r
}

function ffmpegLoudness(file) { // ebur128 summary: integrated loudness (LUFS) and true peak (dBFS)
  const r = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats -i "${file}" -af ebur128=peak=true -f null - 2>&1`], { encoding: 'utf8' })
  const s = r.slice(r.lastIndexOf('Summary:'))
  return { lufs: +s.match(/I:\s+(-?[\d.]+) LUFS/)[1], peakDb: +s.match(/Peak:\s+(-?[\d.inf]+) dBFS/)[1] }
}

// The checks, measured from the traces audio.js kept — an independent reading of the same motion, not its trigger rule.
function analyse(a, ride, loud) {
  const ev = name => a.log.filter(e => e[1] === name)
  const steps = ev('step'), r = { loudness: loud, state: a.state, leadMs: a.leadMs, counts: {} }
  for (const e of a.log) if (!['mix', 'loops'].includes(e[1])) r.counts[e[1]] = (r.counts[e[1]] || 0) + 1
  if (steps.length) { // foot contacts, found from the motion alone: the start of each planted interval, after the foot swung
    // clear (6 cm over its floor). Planted = the foot within 3 cm of its floor (its lowest over the 1.2 s around it) AND its
    // world speed under a quarter of its swing's fastest (the 0.6 s before). Not the end of a fall: a sprinting foot pauses
    // mid-swing at ~0.4 m while still moving at 9 m/s. Counted where audio.js may step (column 7: on foot, moving, not in the
    // air; older traces: around the steps). Trace row: [t, hL, xL, zL, hR, xR, zR, gate].
    const F = a.feet, T = F.map(f => f[0]), ok = F.map(f => f[7] ?? (f[0] > steps[0][0] - 0.5 && f[0] < steps.at(-1)[0] + 0.5))
    const over = (i, back, ahead, arr, fn) => { let m = arr[i]; for (let q = i; q >= 0 && T[q] >= T[i] - back; q--) m = fn(m, arr[q]); for (let q = i; q < T.length && T[q] <= T[i] + ahead; q++) m = fn(m, arr[q]); return m }
    const dts = [], missed = [], extra = []
    for (const k of [0, 1]) {
      const h = F.map(f => f[1 + 3 * k]), sp = F.map((f, i) => T[i] > T[i - 1] ? Math.hypot(f[2 + 3 * k] - F[i - 1][2 + 3 * k], f[3 + 3 * k] - F[i - 1][3 + 3 * k]) / (T[i] - T[i - 1]) : 0)
      const contacts = []
      for (let i = 1, swung = false; i < T.length; i++) {
        const floor = over(i, 0.6, 0.6, h, Math.min)
        if (h[i] > floor + 0.06) swung = true
        if (swung && h[i] < floor + 0.03 && sp[i] < 0.25 * over(i, 0.6, 0, sp, Math.max)) { swung = false; if (ok[i]) contacts.push(T[i]) }
      }
      const mine = steps.filter(s => s[2] === (k ? 'R' : 'L')).map(s => s[0])
      const near = (x, list) => list.reduce((b, y) => Math.abs(y - x) < Math.abs(b - x) ? y : b, Infinity)
      // an extra step is one with no contact within 80 ms (a mid-swing step, or a second step on one contact)
      extra.push(...mine.filter(s => Math.abs(near(s, contacts) - s) > 0.08 || near(near(s, contacts), mine) !== s).map(s => [k ? 'R' : 'L', s]))
      for (const c of contacts) {
        const s = near(c, mine)
        if (Math.abs(s - c) <= 0.08) dts.push(Math.round((s - c) * 1000)); else missed.push([k ? 'R' : 'L', +c.toFixed(2), Math.round((s - c) * 1000)])
      }
    }
    const abs = dts.map(Math.abs).sort((x, y) => x - y)
    r.steps = { pass: !missed.length && !extra.length && dts.length > 0, steps: steps.length, contacts: dts.length + missed.length, contactsMatched: dts.length,
      missed, extra, maxAbsMs: abs.at(-1), medianMs: [...dts].sort((x, y) => x - y)[dts.length >> 1], surfaces: [...new Set(steps.map(s => s[3]))] }
  }
  const wingsEv = ev('wing')
  if (wingsEv.length) { // a downstroke follows: the wing tip is lower 0.15 s later
    const at = t => a.wings.reduce((b, w) => Math.abs(w[0] - t) < Math.abs(b[0] - t) ? w : b, [Infinity, 0])[1]
    r.wings = { beats: wingsEv.length, onDownstroke: wingsEv.filter(e => at(e[0] + 0.15) < at(e[0]) - 0.2).length }
  }
  const mix = ev('mix')
  r.roars = ev('roar').map(e => [e[0], e[2]])
  r.rideLog = ride?.log
  r.mix = mix.filter((_, i) => i % 5 === 0).map(e => [e[0], { dayBed: e[2]['bed-day'], nightBed: e[2]['bed-night'], themeDay: e[2]['theme-day'], themeNight: e[2]['theme-night'], wind: e[2].wind }, e[3]])
  return r
}
