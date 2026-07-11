/**
 * build-canadarm.mjs — reproducible Canadarm2 (SSRMS) asset pipeline.
 *
 * Source (Apache-2.0, Space ROS): assets/canadarm2-src/
 *   meshes/*.dae + textures, urdf/SSRMS_Canadarm2.urdf.xacro
 * Output: public/models/canadarm2.glb — a Draco-compressed, texture-downscaled
 *   GLB whose scene graph IS the 7-DOF kinematic chain as nested nodes, with
 *   seven empty joint nodes named exactly:
 *     Base_Joint, Shoulder_Roll, Shoulder_Yaw, Elbow_Pitch,
 *     Wrist_Pitch, Wrist_Yaw, Wrist_Roll
 *   Each joint node sits at its URDF origin offset from its parent and carries
 *   its child link's <visual> meshes at their per-visual origins. Joint node
 *   frames are LEFT ALIGNED WITH THE URDF LINK FRAMES (identity rotation), so
 *   the developer spins each named node about the documented local axis:
 *     Base_Joint  +Z   Shoulder_Roll +X   Shoulder_Yaw +Z   Elbow_Pitch +Z
 *     Wrist_Pitch -Z   Wrist_Yaw     +X   Wrist_Roll    +Z
 *
 * Pipeline: three ColladaLoader (jsdom shim) -> build chain -> GLTFExporter
 *   -> @gltf-transform (attach downscaled textures + Draco) -> GLB.
 *
 * Run: npm run build:arm     (then npm run verify:arm)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { JSDOM } from 'jsdom';

// ---- DOM shim so three's ColladaLoader (DOMParser) runs headless -----------
const dom = new JSDOM('<!DOCTYPE html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.self = dom.window;
globalThis.DOMParser = dom.window.DOMParser;
globalThis.Image = dom.window.Image;
globalThis.Blob = dom.window.Blob;
globalThis.FileReader = dom.window.FileReader;

const THREE = await import('three');
const { ColladaLoader } = await import('three/examples/jsm/loaders/ColladaLoader.js');
const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'assets/canadarm2-src/meshes');
const OUT = path.join(ROOT, 'public/models/canadarm2.glb');

// ---------------------------------------------------------------------------
// 1. Load each DAE, bake DAE-internal transforms into geometry, keep authored
//    (Z-up) coordinates. ColladaLoader rotates res.scene to Y-up but leaves
//    vertex data authored; we undo that root rotation so the chain is built in
//    native URDF Z-up and converted to glTF Y-up once, at the very end.
// ---------------------------------------------------------------------------
const loader = new ColladaLoader();

function loadAuthored(daeFile) {
	const text = fs.readFileSync(path.join(SRC, daeFile), 'utf8');
	const res = loader.parse(text, './');
	res.scene.updateMatrixWorld(true);
	const convInv = res.scene.matrix.clone().invert(); // remove Z->Y conversion
	const geoms = [];
	res.scene.traverse((o) => {
		if (!o.isMesh) return;
		o.updateMatrixWorld(true);
		const g = o.geometry.clone();
		const m = new THREE.Matrix4().multiplyMatrices(convInv, o.matrixWorld);
		g.applyMatrix4(m);       // -> authored frame
		g.deleteAttribute('color');
		g.deleteAttribute('tangent');
		geoms.push(g); // UVs kept verbatim; flipY handled at the texture (see hullTex)
	});
	return geoms; // array of BufferGeometry in authored coords
}

const DAE = {
	ee:          loadAuthored('ee.dae'),
	joint:       loadAuthored('joint_v3_0.dae'),
	long_link_1: loadAuthored('long_link_1_v3_0.dae'),
	long_link_2: loadAuthored('long_link_2_v3_0.dae'),
	link_joint:  loadAuthored('link_joint_v2_1.dae'),
};

// Named materials (textures attached later in gltf-transform, keyed by name).
function mat(name) {
	const m = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.15, roughness: 0.62 });
	m.name = name;
	return m;
}
const MAT = {
	ee: mat('ee'), joint: mat('joint'), long_link_1: mat('long_link_1'),
	long_link_2: mat('long_link_2'), link_joint: mat('link_joint'),
};
const cylMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.3, roughness: 0.5 });
cylMat.name = 'cylinder';

// URDF rpy (fixed-axis roll-pitch-yaw) -> quaternion:  R = Rz(yaw)Ry(pitch)Rx(roll)
function rpyQuat(r, p, y) {
	const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), r);
	const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p);
	const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), y);
	return qz.multiply(qy).multiply(qx); // qz*qy*qx
}

// One <visual> block -> a Group holding the DAE's mesh(es) at the visual origin.
function visual(daeKey, xyz, rpy) {
	const g = new THREE.Group();
	g.position.set(xyz[0], xyz[1], xyz[2]);
	g.quaternion.copy(rpyQuat(rpy[0], rpy[1], rpy[2]));
	for (const geom of DAE[daeKey]) g.add(new THREE.Mesh(geom, MAT[daeKey]));
	return g;
}

// A named, empty joint node at its URDF origin (identity rotation).
function joint(name, xyz) {
	const n = new THREE.Group();
	n.name = name;
	n.position.set(xyz[0], xyz[1], xyz[2]);
	return n;
}

// ---------------------------------------------------------------------------
// 2. Assemble the chain (every <visual> from the URDF replicated).
// ---------------------------------------------------------------------------
const base = new THREE.Group();
base.name = 'Base_SSRMS';
base.add(visual('ee', [0, 0, 0], [0, 0, 0]));                       // root LEE

const jBase = joint('Base_Joint', [0, 0, 0]);                       // link B1
jBase.add(visual('joint', [0.25082, 0, -0.175], [0, -1.5708, 0]));
base.add(jBase);

const jShoRoll = joint('Shoulder_Roll', [0.25082, 0, -0.175]);     // link B2
jShoRoll.add(visual('joint', [0.175, 0, -0.25082], [0, 0, 0]));
jBase.add(jShoRoll);

const jShoYaw = joint('Shoulder_Yaw', [0.175, 0, -0.25082]);       // link B3
jShoYaw.add(visual('joint', [0.25082, 0, -0.175], [0, -1.5708, 0]));
jShoYaw.add(visual('long_link_1', [0.25082, 0, -0.175], [-1.5708, 0, -1.5708]));
jShoYaw.add(visual('joint', [7.36082, 0, -0.175], [0, 1.5708, 0]));
{ // B3 bare cylinder r=0.165 l=0.5 (axis Z -> pre-rotate CylinderGeometry Y->Z)
	const cg = new THREE.CylinderGeometry(0.165, 0.165, 0.5, 24, 1);
	cg.rotateX(Math.PI / 2);
	const cyl = new THREE.Group();
	cyl.position.set(7.61164, 0, -0.35);
	cyl.quaternion.copy(rpyQuat(0, 0, 1.5708));
	cyl.add(new THREE.Mesh(cg, cylMat));
	jShoYaw.add(cyl);
}
jShoRoll.add(jShoYaw);

const jElbow = joint('Elbow_Pitch', [7.61164, 0, -0.6]);           // link B4
jElbow.add(visual('link_joint', [-0.25082, 0, -0.175], [0, 1.5708, 0]));
jElbow.add(visual('long_link_2', [-7.36082, 0, -0.175], [1.57, -3.14, 1.57]));
jElbow.add(visual('joint', [-7.36082, 0, -0.175], [0, -1.57, 0]));
jShoYaw.add(jElbow);

const jWristPitch = joint('Wrist_Pitch', [-7.61164, 0, -0.35]);    // link B5
jWristPitch.add(visual('joint', [0, 0, 0], [0, -3.14, 0]));
jElbow.add(jWristPitch);

const jWristYaw = joint('Wrist_Yaw', [-0.175, 0, -0.25082]);       // link B6
jWristYaw.add(visual('joint', [0, 0, 0], [0, -1.5708, 0]));
jWristPitch.add(jWristYaw);

const jWristRoll = joint('Wrist_Roll', [-0.25082, 0, -0.175]);     // link EE
jWristRoll.add(visual('ee', [0, 0, 0], [0, -3.1415, 0]));
jWristYaw.add(jWristRoll);

// Z-up (URDF/ROS) -> Y-up (glTF) once at the root.
const rootNode = new THREE.Group();
rootNode.name = 'Canadarm2';
rootNode.rotation.x = -Math.PI / 2;
rootNode.add(base);

// ---------------------------------------------------------------------------
// 3. Export to GLB (geometry + named materials; no textures yet).
// ---------------------------------------------------------------------------
const exporter = new GLTFExporter();
const glbArrayBuffer = await new Promise((resolve, reject) => {
	exporter.parse(rootNode, resolve, reject, { binary: true, onlyVisible: false });
});
const rawGlb = new Uint8Array(glbArrayBuffer);
console.log(`three GLTFExporter -> ${(rawGlb.length / 1024).toFixed(0)} KB (pre-optimize)`);

// ---------------------------------------------------------------------------
// 4. Downscale textures (sharp) and build the brand decal texture.
// ---------------------------------------------------------------------------
// The hull textures are mostly flat white, so they stay small even at high res.
// The booms carry the tiny "Canada" wordmark + flag decal, which maps onto a
// single narrow facet of the low-poly cylinder — it needs the FULL source 2048²
// to read (512²/q80 crushed it to a 6 KB smear; even 1024² left it mushy). The
// other hulls have no fine text, so 1024² is plenty.
//
// flipY: the DAE authors its UVs for three's flipY=true texture convention. glTF
// has no flipY, so three's own GLTFExporter compensates by writing the image
// upside-down (GLTFExporter.processImage: it flips the canvas when flipY===true).
// We inject textures AFTER export — because headless three has no way to
// rasterize an image into an embeddable one (no node canvas; ColladaLoader's
// textures arrive pixel-less) — so we reproduce exactly that step here with
// sharp's .flip(). One texture-level flip, matching three's own convention. This
// replaces a fragile per-mesh UV flip that mis-sampled the boom "Canada" wordmark.
async function hullTex(file, size = 1024) {
	return sharp(path.join(SRC, file))
		.resize(size, size, { fit: 'inside', withoutEnlargement: true })
		.flip()
		.jpeg({ quality: 92, mozjpeg: true })
		.toBuffer();
}
const TEX = {
	ee:          await hullTex('ee_tex_v1_3.png'),
	joint:       await hullTex('joint_v3_0_tex.png'),
	long_link_1: await hullTex('long_link_1_v3_0_tex.png', 2048),
	long_link_2: await hullTex('long_link_2_v3_2_tex.png', 2048),
	link_joint:  await hullTex('link_joint.png'),
};

// ---------------------------------------------------------------------------
// 5. gltf-transform: attach textures, Draco-compress, write.
// ---------------------------------------------------------------------------
const { NodeIO } = await import('@gltf-transform/core');
const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
const { draco, prune, dedup } = await import('@gltf-transform/functions');
const draco3d = (await import('draco3dgltf')).default;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
	'draco3d.encoder': await draco3d.createEncoderModule(),
	'draco3d.decoder': await draco3d.createDecoderModule(),
});

const doc = await io.readBinary(rawGlb);

function makeTex(name, bytes, mime) {
	return doc.createTexture(name).setImage(bytes).setMimeType(mime);
}
const gtex = {
	ee:          makeTex('ee', TEX.ee, 'image/jpeg'),
	joint:       makeTex('joint', TEX.joint, 'image/jpeg'),
	long_link_1: makeTex('long_link_1', TEX.long_link_1, 'image/jpeg'),
	long_link_2: makeTex('long_link_2', TEX.long_link_2, 'image/jpeg'),
	link_joint:  makeTex('link_joint', TEX.link_joint, 'image/jpeg'),
};

for (const m of doc.getRoot().listMaterials()) {
	const name = m.getName();
	if (gtex[name]) {
		m.setBaseColorTexture(gtex[name]);
		m.setBaseColorFactor([1, 1, 1, 1]);
		m.setMetallicFactor(0.15).setRoughnessFactor(0.62);
	}
}

// dedup shared meshes/textures; prune() folds pure-solid textures (e.g. the
// pure-white link_joint map) into a baseColorFactor — visually identical, smaller.
await doc.transform(dedup(), prune());
await doc.transform(draco({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const finalGlb = await io.writeBinary(doc);
fs.writeFileSync(OUT, finalGlb);
console.log(`wrote ${path.relative(ROOT, OUT)} -> ${(finalGlb.length / 1024).toFixed(1)} KB`);
