import * as THREE from "three";
import type { OfficeAppearance } from "@/lib/virtual-office/domain";
import { contour, organicMesh, oval, tailoredSurface } from "./human-geometry";

/** Adult face and soft cloth, local to the neck joint. */
export function createSaudiHead(look: OfficeAppearance) {
  const head = new THREE.Group();
  head.name = "adult-head";
  head.scale.setScalar(0.85);
  const mat = (color: string) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const skin = mat(look.skin),
    hair = mat(look.hair),
    scarf = mat(look.scarf);
  organicMesh(
    head,
    tailoredSurface([
      [-0.235, 0.035, 0.052],
      [-0.215, 0.085, 0.088],
      [-0.155, 0.128, 0.113],
      [-0.06, 0.155, 0.128],
      [0.045, 0.163, 0.133],
      [0.15, 0.148, 0.122],
      [0.215, 0.105, 0.092],
      [0.245, 0.002, 0.003],
    ]),
    skin,
  ).name = "face-and-jaw";
  for (const side of [-1, 1]) {
    oval(head, [0.027, 0.058, 0.031], [side * 0.157, -0.025, 0], skin);
    oval(
      head,
      [0.012, 0.03, 0.009],
      [side * 0.177, -0.025, -0.015],
      mat(new THREE.Color(look.skin).multiplyScalar(0.82).getStyle()),
    );
    const x = side * 0.067;
    oval(head, [0.036, 0.016, 0.01], [x, 0.035, -0.123], mat("#f1e9df"));
    oval(head, [0.012, 0.013, 0.005], [x, 0.034, -0.134], mat("#473c30"));
    oval(head, [0.006, 0.009, 0.003], [x, 0.034, -0.139], mat("#17232b"));
    oval(
      head,
      [0.003, 0.003, 0.002],
      [x - 0.004, 0.039, -0.142],
      mat("#ffffff"),
    );
    contour(
      head,
      [
        [x - 0.033, 0.047, -0.125],
        [x, 0.054, -0.132],
        [x + 0.033, 0.046, -0.125],
      ],
      0.0035,
      hair,
    );
    contour(
      head,
      [
        [x - 0.038, 0.079, -0.12],
        [x, 0.091, -0.13],
        [x + 0.034, 0.078, -0.12],
      ],
      0.007,
      hair,
    );
  }
  oval(head, [0.018, 0.058, 0.026], [0, -0.006, -0.134], skin);
  oval(head, [0.027, 0.023, 0.034], [0, -0.047, -0.157], skin);
  for (const x of [-0.022, 0.022])
    oval(head, [0.016, 0.013, 0.019], [x, -0.053, -0.145], skin);
  const lip = mat(look.gender === "female" ? "#a46b64" : "#926354");
  contour(
    head,
    [
      [-0.047, -0.119, -0.109],
      [-0.02, -0.12, -0.122],
      [0, -0.124, -0.126],
      [0.025, -0.119, -0.12],
      [0.047, -0.113, -0.108],
    ],
    0.0055,
    lip,
  );
  oval(head, [0.029, 0.009, 0.007], [0, -0.134, -0.117], lip);
  if (look.gender === "male") {
    const beard = mat(
      new THREE.Color(look.skin)
        .lerp(new THREE.Color(look.hair), 0.32)
        .getStyle(),
    );
    contour(
      head,
      [
        [-0.111, -0.125, -0.073],
        [-0.078, -0.184, -0.084],
        [0, -0.216, -0.064],
        [0.078, -0.184, -0.084],
        [0.111, -0.125, -0.073],
      ],
      0.009,
      beard,
    );
  }
  if (look.headwear === "shemagh") {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff9ef";
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = look.scarf;
    ctx.lineWidth = 2;
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
    oval(head, [0.195, 0.08, 0.183], [0, 0.21, 0.025], cloth);
    clothDrape(head, cloth, 0.19, 0.37, 0.62);
    for (const y of [0.235, 0.267]) {
      const agal = organicMesh(
        head,
        new THREE.TorusGeometry(0.178, 0.014, 8, 40),
        mat("#25292b"),
        [0, y, 0.02],
      );
      agal.rotation.x = Math.PI / 2;
      agal.scale.y = 0.94;
    }
  } else if (look.headwear === "hijab") {
    oval(head, [0.18, 0.105, 0.163], [0, 0.18, 0.035], scarf);
    clothDrape(head, scarf, 0.176, 0.33, 0.6);
    contour(
      head,
      [
        [-0.15, 0.16, -0.067],
        [-0.166, 0, -0.05],
        [-0.137, -0.18, -0.046],
        [0, -0.29, -0.045],
        [0.137, -0.18, -0.046],
        [0.166, 0, -0.05],
        [0.15, 0.16, -0.067],
      ],
      0.022,
      scarf,
    );
    organicMesh(
      head,
      tailoredSurface(
        [
          [-0.48, 0.31, 0.16],
          [-0.35, 0.25, 0.14],
          [-0.27, 0.12, 0.1],
          [-0.25, 0.09, 0.075],
        ],
        0.025,
      ),
      scarf,
      [0, 0, 0.04],
    );
  } else {
    oval(head, [0.166, 0.205, 0.123], [0, 0.06, 0.067], hair);
    oval(head, [0.165, 0.095, 0.142], [0, 0.18, 0.01], hair);
    if (look.gender === "female") {
      clothDrape(head, hair, 0.155, 0.18, 0.5);
      const fringe = oval(
        head,
        [0.125, 0.052, 0.04],
        [-0.045, 0.165, -0.1],
        hair,
      );
      fringe.rotation.z = -0.24;
      for (const x of [-0.145, 0.145])
        contour(
          head,
          [
            [x, 0.12, 0.07],
            [x * 1.08, -0.09, 0.1],
            [x * 0.87, -0.28, 0.11],
          ],
          0.012,
          mat(new THREE.Color(look.hair).multiplyScalar(1.16).getStyle()),
        );
    }
  }
  return head;
}
function clothDrape(
  parent: THREE.Object3D,
  material: THREE.Material,
  top: number,
  bottom: number,
  length: number,
) {
  const points: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  const rows = 18,
    cols = 36;
  for (let r = 0; r <= rows; r++)
    for (let c = 0; c <= cols; c++) {
      const t = r / rows,
        a = -Math.PI / 2 + 0.72 + (c / cols) * (Math.PI * 2 - 1.44),
        radius = THREE.MathUtils.lerp(top, bottom, t),
        fold = Math.sin(a * 9 + t * 2) * 0.01 * t;
      points.push(
        Math.cos(a) * (radius + fold),
        0.19 - length * t,
        Math.sin(a) * (radius * 0.63 + fold) + 0.025 + 0.05 * t,
      );
      uv.push(c / cols, t);
      if (r < rows && c < cols) {
        const i = r * (cols + 1) + c;
        indices.push(i, i + 1, i + cols + 1, i + 1, i + cols + 2, i + cols + 1);
      }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  material.side = THREE.DoubleSide;
  organicMesh(parent, geometry, material);
}
