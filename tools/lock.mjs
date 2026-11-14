// One headless Chrome at a time on this shared desk: every capture tool takes this lock.
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const LOCK = resolve(dirname(fileURLToPath(import.meta.url)), '../shots/.lock')
export async function lock() {
  mkdirSync(dirname(LOCK), { recursive: true })
  for (let i = 0; ; i++) {
    try {
      mkdirSync(LOCK)
      writeFileSync(LOCK + '/pid', String(process.pid))
      // The full headless Chrome draws nothing while the desk's display is off (every shot times out, 2026-11-13): wake
      // it and keep it on while the lock is held. -w ends caffeinate with this process, even if it dies.
      const awake = spawn('caffeinate', ['-d', '-u', '-w', String(process.pid)], { stdio: 'ignore' })
      return () => { awake.kill(); rmSync(LOCK, { recursive: true, force: true }) }
    } catch {
      // Stale only when its holder is dead. (Was: older than 3 min. On a loaded desk one shot takes longer than that,
      // so waiting captures stole the lock and three Chromes ran at once, 2026-11-14.)
      let pid = 0
      try { pid = +readFileSync(LOCK + '/pid', 'utf8') } catch {} // none yet: the holder is between mkdir and write
      if (pid) try { process.kill(pid, 0) } catch (e) { if (e.code !== 'EPERM') try { rmSync(LOCK, { recursive: true }) } catch {} }
      if (i > 1600) throw new Error('capture lock busy for 40 min')
      await new Promise(r => setTimeout(r, 1500))
    }
  }
}
