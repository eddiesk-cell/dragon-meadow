// STUB — lane "sky" replaces this file. Contract: PLAN.md §Contract.
export async function createSky({ THREE, scene, sunDir, fogColor }) {
  scene.background = fogColor.clone()
  scene.fog = new THREE.FogExp2(fogColor, 0.012)
  scene.add(new THREE.HemisphereLight(0xdfe6ee, 0x55603f, 1.2))
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.5)
  sun.position.copy(sunDir).multiplyScalar(50)
  scene.add(sun)
  return { update() {} }
}
