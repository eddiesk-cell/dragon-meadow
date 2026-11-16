// Needs (in any scratch folder): npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer
// Meshopt-compress a static .glb. mode "float": nothing quantised (coordinates, normals, colours stay as authored).
// mode "nopos": everything but POSITION quantised.  node pack.mjs in.glb out.glb float|nopos
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions'
import { reorder, quantize, dedup, prune } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'
const [src, dst, mode] = process.argv.slice(2)
await MeshoptEncoder.ready; await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read(src)
await doc.transform(dedup(), prune({ keepAttributes: true, keepLeaves: true }), reorder({ encoder: MeshoptEncoder }))
if (mode === 'nopos') await doc.transform(quantize({ pattern: /^(?!POSITION)/ }))
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
await io.write(dst, doc)
