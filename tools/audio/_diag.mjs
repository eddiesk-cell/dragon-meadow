import { createServer } from 'vite'
import puppeteer from 'puppeteer-core'
import { lock } from '../lock.mjs'
const CHROME = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
const sleep = ms => new Promise(r => setTimeout(r, ms))
const unlock = await lock()
let server, browser
try {
  server = await createServer({ root: process.cwd(), logLevel: 'error', server: { host: '127.0.0.1', hmr: false } })
  await server.listen()
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 1280, height: 720 }, args: ['--mute-audio', '--use-angle=metal', '--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required'] })
  const page = await browser.newPage()
  await page.goto(`${server.resolvedUrls.local[0]}?${process.argv[2]}`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { window.__n = 0; const f = () => { window.__n++; requestAnimationFrame(f) }; requestAnimationFrame(f) })
  const t = Date.now(), rows = []
  const shoot = process.argv[3] === 'cast'
  let rec
  for (let i = 0; i < 30; i++) {
    rows.push(await page.evaluate(() => [performance.now() / 1000, window.__ctx?.time, window.__n, !!window.__ready, window.__ctx?.audio?.listener.context.currentTime].map(x => typeof x === 'number' ? +x.toFixed(2) : x)))
    if (shoot && i === 2) rec = await page.screencast({ path: process.env.TMPDIR + '/diag.webm' })
    await sleep(1000)
  }
  await rec?.stop()
  console.log(rows.map(r => r.join(' ')).join('\n'))
} finally { await browser?.close(); await server?.close(); unlock() }
