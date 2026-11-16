// "It still loads when I turn around": turn the camera a full circle right after the world appears and log every frame.
//   node tools/turn-check.mjs [query]   → one JSON line {frames, p50, worst, over50, over100} (ms). Exit 1 if not ready.
// Headless on a shared desk: compare runs of this tool with each other, do not quote one number alone.
import { createServer } from 'vite'
import puppeteer from 'puppeteer-core'
import { lock } from './lock.mjs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CHROME = process.env.CHROME || `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
const sleep = ms => new Promise(r => setTimeout(r, ms))
const unlock = await lock()
let server, browser, out = { ready: false }
try {
  server = await createServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1' } })
  await server.listen()
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 1280, height: 720 }, args: ['--mute-audio', '--use-angle=metal', '--enable-unsafe-webgpu'] })
  const page = await browser.newPage()
  await page.goto(`${server.resolvedUrls.local[0]}?${process.argv[2] || 'tod=day'}`, { waitUntil: 'domcontentloaded' })
  for (let i = 0; i < 240 && !out.ready; i++) { out.ready = await page.evaluate(() => !!window.__ready); if (!out.ready) await sleep(250) }
  if (out.ready) {
    await page.evaluate(() => { const d = window.__dt = []; let t = performance.now(); const f = n => { d.push(n - t); t = n; requestAnimationFrame(f) }; requestAnimationFrame(f) })
    // drag to look: three sweeps across the window, about 6 s, enough for more than a full turn
    for (let s = 0; s < 3; s++) {
      await page.mouse.move(100, 360); await page.mouse.down()
      for (let x = 100; x <= 1180; x += 12) { await page.mouse.move(x, 360); await sleep(22) }
      await page.mouse.up()
    }
    const d = (await page.evaluate(() => window.__dt)).slice(2).sort((a, b) => a - b)
    Object.assign(out, { frames: d.length, p50: +d[d.length >> 1].toFixed(1), worst: +d.at(-1).toFixed(1), over50: d.filter(v => v > 50).length, over100: d.filter(v => v > 100).length })
  }
} catch (e) { out.error = String(e).slice(0, 300) } finally {
  await browser?.close().catch(() => {})
  await server?.close().catch(() => {})
  unlock()
}
console.log(JSON.stringify(out))
process.exit(out.ready && !out.error ? 0 : 1)
