// One headless Chrome at a time on this shared desk: every capture tool takes this lock.
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const LOCK = resolve(dirname(fileURLToPath(import.meta.url)), '../shots/.lock')
export async function lock() {
  mkdirSync(dirname(LOCK), { recursive: true })
  for (let i = 0; ; i++) {
    try {
      mkdirSync(LOCK)
      // The full headless Chrome draws nothing while the desk's display is off (every shot times out, 2026-11-13): wake
      // it and keep it on while the lock is held. -w ends caffeinate with this process, even if it dies.
      const awake = spawn('caffeinate', ['-d', '-u', '-w', String(process.pid)], { stdio: 'ignore' })
      return () => { awake.kill(); rmSync(LOCK, { recursive: true, force: true }) }
    } catch {
      try { if (Date.now() - statSync(LOCK).mtimeMs > 180000) rmSync(LOCK, { recursive: true }) } catch {}
      if (i > 400) throw new Error('capture lock busy for 10 min')
      await new Promise(r => setTimeout(r, 1500))
    }
  }
}
