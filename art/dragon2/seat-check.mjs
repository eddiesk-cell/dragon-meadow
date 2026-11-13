// Is the hero sitting ON the saddle? Plays ?auto=ride&ridecam=side to the end and, twice a second while he is mounted,
// casts a ray down the saddle's own up axis (the seat empty rides chest; straight down in level flight), from 1 m over
// his hips onto the skinned body: gap = saddle surface - hips (m, + = sunk in). Along the world or the flight frame
// instead, the landing flare tips the cantle (and higher up, the neck) into the ray.
//   node art/dragon2/seat-check.mjs [shotPrefix]   -> shots/<prefix>-{mounted,flight,turn}[-close].png, one JSON line
import { createServer } from 'vite'
import puppeteer from 'puppeteer-core'
import { renameSync } from 'node:fs'
import { lock } from '../../tools/lock.mjs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), pre = process.argv[2] || 'dragon2-seat'
const CHROME = process.env.CHROME || `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
const sleep = ms => new Promise(r => setTimeout(r, ms))
const unlock = await lock()
let server, browser, res = { errors: [], consoleErrors: [], samples: {}, shots: [], trace: [] }
try {
  server = await createServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1' } }); await server.listen()
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 2 },
    args: ['--mute-audio', '--use-angle=metal', '--enable-unsafe-webgpu'] })
  const page = await browser.newPage()
  page.on('pageerror', e => res.consoleErrors.push(String(e).slice(0, 300)))
  page.on('console', m => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && res.consoleErrors.push(m.text().slice(0, 300)))
  await page.goto(`${server.resolvedUrls.local[0]}?auto=ride&ridecam=side`, { waitUntil: 'domcontentloaded' })
  for (let i = 0; i < 120 && !(await page.evaluate(() => !!window.__ready)); i++) await sleep(500)
  const snap = async (name, clip) => { const f = resolve(ROOT, `shots/${pre}-${name}.png`); await page.screenshot({ path: f + '.tmp.png', clip }); renameSync(f + '.tmp.png', f); res.shots.push(`shots/${pre}-${name}.png`) }
  const shot = async name => { await snap(name); await snap(name + '-close', { x: 490, y: 200, width: 300, height: 220 }) } // ridecam=side looks at the seat: frame centre
  let rideT0 = null
  for (let i = 0; i < 400; i++) {
    const s = await page.evaluate(() => {
      const c = window.__ctx, THREE = c.THREE, r = window.__probes.ride(), d = c.dragon
      if (r.mode !== 'ride') return { mode: r.mode, done: r.log.some(e => e[0] === 'onFoot'), t: r.t }
      const hips = c.heroRig.model.getObjectByName('hips').getWorldPosition(new THREE.Vector3()), body = []
      d.model.traverse(o => o.isSkinnedMesh && /body/.test(o.name) && (o.computeBoundingSphere(), body.push(o)))
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(d.seat.getWorldQuaternion(new THREE.Quaternion())) // the saddle's up: it rides chest
      const hit = new THREE.Raycaster(hips.clone().addScaledVector(up, 1), up.clone().negate()).intersectObjects(body, false)[0]
      return { mode: r.mode, t: r.t, state: d.state, gap: hit ? +(1 - hit.distance).toFixed(3) : null, off: +hips.distanceTo(d.seat.getWorldPosition(new THREE.Vector3())).toFixed(3), hitAt: hit && d.model.worldToLocal(hit.point.clone()).toArray().map(x => +x.toFixed(2)) }
    })
    if (s.done) break
    if (s.mode === 'ride') {
      (res.samples[s.state] ??= []).push(s.gap); res.trace.push([s.t, s.state, s.gap, s.off, s.hitAt])
      rideT0 ??= s.t
      if (!res.shots.length && s.state !== 'landed') await shot('mounted')
      else if (res.shots.length === 2 && s.t - rideT0 > 9) await shot('flight')
      else if (res.shots.length === 4 && s.t - rideT0 > 20) await shot('turn')
    }
    await sleep(500)
  }
  res.errors = await page.evaluate(() => window.__errors || [])
  res.ride = await page.evaluate(() => { const r = window.__probes.ride(), d = window.__probes.dragon(); return { log: r.log, over: r.over, isleGap: d.isleGap, treeGap: d.treeGap, flown: d.flown } })
} catch (e) { res.consoleErrors.push('seat-check: ' + String(e).slice(0, 300)) } finally {
  await browser?.close().catch(() => {}); await server?.close().catch(() => {}); unlock()
}
const all = Object.values(res.samples).flat().filter(g => g !== null)
res.gap = { n: all.length, missed: Object.values(res.samples).flat().length - all.length, min: Math.min(...all), max: Math.max(...all),
  byState: Object.fromEntries(Object.entries(res.samples).map(([k, v]) => [k, [Math.min(...v), Math.max(...v), v.length]])) }
delete res.samples
console.log(JSON.stringify(res))
process.exit(!res.errors.length && !res.consoleErrors.length && all.length && Math.max(...all.map(Math.abs)) <= 0.08 ? 0 : 1)
