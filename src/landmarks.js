// Lane landmarks — the rock island over its pond near the start (rockisle.glb: rock, puff trees, the egg stone, with
// town-kit's cottage_l on its terrace) and the Crest Stone on the cliff (stoneface.glb). PLAN.md Phase 6 "Lane landmarks".
// Both are glow-veined at night like the ring stones (same vein recipe as src/ring.js, scaled to their size).
// Publishes ctx.landmarks { rockisle, egg, crestStone }; pushes ctx.keepClear.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  vertexColor, positionLocal, uniform, vec3, vec4, float, smoothstep, abs, max, mix, sin, pow, dot, mx_noise_float, normalView,
  positionViewDirection, attribute, fract, normalize, cross, cameraPosition, uv, length, saturate,
} from 'three/tsl'

// Chimney smoke, all on the GPU: N puffs per chimney, each one's age = fract(time + its offset), so nothing updates on
// the CPU. Puffs rise ~16 m, lean downwind (the field's WIND, +x), swell and fade; dimmer at night.
function smoke(THREE, tops, uT, uNight) {
  const N = 26, geo = new THREE.InstancedBufferGeometry(), s = new Float32Array(tops.length * N * 4)
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2))
  geo.setIndex([0, 1, 2, 0, 2, 3])
  tops.forEach((p, k) => { for (let i = 0; i < N; i++) s.set([p.x, p.y, p.z, i / N + k * 0.37], (k * N + i) * 4) })
  // shortcut: drift is a fixed lean along the field's mean WIND, not ctx.windAt; fine for a chimney seen from afar
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(s, 4))
  geo.instanceCount = tops.length * N
  const a = attribute('aS', 'vec4'), ph = fract(uT.mul(0.06).add(a.w)) // ~17 s from the pot to gone
  const wob = sin(a.w.mul(37)).mul(ph).mul(2.5) // each puff wanders a little off the line
  const c = a.xyz.add(vec3(ph.mul(13).add(wob), ph.mul(16), ph.mul(4.7).sub(wob))), size = ph.mul(7).add(1.2)
  const toCam = normalize(cameraPosition.sub(c)), right = normalize(cross(vec3(0, 1, 0), toCam)), up = cross(toCam, right), q = attribute('position', 'vec3')
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false })
  mat.positionNode = c.add(right.mul(q.x.mul(size))).add(up.mul(q.y.mul(size)))
  const r = saturate(float(1).sub(length(uv().sub(0.5).mul(2))))
  mat.colorNode = vec4(vec3(0.84, 0.84, 0.86).mul(float(1).sub(uNight.mul(0.75))), r.mul(r).mul(sin(ph.mul(Math.PI))).mul(0.28))
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  return mesh
}

// Where they stand. The island's north half rises out of the crest slope; its south foot reaches the hollow at
// (10…60, −40…−70) where the ground dips to −2 m: the pond's natural basin, below eye level so it reads from the start.
// shortcut: tools/world/rockisle.py aims the cottage at the start from (50, −105); move ISLE → re-run it.
const ISLE = { x: 50, z: -105 }
const EGG = { x: -12, z: -84, yaw: 0.5 }
const CREST = { x: -90, z: -205, yaw: Math.atan2(-0.92, -0.38), lean: 0.12 } // face looks out over the sea, north-west

export async function createLandmarks(ctx) {
  const { THREE, scene } = ctx
  if (ctx.params.get('landmarks') === '0') return null // A/B for fps and look
  const loader = new GLTFLoader()
  const [isle, kit, crest] = await Promise.all(['rockisle', 'town-kit', 'stoneface'].map(n => loader.loadAsync(import.meta.env.BASE_URL + `models/world/${n}.glb`)))
  const uNight = uniform(0), uT = uniform(0)

  // Stone with night veins: thin noise level-set lines (ring.js recipe), only where COLOR_0 alpha allows (bare rock),
  // patchy, pulsing slowly upward. `k` = noise frequency per metre, `w` = line width — big stones get wide veins.
  // carved: alpha ≥ 0.9 marks cut lines that glow whole (the Crest Stone's face); veins then run only below 0.8.
  const stone = (k, w, carved = false, glow = 2.2) => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.93, metalness: 0 })
    const P = positionLocal.mul(k), vc = vertexColor()
    const n1 = mx_noise_float(P), n2 = mx_noise_float(P.mul(2.7).add(11))
    const line = (n, ww) => float(1).sub(smoothstep(ww * 0.3, ww, abs(n)))
    const cut = carved ? smoothstep(0.8, 0.95, vc.a) : float(0)
    const vein = max(line(n1, w), line(n2, w * 1.4).mul(0.55)).mul(carved ? vc.a.mul(float(1).sub(cut)) : vc.a)
      .mul(smoothstep(0, 0.35, mx_noise_float(P.mul(0.37).add(5)))) // in patches, not a net over everything
    m.colorNode = vc.rgb.add(vec3(0.015, 0.035, 0.01).mul(vein)) // faint green lines by day
    const pulse = sin(uT.mul(0.9).sub(positionLocal.y.mul(k * 1.7)).add(n1.mul(4))).mul(0.3).add(0.85)
    m.emissiveNode = mix(vec3(0.1, 1, 0.75), vec3(0.35, 1, 0.35), n2.mul(0.5).add(0.5)).mul(vein.mul(glow).mul(pulse))
      .add(vec3(0.25, 1, 0.8).mul(cut.mul(sin(uT.mul(0.6)).mul(0.1).add(0.7)))).mul(uNight)
    return m
  }
  const leaf = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 })
  leaf.colorNode = vertexColor().rgb
  const egg = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0 }) // skystone: a pearl glow at night
  // veins run up the form (y squeezed), mottle is large and soft; base darkens toward the turf, a faint sky tint rides the rim by day
  const EP = positionLocal.mul(vec3(0.5, 0.28, 0.5)), eN = mx_noise_float(EP), eV = mx_noise_float(EP.mul(2.3).add(7))
  const eVein = float(1).sub(smoothstep(0.012, 0.04, abs(eN.add(eV.mul(0.25))))).mul(smoothstep(-0.2, 0.3, mx_noise_float(EP.mul(0.6).add(3))))
  const eRim = pow(float(1).sub(abs(dot(normalView, positionViewDirection))), 3)
  const eDay = float(1).sub(uNight.mul(2)).max(0), eGlow = uNight.mul(8).min(1) // day tint fades out as the glow fades in: never both at zero
  egg.colorNode = mix(mix(vertexColor().rgb, vec3(1, 0.92, 0.9), 0.9).mul(eN.mul(0.3).add(1.25)).mul(smoothstep(0, 3.5, positionLocal.y).mul(0.3).add(0.7)),
    vec3(0.6, 0.74, 0.95), eRim.mul(0.5))
  egg.colorNode = mix(egg.colorNode, vec3(0.55, 0.65, 0.85), eVein.mul(eDay).mul(0.35)) // blue-grey veins by day
  egg.emissiveNode = mix(vec3(0.35, 0.6, 0.75).mul(eRim.mul(0.6).add(0.03)), vec3(0.3, 0.85, 0.85).mul(eVein.mul(0.6).add(eRim.mul(0.2))), 0.6).mul(uNight)
    .add(vec3(0.3, 0.85, 0.85).mul(eVein.mul(0.4).mul(eGlow).mul(float(1).sub(uNight.mul(0.5)))))

  const nodes = Object.fromEntries(isle.scene.children.map(o => [o.name, o]))
  const ground = (x, z) => ctx.heightAt(x, z)
  const prep = (o, mat) => o.traverse(m => { if (m.isMesh) { m.material = mat; m.castShadow = m.receiveShadow = true } })

  // --- the island: one group at the ground under its centre; the apron's foot is pulled down onto the meadow (never
  // raised: where the hill is higher the apron is simply buried), so no edge floats on the slope.
  const baseY = ground(ISLE.x, ISLE.z)
  const island = new THREE.Group()
  island.position.set(ISLE.x, baseY, ISLE.z)
  const rock = nodes.rock, rockMat = stone(0.07, 0.04, false, 1.5)
  let floatMax = -Infinity
  const geo = rock.geometry, p = geo.attributes.position
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
  prep(rock, rockMat)
  prep(nodes.boulders, rockMat) // on the terrace and ledges, above the part that moves
  prep(nodes.trees, leaf)
  island.add(rock, nodes.boulders, nodes.trees)

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
  island.updateMatrixWorld(true)
  scene.add(smoke(THREE, (cottage.userData.smoke || []).map(v => cottage.localToWorld(new THREE.Vector3(...v))), uT, uNight))

  // --- the egg stone on the pond's west shore, rocking a hair now and then (skystone: light enough to rock by hand)
  const eggM = nodes.egg
  prep(eggM, egg)
  const eggY = ground(EGG.x, EGG.z)
  eggM.position.set(EGG.x, eggY, EGG.z)
  eggM.rotation.y = EGG.yaw
  scene.add(eggM)
  for (let a = 0; a < 6.28; a += 0.4) floatMax = Math.max(floatMax, eggY - ground(EGG.x + 2.8 * Math.cos(a), EGG.z + 2.8 * Math.sin(a)) - 0.8) // its sunk foot

  // --- the Crest Stone at the cliff lip: root 3 m in the turf, leaning out toward its gaze
  const face = crest.scene.getObjectByName('stone')
  prep(face, stone(0.2, 0.05, true, 1.2))
  const crestY = ground(CREST.x, CREST.z)
  face.position.set(CREST.x, crestY, CREST.z)
  face.rotation.set(CREST.lean, CREST.yaw, 0, 'YXZ')
  scene.add(face)
  for (let a = 0; a < 6.28; a += 0.4) { // the root's bottom ring (3 m down) after the lean: under the turf all round?
    const v = new THREE.Vector3(5.4 * Math.cos(a), -3, 3.4 * Math.sin(a)).applyEuler(face.rotation).add(face.position)
    floatMax = Math.max(floatMax, v.y - ground(v.x, v.z))
  }

  ctx.keepClear.push({ x: ISLE.x, z: ISLE.z, r: rock.userData.r + 2 }, { x: EGG.x, z: EGG.z, r: 7 }, { x: CREST.x, z: CREST.z, r: 9 })
  ctx.landmarks = {
    rockisle: { x: ISLE.x, z: ISLE.z, y: baseY, r: rock.userData.r, top: baseY + rock.userData.top },
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
