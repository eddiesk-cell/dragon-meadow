// Real-input check of the hero controls (trusted keyboard + mouse, headless Chrome).
//   node tools/controls-check.mjs   → prints each step, exit 1 on any failed expectation.
import { createServer } from 'vite'
import puppeteer from 'puppeteer-core'
import { lock } from './lock.mjs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CHROME = process.env.CHROME || `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
const sleep = ms => new Promise(r => setTimeout(r, ms))
let server, browser, bad = 0
const expect = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`, JSON.stringify(got)); if (!ok) bad++ }
const unlock = await lock()
try {
  server = await createServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1' } })
  await server.listen()
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 1280, height: 720 }, args: ['--mute-audio', '--use-angle=metal', '--enable-unsafe-webgpu'] })
  const page = await browser.newPage()
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__ready, { timeout: 60000 })
  await page.mouse.click(5, 5) // a visitor clicks into the page first: that gives it keyboard focus
  await page.waitForFunction(() => window.__ctx.time > 1.5, { timeout: 60000 }) // sim clock really running, not just wall time
  const hero = () => page.evaluate(() => window.__probes.hero())
  const cam = () => page.evaluate(() => window.__ctx.camera.position.toArray())
  const gap = () => page.evaluate(() => { const { heroPos: p, heightAt } = window.__ctx; return p.y - heightAt(p.x, p.z) })

  await page.keyboard.down('w'); await sleep(2000)
  let h = await hero(); expect('W walks forward (-Z)', h.clip === 'Walk' && h.z < -1, h)
  await page.keyboard.down('Shift'); await sleep(1500)
  let h2 = await hero(); expect('Shift+W runs', h2.clip === 'Run' && h2.z < h.z - 2, h2)
  await page.keyboard.up('Shift'); await page.keyboard.up('w'); await sleep(600)
  h = await hero(); expect('release → Idle, feet on ground', h.clip === 'Idle' && Math.abs(h.feetGap) < 0.05, h)

  await page.keyboard.press('Space'); let peak = 0
  for (let i = 0; i < 12; i++) { await sleep(50); peak = Math.max(peak, await gap()) }
  await sleep(1200); expect('Space jumps and lands', peak > 0.3 && Math.abs(await gap()) < 0.05, { peak })

  const c0 = await cam()
  await page.mouse.move(640, 400); await page.mouse.down()
  for (let i = 1; i <= 10; i++) { await page.mouse.move(640 + i * 25, 400); await sleep(20) }
  await page.mouse.up(); await sleep(800)
  const c1 = await cam(), moved = Math.hypot(c1[0] - c0[0], c1[2] - c0[2])
  expect('mouse drag orbits the camera', moved > 1, { moved: +moved.toFixed(2) })

  await page.keyboard.down('w'); await sleep(1500); await page.keyboard.up('w')
  h2 = await hero(); expect('W follows the new camera direction', Math.abs(h2.x - h.x) > 0.5, h2)
  const errs = await page.evaluate(() => window.__errors); expect('no module errors', !errs.length, errs)
} catch (e) { console.log('FAIL harness', String(e)); bad++ }
finally { await browser?.close().catch(() => {}); await server?.close().catch(() => {}); unlock() }
process.exit(bad ? 1 : 0)
