// Real-key proof: click the canvas, press E with the browser's own keyboard, watch the dragon.
//   node tools/press.mjs <out.png> [query] [seconds] [pressAtSec]
// Prints {states:[[t,state]...], gap (m dragon-hero at the end), hint, errors}. Exit 1 unless it reached 'landed' within 25 m.
import { createServer } from 'vite'
import puppeteer from 'puppeteer-core'
import { lock } from './lock.mjs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [out, query = '', secs = '25', at = '1'] = process.argv.slice(2)
const CHROME = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
const sleep = ms => new Promise(r => setTimeout(r, ms))
const unlock = await lock(); let server, browser; const r = { states: [], errors: [] }
try {
  server = await createServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1' } }); await server.listen()
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 1280, height: 720 }, args: ['--mute-audio', '--use-angle=metal', '--enable-unsafe-webgpu'] })
  const page = await browser.newPage()
  page.on('pageerror', e => r.errors.push(String(e).slice(0, 200))); page.on('console', m => m.type() === 'error' && !m.text().startsWith('Failed to load') && r.errors.push(m.text().slice(0, 200)))
  await page.goto(`${server.resolvedUrls.local[0]}?${query}`, { waitUntil: 'domcontentloaded' })
  let ready = false; for (let i = 0; i < 120 && !ready; i++) { ready = await page.evaluate(() => !!window.__ready); if (!ready) await sleep(500) }
  await sleep(1500); await page.mouse.click(640, 360); await sleep((+at || 0) * 1000) // a click on the canvas, like a player starting to look around
  if (at === 'late') { // the owner's case: no E; wait for it to land by itself, then press E and see what happens
    for (let i = 0; i < 240; i++) { const st = await page.evaluate(() => window.__probes.dragon().state); if (st === 'landed') break; await sleep(500) }
    r.selfLanded = await page.evaluate(() => { const d = window.__probes.dragon(), h = window.__probes.hero(); return +Math.hypot(d.x - h.x, d.z - h.z).toFixed(1) })
    await sleep(1500)
  }
  await page.keyboard.press('e')
  let last = ''
  for (let i = 0; i < +secs * 2; i++) {
    const s = await page.evaluate(() => { const d = window.__probes.dragon(), h = window.__probes.hero(); return { st: d.state, gap: Math.hypot(d.x - h.x, d.z - h.z), hint: [...document.querySelectorAll('div')].map(e => e.textContent).filter(t => /dragon|E —|room/.test(t) && t.length < 60).join('|') } })
    if (s.st !== last) r.states.push([i / 2, s.st]), last = s.st
    if (i === 0) r.hint0 = s.hint
    r.gap = +s.gap.toFixed(1); r.hint = s.hint; r.final = s.st
    if (s.st === 'landed' && (at !== 'late' || i > 6)) break
    await sleep(500)
  }
  r.dragon = await page.evaluate(() => window.__probes.dragon())
  await page.screenshot({ path: resolve(ROOT, out) })
  r.errors.push(...await page.evaluate(() => window.__errors || []))
} catch (e) { r.errors.push('press: ' + e) } finally { await browser?.close().catch(() => {}); await server?.close().catch(() => {}); unlock() }
console.log(JSON.stringify(r)); process.exit(r.final === 'landed' && r.gap < 25 && !r.errors.length ? 0 : 1)
