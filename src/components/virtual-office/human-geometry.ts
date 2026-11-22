import * as THREE from "three";
type XYZ = readonly [number, number, number];
/** Elliptical cross-sections form a continuous, smooth shoulder/waist silhouette. */
export function tailoredSurface(profile: readonly XYZ[], folds = 0) {
  const curve = new THREE.CatmullRomCurve3(
    profile.map(([y, w, d]) => new THREE.Vector3(w, y, d)),
  );
  const vertices: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  const rows = 28,
    sides = 32;
  for (let r = 0; r <= rows; r++) {
    const t = r / rows,
      p = curve.getPoint(t);
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * Math.PI * 2,
        pleat = 1 + Math.sin(a * 10 + t * 0.5) * folds * (1 - t);
      vertices.push(Math.cos(a) * p.x * pleat, p.y, Math.sin(a) * p.z * pleat);
      uv.push(s / sides, t);
      if (r < rows && s < sides) {
        const i = r * (sides + 1) + s;
        indices.push(
          i,
          i + sides + 1,
          i + 1,
          i + 1,
          i + sides + 1,
          i + sides + 2,
        );
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
export function organicMesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  at: XYZ = [0, 0, 0],
) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...at);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
export function oval(
  parent: THREE.Object3D,
  size: XYZ,
  at: XYZ,
  material: THREE.Material,
) {
  const mesh = organicMesh(
    parent,
    new THREE.SphereGeometry(1, 24, 16),
    material,
    at,
  );
  mesh.scale.set(...size);
  return mesh;
}
export function contour(
  parent: THREE.Object3D,
  points: readonly XYZ[],
  radius: number,
  material: THREE.Material,
) {
  return organicMesh(
    parent,
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))),
      20,
      radius,
      6,
      false,
    ),
    material,
  );
}
