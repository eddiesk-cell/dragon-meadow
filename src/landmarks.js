// Lane landmarks — the rock island over its pond near the start (rockisle.glb: rock, puff trees, the egg stone, with
// town-kit's cottage_l on its terrace) and the Crest Stone on the cliff (stoneface.glb). PLAN.md Phase 6 "Lane landmarks".
// Both are glow-veined at night like the ring stones (same vein recipe as src/ring.js, scaled to their size).
// Publishes ctx.landmarks { rockisle, egg, crestStone }; pushes ctx.keepClear.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  vertexColor, positionLocal, uniform, vec3, float, smoothstep, abs, max, mix, sin, pow, dot, mx_noise_float, normalView,
  positionViewDirection,
} from 'three/tsl'

// Where they stand. The island's north half rises out of the crest slope; its south foot reaches the hollow at
// (10…60, −40…−70) where the ground dips to −2 m: the pond's natural basin, below eye level so it reads from the start.
// shortcut: tools/world/rockisle.py aims the cottage at the start from (50, −105); move ISLE → re-run it.
const ISLE = { x: 50, z: -105 }
const EGG = { x: -12, z: -84, yaw: 0.5 }
const CREST = { x: -90, z: -205, yaw: Math.atan2(-0.92, -0.38), lean: 0.12 } // face looks out over the sea, north-west

export async function createLandmarks(ctx) {
  const { THREE, scene } = ctx
  const loader = new GLTFLoader()
  const [isle, kit, crest] = await Promise.all(['rockisle', 'town-kit', 'stoneface'].map(n => loader.loadAsync(`/models/world/${n}.glb`)))
  const uNight = uniform(0), uT = uniform(0)

  // Stone with night veins: thin noise level-set lines (ring.js recipe), only where COLOR_0 alpha allows (bare rock),
  // patchy, pulsing slowly upward. `k` = noise frequency per metre, `w` = line width — big stones get wide veins.
  // carved: alpha ≥ 0.9 marks cut lines that glow whole (the Crest Stone's face); veins then run only below 0.8.
  const stone = (k, w, carved = false) => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.93, metalness: 0 })
    const P = positionLocal.mul(k), vc = vertexColor()
    const n1 = mx_noise_float(P), n2 = mx_noise_float(P.mul(2.7).add(11))
    const line = (n, ww) => float(1).sub(smoothstep(ww * 0.3, ww, abs(n)))
    const cut = carved ? smoothstep(0.8, 0.95, vc.a) : float(0)
    const vein = max(line(n1, w), line(n2, w * 1.4).mul(0.55)).mul(carved ? vc.a.mul(float(1).sub(cut)) : vc.a)
      .mul(smoothstep(-0.25, 0.25, mx_noise_float(P.mul(0.37).add(5))))
    m.colorNode = vc.rgb.add(vec3(0.03, 0.07, 0.02).mul(vein)) // soft green lines by day
    const pulse = sin(uT.mul(0.9).sub(positionLocal.y.mul(k * 1.7)).add(n1.mul(4))).mul(0.3).add(0.85)
    m.emissiveNode = mix(vec3(0.1, 1, 0.75), vec3(0.35, 1, 0.35), n2.mul(0.5).add(0.5)).mul(vein.mul(2.2).mul(pulse))
      .add(vec3(0.25, 1, 0.8).mul(cut.mul(sin(uT.mul(0.6)).mul(0.2).add(1.6)))).mul(uNight)
    return m
  }
  const leaf = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 })
  leaf.colorNode = vertexColor().rgb
  const egg = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0 }) // skystone: a pearl glow at night
  egg.colorNode = vertexColor().rgb
  egg.emissiveNode = vec3(0.5, 0.85, 1).mul(pow(float(1).sub(abs(dot(normalView, positionViewDirection))), 2).mul(0.9).add(0.2)).mul(uNight)

  const nodes = Object.fromEntries(isle.scene.children.map(o => [o.name, o]))
  const ground = (x, z) => ctx.heightAt(x, z)
  const prep = (o, mat) => o.traverse(m => { if (m.isMesh) { m.material = mat; m.castShadow = m.receiveShadow = true } })

  // --- the island: one group at the ground under its centre; the apron's foot is pulled down onto the meadow (never
  // raised: where the hill is higher the apron is simply buried), so no edge floats on the slope.
  const baseY = ground(ISLE.x, ISLE.z)
  const island = new THREE.Group()
  island.position.set(ISLE.x, baseY, ISLE.z)
  const rock = nodes.rock, geo = rock.children[0]?.geometry ?? rock.geometry, p = geo.attributes.position
  let floatMax = -Infinity
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i)
    if (y >= 11) continue
    const off = Math.min(0, ground(ISLE.x + p.getX(i), ISLE.z + p.getZ(i)) - baseY)
    const ny = y + off * (y <= 0 ? 1 : 1 - y / 11)
    p.setY(i, ny)
    if (y < -2) floatMax = Math.max(floatMax, baseY + ny - ground(ISLE.x + p.getX(i), ISLE.z + p.getZ(i))) // the skirt: must stay under the turf
  }
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  prep(rock, stone(0.085, 0.07))
  prep(nodes.trees, leaf)
  island.add(rock, nodes.trees)

  const ex = rock.userData.cottage // [x, y, z, yaw] on the terrace, front toward the start
  const cottage = kit.scene.getObjectByName('cottage_l')
  cottage.position.set(ex[0], ex[1], ex[2])
  cottage.rotation.y = ex[3]
  const windows = []
  cottage.traverse(m => {
    if (!m.isMesh) return
    m.castShadow = m.receiveShadow = true
    if (m.material.name === 'window') { m.material.emissive.setRGB(1, 0.55, 0.2); windows.push(m.material) }
  })
  island.add(cottage)
  scene.add(island)

  // --- the egg stone on the pond's west shore, rocking a hair now and then (skystone: light enough to rock by hand)
  const eggM = nodes.egg
  prep(eggM, egg)
  const eggY = ground(EGG.x, EGG.z)
  eggM.position.set(EGG.x, eggY, EGG.z)
  eggM.rotation.y = EGG.yaw
  scene.add(eggM)
  for (let a = 0; a < 6.28; a += 0.4) floatMax = Math.max(floatMax, eggY - ground(EGG.x + 2.2 * Math.cos(a), EGG.z + 2.2 * Math.sin(a)) - 0.6) // its sunk foot

  // --- the Crest Stone at the cliff lip: root 3 m in the turf, leaning out toward its gaze
  const face = crest.scene.getObjectByName('stone')
  prep(face, stone(0.22, 0.09, true))
  const crestY = ground(CREST.x, CREST.z)
  face.position.set(CREST.x, crestY, CREST.z)
  face.rotation.set(CREST.lean, CREST.yaw, 0, 'YXZ')
  scene.add(face)
  for (let a = 0; a < 6.28; a += 0.4) { // the slab's foot ring (5.6 x 3.6 m) after the lean: still under the turf?
    const v = new THREE.Vector3(5.4 * Math.cos(a), -0.2, 3.4 * Math.sin(a)).applyEuler(face.rotation).add(face.position)
    floatMax = Math.max(floatMax, v.y - ground(v.x, v.z))
  }

  ctx.keepClear.push({ x: ISLE.x, z: ISLE.z, r: 46 }, { x: EGG.x, z: EGG.z, r: 7 }, { x: CREST.x, z: CREST.z, r: 9 })
  ctx.landmarks = {
    rockisle: { x: ISLE.x, z: ISLE.z, y: baseY, r: 44, top: baseY + rock.userData.top },
    egg: { x: EGG.x, z: EGG.z, y: eggY },
    crestStone: { x: CREST.x, z: CREST.z, y: crestY },
  }

  const r2 = v => Math.round(v * 100) / 100
  window.__probes.landmarks = () => ({
    isle: [ISLE.x, ISLE.z], top: r2(island.position.y + rock.userData.top),
    base: r2(Math.abs(island.position.y - ground(ISLE.x, ISLE.z))), eggBase: r2(Math.abs(eggM.position.y - ground(EGG.x, EGG.z))),
    crestBase: r2(Math.abs(face.position.y - ground(CREST.x, CREST.z))),
    floatMax: r2(floatMax), night: r2(uNight.value),
  })

  return {
    update(dt, t) {
      uT.value = t
      uNight.value = ctx.night
      for (const m of windows) m.emissiveIntensity = 2.5 * ctx.night
      eggM.rotation.z = 0.012 * Math.sin(t * 0.7) * Math.max(0, Math.sin(t * 0.11))
    },
  }
}
