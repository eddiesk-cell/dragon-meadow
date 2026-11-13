// Record the game WITH its sound: headless Chrome (WebGPU), the screen (as tools/clip.mjs records it) and the master bus
// (after src/audio.js's limiter, as PCM) from the same run, muxed into one mp4. Then check the sound against what moved:
// steps vs the feet's contacts, wingbeats vs the wing's downstrokes, roars vs the ride's call and landing, wind vs speed,
// and the loudness (ffmpeg ebur128). Lane sound, PLAN.md.
//   node tools/audio/capture.mjs shots/sound-walk.mp4 "auto=walk" 20
// audio=log is added to the query. Writes <out>.mp4 and <out>.json (the analysis + the raw timeline); prints the analysis.
import { createServer } from 'vite'
import puppeteer from 'puppeteer-core'
import { lock } from '../lock.mjs'
import { execFileSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const [out, query = '', secs = '20'] = process.argv.slice(2)
if (!out) { console.error('usage: node tools/audio/capture.mjs <out.mp4> [query] [secs]'); process.exit(2) }
const CHROME = process.env.CHROME || `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
const sleep = ms => new Promise(r => setTimeout(r, ms))
const abs = resolve(ROOT, out), webm = abs + '.webm', wav = abs + '.wav'
let server, browser, rec, report = { out, errors: [] }
const unlock = await lock()
try {
  server = await createServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1', hmr: false } }) // other lanes edit src/ meanwhile: no reloads mid-take
  await server.listen()
  // --mute-audio keeps the desk's speakers quiet; Web Audio still renders, and the tap below hears it.
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 1280, height: 720 },
    args: ['--mute-audio', '--use-angle=metal', '--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required'] })
  const page = await browser.newPage()
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
  // The tap: the master bus as 16-bit stereo PCM. An AudioWorklet on the audio thread posts 4096-frame blocks; they queue
  // on the main thread, so a busy frame delays them instead of dropping them (a ScriptProcessor lost 40 % of a 20 s take).
  const rate = await page.evaluate(async () => {
    const l = window.__ctx.audio.listener, ac = l.context
    const src = `registerProcessor('tap', class extends AudioWorkletProcessor {
      constructor() { super(); this.L = new Float32Array(4096); this.R = new Float32Array(4096); this.n = 0 }
      process([i]) { const L = i[0], R = i[1] || L; if (!L) return true
        this.L.set(L, this.n); this.R.set(R, this.n); this.n += L.length
        if (this.n === 4096) { this.port.postMessage([this.L, this.R]); this.L = new Float32Array(4096); this.R = new Float32Array(4096); this.n = 0 }
        return true } })`
    await ac.audioWorklet.addModule(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })))
    const tap = new AudioWorkletNode(ac, 'tap', { channelCount: 2, channelCountMode: 'explicit' }), sink = ac.createGain()
    sink.gain.value = 0; tap.connect(sink).connect(ac.destination); (l.getFilter() || l.gain).connect(tap)
    let parts = []
    tap.port.onmessage = ({ data: [L, R] }) => {
      const p = new Int16Array(L.length * 2)
      for (let i = 0; i < L.length; i++) { p[2 * i] = Math.max(-1, Math.min(1, L[i])) * 32767; p[2 * i + 1] = Math.max(-1, Math.min(1, R[i])) * 32767 }
      parts.push(p)
    }
    window.__rec = { take() {
      const all = new Int16Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0
      for (const p of parts) { all.set(p, o); o += p.length }
      parts = []; const b = new Uint8Array(all.buffer); let s = ''; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode(...b.subarray(i, i + 32768)); return btoa(s) } }
    return ac.sampleRate
  })
  const aStart = Date.now()
  rec = await page.screencast({ path: webm })
  const vStart = Date.now()
  const clocks = () => page.evaluate(() => [performance.now() / 1000, window.__ctx.audio.listener.context.currentTime, window.__ctx.time])
  const c0 = await clocks()
  await page.evaluate(() => (window.__ctx.timeScale = 1))
  report.t0 = +c0[2].toFixed(3) // game time at the video's start: log time − t0 ≈ video time
  const pcm = []
  report.clockTrace = []
  for (let t = 0; t < +secs; t += 4) { await sleep(Math.min(4, +secs - t) * 1000); pcm.push(Buffer.from(await page.evaluate(() => window.__rec.take()), 'base64')); report.clockTrace.push((await clocks()).map(x => +x.toFixed(2)).concat(pcm.reduce((n, b) => n + b.length, 0) / 4 / rate)) }
  const c1 = await clocks()
  report.clocks = { wall: +(c1[0] - c0[0]).toFixed(2), audio: +(c1[1] - c0[1]).toFixed(2), game: +(c1[2] - c0[2]).toFixed(2) } // seconds each clock ran
  if (report.clocks.game < 0.8 * report.clocks.wall) report.errors.push(`capture: the world stalled (game ${report.clocks.game} s of ${report.clocks.wall} s)`)
  const data = await page.evaluate(() => ({ audio: window.__probes.audio(true), ride: window.__probes.ride?.(), errors: window.__errors }))
  await rec.stop(); rec = null // slow on a busy desk (it flushes the webm): the readings above are taken before it
  report.errors.push(...data.errors)

  // WAV, trimmed by the gap between the tap's start and the video's, then muxed.
  const body = Buffer.concat(pcm).subarray(Math.round((vStart - aStart) / 1000 * rate) * 4)
  const head = Buffer.alloc(44)
  head.write('RIFF', 0); head.writeUInt32LE(36 + body.length, 4); head.write('WAVEfmt ', 8); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20)
  head.writeUInt16LE(2, 22); head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34)
  head.write('data', 36); head.writeUInt32LE(body.length, 40)
  writeFileSync(wav, Buffer.concat([head, body]))
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', abs])
  report = { ...report, ...analyse(data.audio, data.ride, ffmpegLoudness(wav)), audioSecs: +(body.length / 4 / rate).toFixed(1) }
  writeFileSync(abs.replace(/\.mp4$/, '') + '.json', JSON.stringify({ ...report, log: data.audio.log, ride: data.ride?.log, feet: data.audio.feet, wings: data.audio.wings }))
} catch (e) {
  report.errors.push('capture: ' + String(e).slice(0, 300))
} finally {
  await rec?.stop().catch(() => {})
  await browser?.close().catch(() => {})
  await server?.close().catch(() => {})
  rmSync(webm, { force: true }); rmSync(wav, { force: true })
  unlock()
}
console.log(JSON.stringify(report))
process.exit(report.errors.length ? 1 : 0)

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
  if (steps.length) { // foot contact, read independently of audio.js's trigger: each fall of a swinging foot (from an apex 8 cm
    // over its stance) ends where its downward speed drops under 15 % of that fall's fastest (the heel strike). Not from the
    // ground speed: this walk clip slides its planted foot at ~0.6 m/s, so a foot never stops. Trace: [t, h, x, z] per foot.
    const t0 = steps[0][0] - 0.5, t1 = steps.at(-1)[0] + 0.5, dts = [], missed = [], extra = []
    const tr = a.feet.filter(f => f[0] >= t0 && f[0] <= t1)
    for (const k of [0, 1]) {
      const h = tr.map(f => f[1 + 3 * k]), stance = [...h].sort((x, y) => x - y)[Math.floor(h.length * 0.05)], contacts = []
      for (let i = 1; i < h.length - 1; i++) {
        if (!(h[i] > stance + 0.08 && h[i] >= h[i - 1] && h[i] > h[i + 1])) continue // an apex
        let j = i + 1, fast = 0
        while (j < h.length - 1) {
          const vy = (h[j - 1] - h[j]) / (tr[j][0] - tr[j - 1][0]); fast = Math.max(fast, vy)
          if (fast > 0.3 && vy < 0.15 * fast) break
          j++
        }
        if (j < h.length - 1) contacts.push(tr[j][0])
        i = j
      }
      const mine = steps.filter(s => s[2] === (k ? 'R' : 'L')).map(s => s[0])
      extra.push(...mine.filter(s => !contacts.some(c => Math.abs(s - c) <= 0.08)).map(s => [k ? 'R' : 'L', s]))
      for (const c of contacts) {
        const near = mine.reduce((b, s) => Math.abs(s - c) < Math.abs(b - c) ? s : b, Infinity)
        if (Math.abs(near - c) <= 0.08) dts.push(Math.round((near - c) * 1000)); else missed.push([k ? 'R' : 'L', +c.toFixed(2), Math.round((near - c) * 1000)])
      }
    }
    const abs = dts.map(Math.abs).sort((x, y) => x - y)
    r.steps = { steps: steps.length, contactsMatched: dts.length, missed, extra, maxAbsMs: abs.at(-1), medianMs: [...dts].sort((x, y) => x - y)[dts.length >> 1], surfaces: [...new Set(steps.map(s => s[3]))] }
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
