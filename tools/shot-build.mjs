// Screenshot a PRODUCTION build (vite preview), to prove a built copy draws the world: node tools/shot-build.mjs <outDir> <out.png>
import { preview } from 'vite'
import puppeteer from 'puppeteer-core'
import { lock } from './lock.mjs'
const [outDir, out] = process.argv.slice(2)
const CHROME = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
const unlock = await lock(); let server, browser
try {
  server = await preview({ root: new URL('..', import.meta.url).pathname, build: { outDir }, preview: { host: '127.0.0.1', port: 4319 }, logLevel: 'error' })
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 1280, height: 720 }, args: ['--mute-audio', '--use-angle=metal', '--enable-unsafe-webgpu'] })
  const page = await browser.newPage(); const errs = []
  page.on('pageerror', e => errs.push(String(e).slice(0, 200))); page.on('response', r => r.status() >= 400 && !r.url().endsWith('favicon.ico') && errs.push(r.status() + ' ' + r.url()))
  await page.goto(server.resolvedUrls.local[0] + '?auto=walk', { waitUntil: 'domcontentloaded' })
  let ready = false; for (let i = 0; i < 120 && !ready; i++) { ready = await page.evaluate(() => !!window.__ready); if (!ready) await new Promise(r => setTimeout(r, 500)) }
  await new Promise(r => setTimeout(r, 5000))
  const info = await page.evaluate(() => ({ errors: window.__errors || [], probes: Object.keys(window.__probes || {}) }))
  await page.screenshot({ path: out }); console.log(JSON.stringify({ ready, errs, ...info }))
} finally { await browser?.close().catch(() => {}); await new Promise(r => server?.httpServer.close(r)); unlock() }
