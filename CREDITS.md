# Credits

Third-party assets used on this site, with their sources and licenses.

## 3D models — the "manipulator" landing-page maze

The maze renders a 7-DOF **Canadarm2 (SSRMS)** the visitor drives to capture a
target, mounted on the **International Space Station** via the **Mobile Base
System**. All three models are third-party works, used as follows:

### Canadarm2 (SSRMS) — `public/models/canadarm2.glb`

- **Source:** [`space-ros/demos`](https://github.com/space-ros/demos) —
  `canadarm2/canadarm_description` (Space ROS).
- **License:** Apache License 2.0. The full license text is vendored alongside
  the source meshes at [`assets/canadarm2-src/LICENSE`](assets/canadarm2-src/LICENSE).
- **Modifications:** the per-link COLLADA (`.dae`) meshes were baked into a single
  Draco-compressed glTF and the boom textures downscaled — see
  [`scripts/build-canadarm.mjs`](scripts/build-canadarm.mjs). Source meshes/textures
  are kept in [`assets/canadarm2-src/`](assets/canadarm2-src/).

### International Space Station — `public/models/iss.glb`

- **Source:** NASA 3D Resources —
  ["International Space Station (ISS) (B)"](https://science.nasa.gov/3d-resources/international-space-station-iss-b/),
  by NASA / Michael D. Carbajal.
- **License:** Public domain (work of the U.S. Government), per
  [NASA's media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/).
  Credit: NASA.
- **Modifications:** none — the shipped `.glb` is the NASA download, unmodified.

### Mobile Base System (MBS) — `public/models/mbs.glb`

- **Source:** Canadian Space Agency —
  ["Model of the Mobile Base System"](https://www.asc-csa.gc.ca/eng/multimedia/search/image/10181).
- **License:** reproduced for non-commercial use under the CSA's
  [Copyright / Permission to reproduce](https://www.asc-csa.gc.ca/eng/terms.asp)
  terms. Credit: **Canadian Space Agency**.
- **Modifications:** the source STL was converted to a Draco-compressed glTF
  with recomputed flat normals — see [`scripts/build-mbs.mjs`](scripts/build-mbs.mjs).
  The source STL is kept in [`assets/mbs-src/`](assets/mbs-src/).

## Mesh decompression

The models are [Draco](https://github.com/google/draco)-compressed; the decoder
in [`public/draco/`](public/draco/) ships with [three.js](https://threejs.org)
(Apache-2.0).
