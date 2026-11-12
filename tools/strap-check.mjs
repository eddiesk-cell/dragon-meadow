// Does the scabbard sit ON the hero's back — not off it, not inside it — per clip, over 2 s of motion.
//   node tools/strap-check.mjs  → one JSON line per clip {clip, mid, tip, buried}
// mid/tip: metres from the scabbard's middle / real end to the nearest skinned vertex (max over 8 samples).
// buried: points along the scabbard's OUTER face and both crossguard ends found INSIDE him (a ray cast away
// from his back crosses his skin an odd number of times), i.e. it vanishes into him. Pressing the inner face into
// the vest where it rests is how a strapped scabbard sits. Distance alone cannot tell inside from outside.
// where: {pointIndex: deepest burial in metres} — 0-1 the crossguard ends, 2+ every 0.09 m down from the mouth.
// Pass: nothing buried deeper than 1 cm (the leather's own thickness; the run swings the shoulder blades out)
// and mid ≤ 0.08 (a rigid scabbard bridges the hollow of the back) in idle, walk and run;
// tip is reported, failing only past 0.22 (the concept holds it ~0.1 m out beside the thigh; run swings the legs away).
import { createServer } from 'vite'
import puppeteer from 'puppeteer-core'
import { lock } from './lock.mjs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CHROME = process.env.CHROME || `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
const sleep = ms => new Promise(r => setTimeout(r, ms))
const unlock = await lock()
let server, browser, ok = true
try {
  server = await createServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1' } })
  await server.listen()
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-unsafe-webgpu'] })
  for (const auto of ['', 'walk', 'run']) {
    const page = await browser.newPage()
    await page.goto(`${server.resolvedUrls.local[0]}?auto=${auto}`, { waitUntil: 'domcontentloaded' })
    for (let i = 0; i < 120 && !(await page.evaluate(() => !!window.__ready)); i++) await sleep(500)
    await sleep(1500)
    const r = await page.evaluate(async () => {
      const { THREE, heroRig } = window.__ctx
      const meshes = []; heroRig.model.traverse(o => o.isSkinnedMesh && meshes.push(o))
      const v = new THREE.Vector3(), mid = new THREE.Vector3(), tip = new THREE.Vector3(), back = new THREE.Vector3()
      const ray = new THREE.Raycaster(); ray.far = 5
      let worst = { mid: 0, tip: 0 }, buried = 0; const where = {}
      for (let k = 0; k < 8; k++) {   // 8 samples, 250 ms apart: catches the lean at any phase of the cycle
        await new Promise(res => setTimeout(res, 250))
        heroRig.sheath.localToWorld(mid.set(0, -0.53, 0)); heroRig.sheath.localToWorld(tip.set(0, -1.075, 0))
        for (const m of meshes) m.computeBoundingSphere()   // skinned: the sphere follows the pose
        back.set(0, 0, -1).transformDirection(heroRig.sheath.matrixWorld)   // sheath +Z faces his front
        const pts = [-0.155, 0.155].map(x => heroRig.sword.localToWorld(new THREE.Vector3(x, 0.115, 0)))
        for (let y = -0.05; y >= -1.05; y -= 0.1) pts.push(heroRig.sheath.localToWorld(new THREE.Vector3(0, y, -0.016)))
        pts.forEach((q, k) => {   // k 0-1: crossguard ends; 2+: every 0.1 (×0.9 m) down the scabbard
          ray.set(q, back); const hits = ray.intersectObjects(meshes, false)
          if (hits.length % 2 && hits[0].distance > 0.01) { buried++; where[k] = Math.max(where[k] || 0, +hits[0].distance.toFixed(3)) }   // depth to get out
        })
        let dm = Infinity, dt = Infinity
        for (const m of meshes) for (let i = 0, n = m.geometry.attributes.position.count; i < n; i += 2) {
          m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld)
          dm = Math.min(dm, v.distanceTo(mid)); dt = Math.min(dt, v.distanceTo(tip))
        }
        worst = { mid: Math.max(worst.mid, dm), tip: Math.max(worst.tip, dt) }
      }
      const h = window.__probes.hero(); return { clip: h.clip, skin: h.strapSkin, lift: h.strapLift, mid: +worst.mid.toFixed(3), tip: +worst.tip.toFixed(3), buried, where, errors: window.__errors }
    })
    if (r.buried || r.mid > 0.08 || r.tip > 0.22 || r.errors.some(e => e.startsWith("hero"))) ok = false
    console.log(JSON.stringify(r))
    await page.close()
  }
} finally {
  await browser?.close().catch(() => {})
  await server?.close().catch(() => {})
  unlock()
}
process.exit(ok ? 0 : 1)
