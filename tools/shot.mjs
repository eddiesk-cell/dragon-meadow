// One self-contained capture: start vite, open headless Chrome (WebGPU), screenshot, close BOTH.
//   node tools/shot.mjs <out.png> [query] [waitMs]
//   e.g. node tools/shot.mjs shots/hero-walk.png "auto=walk" 4000
// Prints one JSON line {ready, errors, consoleErrors, out}. Exit 1 if the page never got ready or logged errors.
// Captures queue on a lock so lanes never run two Chromes at once on this busy desk.
import { createServer } from 'vite'
import puppeteer from 'puppeteer-core'
import { mkdirSync, renameSync } from 'node:fs'
import { lock } from './lock.mjs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [out, query = '', waitMs = '3000'] = process.argv.slice(2)
if (!out) { console.error('usage: node tools/shot.mjs <out.png> [query] [waitMs]'); process.exit(2) }
const CHROME = process.env.CHROME || `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
const sleep = ms => new Promise(r => setTimeout(r, ms))

const unlock = await lock()
let server, browser, result = { ready: false, errors: [], consoleErrors: [], out }
try {
  server = await createServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1' } })
  await server.listen()
  const url = server.resolvedUrls.local[0]
  browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
    args: ['--mute-audio', '--use-angle=metal', '--enable-unsafe-webgpu'],
  })
  const page = await browser.newPage()
  // 404s are reported with their URL by the response hook, so drop the URL-less console copy.
  page.on('console', m => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && result.consoleErrors.push(m.text().slice(0, 300)))
  page.on('response', r => r.status() >= 400 && !r.url().endsWith('favicon.ico') && result.consoleErrors.push(`${r.status()} ${r.url()}`))
  page.on('pageerror', e => result.consoleErrors.push(String(e).slice(0, 300)))
  await page.goto(`${url}?${query}`, { waitUntil: 'domcontentloaded' })
  for (let i = 0; i < 120 && !result.ready; i++) { result.ready = await page.evaluate(() => !!window.__ready); if (!result.ready) await sleep(500) }
  await sleep(+waitMs)
  await page.evaluate(() => document.getElementById('hint')?.remove())
  result.errors = await page.evaluate(() => window.__errors || [])
  // Frames per second over 3 s, as the page itself sees them (headless, shared GPU: compare runs, don't quote alone).
  result.fps = await page.evaluate(() => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; requestAnimationFrame(f) }; requestAnimationFrame(f); setTimeout(() => res(+(n / ((performance.now() - t0) / 1000)).toFixed(1)), 3000) }))
  result.probes = await page.evaluate(() => Object.fromEntries(Object.entries(window.__probes || {}).map(([k, f]) => { try { return [k, f()] } catch (e) { return [k, 'ERR ' + e.message] } })))
  const abs = resolve(ROOT, out)
  mkdirSync(dirname(abs), { recursive: true })
  await page.screenshot({ path: abs + '.tmp.png' })
  renameSync(abs + '.tmp.png', abs)
} catch (e) {
  result.consoleErrors.push('shot: ' + String(e).slice(0, 300))
} finally {
  await browser?.close().catch(() => {})
  await server?.close().catch(() => {})
  unlock()
}
console.log(JSON.stringify(result))
process.exit(result.ready && !result.errors.length && !result.consoleErrors.length ? 0 : 1)
