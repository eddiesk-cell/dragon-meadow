// One headless Chrome at a time on this shared desk: every capture tool takes this lock.
import { mkdirSync, rmSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const LOCK = resolve(dirname(fileURLToPath(import.meta.url)), '../shots/.lock')
export async function lock() {
  mkdirSync(dirname(LOCK), { recursive: true })
  for (let i = 0; ; i++) {
    try { mkdirSync(LOCK); return () => rmSync(LOCK, { recursive: true, force: true }) } catch {
      try { if (Date.now() - statSync(LOCK).mtimeMs > 180000) rmSync(LOCK, { recursive: true }) } catch {}
      if (i > 400) throw new Error('capture lock busy for 10 min')
      await new Promise(r => setTimeout(r, 1500))
    }
  }
}
