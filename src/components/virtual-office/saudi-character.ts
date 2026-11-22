import * as THREE from "three";
import type { OfficeAppearance } from "@/lib/virtual-office/domain";

/** Actual cloth geometry and a woven red/ivory texture, not a hat painted on a head. */
export function createSaudiHead(look: OfficeAppearance) {
  const group = new THREE.Group();
  group.position.set(0, 1.64, -0.02);
  const material = (color: string) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  function ellipsoid(
    radius: number,
    at: number[],
    scale: number[],
    color: string,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 24, 16),
      material(color),
    );
    mesh.position.set(at[0], at[1], at[2]);
    mesh.scale.set(scale[0], scale[1], scale[2]);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  }
  function panel(size: number[], at: number[], mat: THREE.Material) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size[0], size[1], size[2]),
      mat,
    );
    mesh.position.set(at[0], at[1], at[2]);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  }
  ellipsoid(0.29, [0, 0, 0], [0.88, 1.12, 0.91], look.skin);
  for (const x of [-0.26, 0.26])
    ellipsoid(0.064, [x, -0.015, 0], [0.6, 1, 0.8], look.skin);
  ellipsoid(0.043, [0, -0.005, -0.258], [0.65, 0.9, 0.7], look.skin);
  for (const x of [-0.1, 0.1]) {
    ellipsoid(0.023, [x, 0.045, -0.257], [1, 1, 0.45], "#26313a");
    const brow = panel(
      [0.075, 0.018, 0.018],
      [x, 0.105, -0.253],
      material(look.hair),
    );
    brow.rotation.z = x < 0 ? -0.06 : 0.06;
  }
  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.059, 0.008, 6, 18, Math.PI * 0.65),
    material("#85533e"),
  );
  smile.position.set(0.027, -0.12, -0.26);
  smile.rotation.z = Math.PI * 1.17;
  group.add(smile);
  if (look.headwear === "shemagh") {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff9ef";
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = look.scarf;
    ctx.lineWidth = 2.2;
    for (let y = -16; y < 145; y += 16)
      for (let x = -16; x < 145; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, y + 8);
        ctx.lineTo(x + 8, y);
        ctx.lineTo(x + 16, y + 8);
        ctx.lineTo(x + 8, y + 16);
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = look.scarf;
        ctx.fillRect(x + 6, y + 6, 4, 4);
      }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const cloth = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 1,
      side: THREE.DoubleSide,
    });
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(0.335, 24, 16),
      cloth,
    );
    crown.position.set(0, 0.21, 0.025);
    crown.scale.set(1, 0.48, 1);
    crown.castShadow = true;
    group.add(crown);
    const folds = new THREE.BufferGeometry();
    folds.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          -0.29, 0.18, 0.13, 0, 0.2, 0.27, 0.29, 0.18, 0.13, -0.39, -0.53, 0.22,
          0, -0.57, 0.35, 0.39, -0.53, 0.22,
        ],
        3,
      ),
    );
    folds.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(
        [0, 1, 0.5, 1, 1, 1, 0, 0, 0.5, 0, 1, 0],
        2,
      ),
    );
    folds.setIndex([0, 1, 3, 1, 4, 3, 1, 2, 4, 2, 5, 4]);
    folds.computeVertexNormals();
    const cape = new THREE.Mesh(folds, cloth);
    cape.castShadow = true;
    group.add(cape);
    for (const x of [-0.295, 0.295]) {
      const drape = panel([0.105, 0.56, 0.28], [x, -0.1, 0.035], cloth);
      drape.rotation.z = x < 0 ? -0.12 : 0.12;
    }
    for (const y of [0.265, 0.305]) {
      const agal = new THREE.Mesh(
        new THREE.TorusGeometry(0.293, 0.027, 10, 40),
        material("#22272b"),
      );
      agal.rotation.x = Math.PI / 2;
      agal.scale.y = 0.92;
      agal.position.set(0, y, 0.025);
      agal.castShadow = true;
      group.add(agal);
    }
  } else if (look.headwear === "hijab") {
    ellipsoid(0.32, [0, 0.01, 0.125], [1.06, 1.31, 0.82], look.scarf);
    ellipsoid(0.324, [0, 0.2, 0.015], [1, 0.55, 1], look.scarf);
    for (const x of [-0.265, 0.265]) {
      const side = panel(
        [0.13, 0.52, 0.28],
        [x, -0.09, 0.015],
        material(look.scarf),
      );
      side.rotation.z = x < 0 ? -0.14 : 0.14;
    }
    const drape = new THREE.Mesh(
      new THREE.CylinderGeometry(0.155, 0.43, 0.52, 24, 1, true),
      material(look.scarf),
    );
    drape.position.set(0, -0.4, 0.065);
    drape.scale.z = 0.7;
    drape.castShadow = true;
    group.add(drape);
  } else {
    ellipsoid(0.31, [0, -0.015, 0.12], [1.06, 1.25, 0.82], look.hair);
    ellipsoid(0.31, [0, 0.2, 0.015], [1, 0.56, 1], look.hair);
    const fringe = ellipsoid(
      0.21,
      [-0.1, 0.2, -0.17],
      [1, 0.45, 0.66],
      look.hair,
    );
    fringe.rotation.z = -0.3;
    ellipsoid(0.15, [0.02, -0.1, 0.35], [0.75, 1.25, 0.85], look.hair);
  }
  return group;
}
