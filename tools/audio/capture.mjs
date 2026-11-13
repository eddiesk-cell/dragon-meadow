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
let server, browser, report = { out, errors: [] }
const unlock = await lock()
try {
  server = await createServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1' } })
  await server.listen()
  // --mute-audio keeps the desk's speakers quiet; Web Audio still renders, and the tap below hears it.
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 1280, height: 720 },
    args: ['--mute-audio', '--use-angle=metal', '--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required'] })
  const page = await browser.newPage()
  page.on('pageerror', e => report.errors.push(String(e).slice(0, 300)))
  await page.goto(`${server.resolvedUrls.local[0]}?${query}${query ? '&' : ''}audio=log`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__ready && window.__probes.audio?.().loaded, { timeout: 90000 })
  await page.evaluate(() => document.getElementById('hint')?.remove())
  await sleep(1500)
  // The tap: the master bus as 16-bit stereo PCM, collected in the page and pulled every few seconds.
  const rate = await page.evaluate(() => {
    const l = window.__ctx.audio.listener, ac = l.context, sp = ac.createScriptProcessor(4096, 2, 2), sink = ac.createGain()
    sink.gain.value = 0; sp.connect(sink).connect(ac.destination); (l.getFilter() || l.gain).connect(sp)
    let parts = []
    sp.onaudioprocess = e => {
      const L = e.inputBuffer.getChannelData(0), R = e.inputBuffer.getChannelData(1), p = new Int16Array(L.length * 2)
      for (let i = 0; i < L.length; i++) { p[2 * i] = Math.max(-1, Math.min(1, L[i])) * 32767; p[2 * i + 1] = Math.max(-1, Math.min(1, R[i])) * 32767 }
      parts.push(p)
    }
    window.__rec = { node: sp, take() {
      const all = new Int16Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0
      for (const p of parts) { all.set(p, o); o += p.length }
      parts = []; const b = new Uint8Array(all.buffer); let s = ''; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode(...b.subarray(i, i + 32768)); return btoa(s) } }
    return ac.sampleRate
  })
  const aStart = Date.now()
  const rec = await page.screencast({ path: webm })
  const vStart = Date.now()
  const pcm = []
  for (let t = 0; t < +secs; t += 4) { await sleep(Math.min(4, +secs - t) * 1000); pcm.push(Buffer.from(await page.evaluate(() => window.__rec.take()), 'base64')) }
  await rec.stop()
  const data = await page.evaluate(() => ({ audio: window.__probes.audio(true), ride: window.__probes.ride?.(), errors: window.__errors }))
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
  writeFileSync(abs.replace(/\.mp4$/, '') + '.json', JSON.stringify({ ...report, log: data.audio.log, ride: data.ride?.log }, null, 1))
} catch (e) {
  report.errors.push('capture: ' + String(e).slice(0, 300))
} finally {
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
  if (steps.length) { // foot contact: the first frame of each stance at its lowest (within 5 mm), stance = under the foot's level + 4 cm
    const t0 = steps[0][0] - 0.5, t1 = steps.at(-1)[0] + 0.5, dts = [], missed = []
    for (const k of [0, 1]) {
      const tr = a.feet.filter(f => f[0] >= t0 && f[0] <= t1).map(f => [f[0], f[1 + k]])
      const level = [...tr.map(f => f[1])].sort((x, y) => x - y)[Math.floor(tr.length * 0.05)]
      const contacts = []
      for (let i = 0; i < tr.length;) {
        if (tr[i][1] >= level + 0.04) { i++; continue }
        let j = i; while (j < tr.length && tr[j][1] < level + 0.04) j++
        const run = tr.slice(i, j), lo = Math.min(...run.map(f => f[1]))
        if (i > 0 && j < tr.length) contacts.push(run.find(f => f[1] <= lo + 0.005)[0]) // whole dips only
        i = j
      }
      const mine = steps.filter(s => s[2] === (k ? 'R' : 'L')).map(s => s[0])
      for (const c of contacts) {
        const near = mine.reduce((b, s) => Math.abs(s - c) < Math.abs(b - c) ? s : b, Infinity)
        if (Math.abs(near - c) <= 0.08) dts.push(Math.round((near - c) * 1000)); else missed.push(+c.toFixed(2))
      }
    }
    const abs = dts.map(Math.abs).sort((x, y) => x - y)
    r.steps = { steps: steps.length, contactsMatched: dts.length, missed, maxAbsMs: abs.at(-1), medianMs: [...dts].sort((x, y) => x - y)[dts.length >> 1], surfaces: [...new Set(steps.map(s => s[3]))] }
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
