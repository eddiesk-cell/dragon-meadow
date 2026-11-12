// STUB — lane "field" replaces this file. Contract: PLAN.md §Contract.
export async function createField({ THREE, scene }) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshStandardNodeMaterial({ color: 0x6f8a4a }))
  ground.receiveShadow = true
  scene.add(ground)
  return { update() {} }
}
