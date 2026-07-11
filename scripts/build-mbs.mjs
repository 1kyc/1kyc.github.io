// Convert the Mobile Base System STL into an optimised Draco GLB.
//
// STL is triangle soup: every triangle stores 3 full-float vertices with no
// sharing, no index buffer, no UVs, no material (~50 bytes/triangle binary). We
// parse it, recompute flat per-face normals (STL's stored normals are often
// unreliable), weld coplanar-and-equal vertices into an index buffer, attach a
// matte-aluminium PBR material, and Draco-compress. Result is a fraction of the
// STL size. Run: npm run build:mbs
import fs from 'node:fs';
import { Document, NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { weld, dedup } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';

const SRC = 'assets/mbs-src/MBS_1-100_v01.STL';
const OUT = 'public/models/mbs.glb';

const buf = fs.readFileSync(SRC);
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const n = dv.getUint32(80, true); // uint32 triangle count after the 80-byte header
const pos = new Float32Array(n * 9);
const nor = new Float32Array(n * 9);
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
let o = 84;
for (let i = 0; i < n; i++) {
	o += 12; // skip STL's stored (unreliable) face normal
	const v = [];
	for (let k = 0; k < 9; k++) {
		v.push(dv.getFloat32(o, true));
		o += 4;
	}
	o += 2; // attribute byte count
	// flat face normal = normalize((b-a) × (c-a))
	const ux = v[3] - v[0],
		uy = v[4] - v[1],
		uz = v[5] - v[2];
	const wx = v[6] - v[0],
		wy = v[7] - v[1],
		wz = v[8] - v[2];
	let nx = uy * wz - uz * wy,
		ny = uz * wx - ux * wz,
		nz = ux * wy - uy * wx;
	const len = Math.hypot(nx, ny, nz) || 1;
	nx /= len;
	ny /= len;
	nz /= len;
	const b = i * 9;
	for (let k = 0; k < 9; k++) pos[b + k] = v[k];
	for (let t = 0; t < 3; t++) {
		nor[b + t * 3] = nx;
		nor[b + t * 3 + 1] = ny;
		nor[b + t * 3 + 2] = nz;
		for (let a = 0; a < 3; a++) {
			const c = v[t * 3 + a];
			if (c < min[a]) min[a] = c;
			if (c > max[a]) max[a] = c;
		}
	}
}

const doc = new Document();
const buffer = doc.createBuffer();
const position = doc
	.createAccessor()
	.setType('VEC3')
	.setArray(pos)
	.setBuffer(buffer);
const normal = doc
	.createAccessor()
	.setType('VEC3')
	.setArray(nor)
	.setBuffer(buffer);
const material = doc
	.createMaterial('mbs')
	.setBaseColorFactor([0.5, 0.53, 0.57, 1]) // matte aluminium, close to the ISS hull
	.setMetallicFactor(0.65)
	.setRoughnessFactor(0.55);
const prim = doc
	.createPrimitive()
	.setAttribute('POSITION', position)
	.setAttribute('NORMAL', normal)
	.setMaterial(material);
const mesh = doc.createMesh('mbs').addPrimitive(prim);
doc.createScene().addChild(doc.createNode('mbs').setMesh(mesh));

// weld merges vertices identical in BOTH position and normal, so hard edges are
// preserved (adjacent faces with different normals stay split) while coplanar
// runs collapse — then Draco crushes what remains.
await doc.transform(weld({ tolerance: 1e-4 }), dedup());
doc
	.createExtension(KHRDracoMeshCompression)
	.setRequired(true)
	.setEncoderOptions({
		method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER,
		quantizationVolume: 'mesh',
	});

const io = new NodeIO()
	.registerExtensions([KHRDracoMeshCompression])
	.registerDependencies({
		'draco3d.encoder': await draco3d.createEncoderModule(),
		'draco3d.decoder': await draco3d.createDecoderModule(),
	});
await io.write(OUT, doc);

const size = (max.map((v, i) => (v - min[i]).toFixed(1)));
const outKb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log(`STL triangles: ${n}`);
console.log(`model-unit size: [${size}]  (min [${min.map((v) => v.toFixed(1))}])`);
console.log(`wrote ${OUT} -> ${outKb} KB`);
