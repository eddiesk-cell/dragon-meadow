// Measure every roaming creature's body and step once, and write public/models/bestiary/measures.json for src/roam.js.
// Run after ANY bestiary model or ROAM-table change:  node tools/measure-roam.mjs   (closes its own server and browser)
import { createServer } from 'vite'
import puppeteer from 'puppeteer-core'
import { writeFileSync } from 'node:fs'
import { lock } from './lock.mjs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CHROME = process.env.CHROME || `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
const sleep = ms => new Promise(r => setTimeout(r, ms))
const unlock = await lock(); let server, browser, code = 1
try {
  server = await createServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1' } }); await server.listen()
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 640, height: 360 }, args: ['--mute-audio', '--use-angle=metal', '--enable-unsafe-webgpu'] })
  const page = await browser.newPage()
  await page.goto(`${server.resolvedUrls.local[0]}?tod=day&measure=1`, { waitUntil: 'domcontentloaded' })
  let got = {}, want = 0
  for (let i = 0; i < 480; i++) { // up to 4 minutes: one creature loads every 1.5 s
    await sleep(500)
    ;[got, want] = await page.evaluate(() => [window.__measures || {}, window.__roamCount || 0]).catch(() => [{}, 0])
    if (want && Object.keys(got).length >= want) break
  }
  const n = Object.keys(got).length
  if (!want || n < want) throw new Error(`measured ${n} of ${want} creatures`)
  writeFileSync(resolve(ROOT, 'public/models/bestiary/measures.json'), JSON.stringify(got))
  console.log(`measures.json: ${n} creatures`, Object.entries(got).map(([k, v]) => `${k}:${v.gait ? v.gait.walkN : '-'}`).join(' ')); code = 0
} catch (e) { console.error('measure-roam: ' + String(e).slice(0, 300)) } finally {
  await browser?.close().catch(() => {}); await server?.close().catch(() => {}); unlock()
}
process.exit(code)
