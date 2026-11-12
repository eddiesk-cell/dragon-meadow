// Record a short clip of the running scene (headless Chrome screencast → mp4).
//   node tools/clip.mjs shots/walk.mp4 "auto=walk" 8
import { createServer } from 'vite'
import puppeteer from 'puppeteer-core'
import { lock } from './lock.mjs'
import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [out, query = '', secs = '8'] = process.argv.slice(2)
const CHROME = process.env.CHROME || `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
let server, browser
const webm = resolve(ROOT, out + '.webm')
const unlock = await lock()
try {
  server = await createServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1' } })
  await server.listen()
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 1280, height: 720 }, args: ['--mute-audio', '--use-angle=metal', '--enable-unsafe-webgpu'] })
  const page = await browser.newPage()
  await page.goto(`${server.resolvedUrls.local[0]}?${query}`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__ready, { timeout: 60000 })
  await page.evaluate(() => document.getElementById('hint')?.remove())
  await new Promise(r => setTimeout(r, 1500))
  const rec = await page.screencast({ path: webm })
  await new Promise(r => setTimeout(r, +secs * 1000))
  await rec.stop()
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', resolve(ROOT, out)])
  console.log('wrote', out)
} finally {
  await browser?.close().catch(() => {})
  await server?.close().catch(() => {})
  rmSync(webm, { force: true })
  unlock()
}
