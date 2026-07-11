/**
 * verify-canadarm.mjs — headless load-back check of public/models/canadarm2.glb.
 * Asserts: (a) parses, (b) all 7 named joint nodes present in the hierarchy,
 * (c) meshes carry geometry, (d) materials have textures, (e) file size.
 * Run: npm run verify:arm
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.self = dom.window;
globalThis.DOMParser = dom.window.DOMParser;

const THREE = await import('three');
const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GLB = path.resolve(__dirname, '../public/models/canadarm2.glb');

const REQUIRED = ['Base_Joint', 'Shoulder_Roll', 'Shoulder_Yaw', 'Elbow_Pitch', 'Wrist_Pitch', 'Wrist_Yaw', 'Wrist_Roll'];

const buf = fs.readFileSync(GLB);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const draco = new DRACOLoader();
draco.setDecoderPath('node_modules/three/examples/jsm/libs/draco/');
// node decoder: point DRACOLoader at the wasm/js decoder module directly
const draco3d = (await import('draco3dgltf')).default;
const decoderModule = await draco3d.createDecoderModule();
// Patch DRACOLoader to use the node draco module instead of a Worker.
draco.preload = () => draco;
draco.decodeDracoFile = function (buffer, callback) {
	const dec = new decoderModule.Decoder();
	const bufWrap = new decoderModule.DecoderBuffer();
	const u8 = new Uint8Array(buffer);
	bufWrap.Init(u8, u8.length);
	const dracoGeom = new decoderModule.Mesh();
	dec.DecodeBufferToMesh(bufWrap, dracoGeom);
	const numFaces = dracoGeom.num_faces();
	const numPoints = dracoGeom.num_points();
	const geometry = new THREE.BufferGeometry();
	// indices
	const idx = new (numPoints > 65535 ? Uint32Array : Uint16Array)(numFaces * 3);
	const ia = new decoderModule.DracoInt32Array();
	for (let i = 0; i < numFaces; i++) {
		dec.GetFaceFromMesh(dracoGeom, i, ia);
		idx[i * 3] = ia.GetValue(0); idx[i * 3 + 1] = ia.GetValue(1); idx[i * 3 + 2] = ia.GetValue(2);
	}
	geometry.setIndex(new THREE.BufferAttribute(idx, 1));
	const map = { POSITION: 'position', NORMAL: 'normal', TEX_COORD: 'uv', COLOR: 'color' };
	for (const [dracoName, threeName] of Object.entries(map)) {
		const id = dec.GetAttributeId(dracoGeom, decoderModule[dracoName]);
		if (id < 0) continue;
		const attr = dec.GetAttribute(dracoGeom, id);
		const num = attr.num_components();
		const arr = new decoderModule.DracoFloat32Array();
		dec.GetAttributeFloatForAllPoints(dracoGeom, attr, arr);
		const out = new Float32Array(numPoints * num);
		for (let i = 0; i < out.length; i++) out[i] = arr.GetValue(i);
		geometry.setAttribute(threeName, new THREE.BufferAttribute(out, num));
		decoderModule.destroy(arr);
	}
	decoderModule.destroy(ia); decoderModule.destroy(dracoGeom);
	decoderModule.destroy(bufWrap); decoderModule.destroy(dec);
	callback(geometry);
};

const loader = new GLTFLoader();
loader.setDRACOLoader(draco);

const gltf = await new Promise((res, rej) => loader.parse(ab, '', res, rej));

let fail = 0;
const scene = gltf.scene;

// (b) joint nodes
const names = new Set();
scene.traverse((o) => o.name && names.add(o.name));
console.log('\nJoint nodes:');
for (const n of REQUIRED) {
	const ok = names.has(n);
	if (!ok) fail++;
	console.log(`  ${ok ? 'OK ' : 'MISSING '} ${n}`);
}

// verify nesting depth (chain, not flat): Wrist_Roll must descend from Base_Joint
function ancestors(name) {
	let node = null;
	scene.traverse((o) => { if (o.name === name) node = o; });
	const chain = [];
	for (let p = node?.parent; p; p = p.parent) if (p.name) chain.push(p.name);
	return chain;
}
const wr = ancestors('Wrist_Roll');
const nested = REQUIRED.slice(0, 6).every((n) => wr.includes(n));
console.log(`\nChain nesting (Wrist_Roll under all prior joints): ${nested ? 'OK' : 'FAIL'}`);
if (!nested) { fail++; console.log('  Wrist_Roll ancestors:', wr.join(' <- ')); }

// (c) meshes + geometry
let meshCount = 0, triTotal = 0;
scene.traverse((o) => {
	if (!o.isMesh) return;
	meshCount++;
	const g = o.geometry;
	const pos = g.attributes.position;
	if (!pos || pos.count === 0) { fail++; console.log('  EMPTY geometry on', o.name); }
	triTotal += (g.index ? g.index.count : pos.count) / 3;
});
console.log(`\nMeshes: ${meshCount}, total triangles: ${triTotal.toLocaleString()}`);

// (d) materials/textures — read from glTF JSON (node three can't decode the
// embedded JPEGs into material.map, so inspect the source-of-truth JSON).
const json = gltf.parser.json;
const images = json.images || [];
console.log(`\nEmbedded images: ${images.length}`);
console.log('Materials (base-color texture | factor | emissive):');
for (const mat of json.materials || []) {
	const pbr = mat.pbrMetallicRoughness || {};
	const hasTex = pbr.baseColorTexture != null;
	const factor = pbr.baseColorFactor ? `[${pbr.baseColorFactor.map((n) => n.toFixed(2)).join(',')}]` : '-';
	const emis = mat.emissiveTexture != null || (mat.emissiveFactor && mat.emissiveFactor.some((n) => n > 0));
	console.log(`  ${(mat.name || '?').padEnd(14)} tex:${hasTex ? 'yes' : 'no '} factor:${factor} emissive:${emis ? 'yes' : 'no'}`);
}
// ee, joint, long_link_1, long_link_2 (link_joint's pure-white map prunes to a
// baseColorFactor, so it isn't embedded).
if (images.length < 4) { fail++; console.log('  EXPECTED >=4 embedded images'); }

// bounding box (sanity: ~17 m span)
const box = new THREE.Box3().setFromObject(scene);
const size = new THREE.Vector3(); box.getSize(size);
console.log(`\nBounding box (m): ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`);

// (e) size + draco presence
const kb = buf.length / 1024;
const isDraco = JSON.stringify(gltf.parser.json.extensionsUsed || []).includes('KHR_draco');
console.log(`\nFile: ${kb.toFixed(1)} KB   Draco: ${isDraco ? 'yes' : 'NO'}`);
if (kb > 1500) { fail++; console.log('  OVER 1.5 MB budget'); }

console.log(`\n${fail === 0 ? 'VERIFY: PASS' : `VERIFY: FAIL (${fail})`}`);
process.exit(fail === 0 ? 0 : 1);
