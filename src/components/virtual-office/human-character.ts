import * as THREE from "three";
import type { OfficeAppearance } from "@/lib/virtual-office/domain";
import { createSaudiHead } from "./saudi-character";
import { contour, organicMesh, oval, tailoredSurface } from "./human-geometry";

export type HumanPose = {
  time: number;
  dt: number;
  walking: boolean;
  seated: boolean;
  working?: boolean;
  playing?: boolean;
  shooter?: boolean;
  reducedMotion?: boolean;
  coffee?: boolean;
};

/** A joint hierarchy shared by every fictional teammate, real staff avatar and visitor. */
export function createOfficeCharacter(look: OfficeAppearance, accent: string) {
  const root = new THREE.Group();
  root.name = "articulated-human";
  const hips = new THREE.Group();
  hips.position.y = 1.16;
  root.add(hips);
  const spine = new THREE.Group();
  hips.add(spine);
  const mat = (color: string, roughness = 0.85) =>
    new THREE.MeshStandardMaterial({ color, roughness });
  const cloth = mat(look.clothing),
    skin = mat(look.skin, 0.72),
    shoes = mat("#283440", 0.55);
  const seam = mat(
    new THREE.Color(look.clothing).multiplyScalar(0.82).getStyle(),
  );
  const male = look.gender === "male",
    longCloth = male || look.headwear === "hijab";
  organicMesh(
    spine,
    tailoredSurface(
      [
        [-0.12, 0.18, 0.12],
        [0, 0.245, 0.155],
        [0.2, male ? 0.23 : 0.205, 0.145],
        [0.43, 0.265, 0.165],
        [0.65, 0.3, 0.15],
        [0.73, 0.27, 0.135],
        [0.8, 0.15, 0.11],
        [0.83, 0.085, 0.075],
      ],
      0.008,
    ),
    cloth,
  ).name = "tailored-torso";
  oval(spine, [0.08, 0.13, 0.075], [0, 0.86, 0], skin);
  const head = createSaudiHead(look);
  head.position.set(0, 1.04, -0.01);
  spine.add(head);
  if (male) {
    organicMesh(
      spine,
      new THREE.CylinderGeometry(0.087, 0.095, 0.09, 24),
      cloth,
      [0, 0.855, 0],
    );
    contour(
      spine,
      [
        [0, 0.81, -0.105],
        [0, 0.64, -0.158],
        [0, 0.43, -0.166],
      ],
      0.006,
      seam,
    );
    for (const y of [0.74, 0.65, 0.55])
      oval(spine, [0.009, 0.009, 0.005], [0, y, -0.166], seam);
    contour(
      spine,
      [
        [-0.2, 0.56, -0.12],
        [-0.2, 0.43, -0.145],
        [-0.11, 0.43, -0.16],
        [-0.11, 0.56, -0.145],
      ],
      0.004,
      seam,
    );
    contour(
      spine,
      [
        [-0.14, 0.57, -0.152],
        [-0.14, 0.5, -0.162],
      ],
      0.008,
      mat(accent),
    );
  } else if (!longCloth) {
    // Curved jacket lapels over an ivory blouse.
    const blouse = organicMesh(
      spine,
      tailoredSurface([
        [0.27, 0.075, 0.01],
        [0.56, 0.105, 0.012],
        [0.76, 0.085, 0.01],
      ]),
      mat("#eee7dd"),
      [0, 0, -0.158],
    );
    blouse.name = "blouse";
    for (const side of [-1, 1])
      contour(
        spine,
        [
          [side * 0.11, 0.77, -0.12],
          [side * 0.165, 0.56, -0.155],
          [side * 0.06, 0.3, -0.158],
        ],
        0.012,
        seam,
      );
  }
  const arms = [-1, 1].map((side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.305, 0.69, 0);
    spine.add(shoulder);
    const elbow = softLimb(
      shoulder,
      root,
      cloth,
      [
        [-0.69, 0.057, 0.052],
        [-0.58, 0.062, 0.058],
        [-0.43, 0.072, 0.068],
        [-0.34, 0.079, 0.074],
        [-0.19, 0.09, 0.084],
        [-0.035, 0.105, 0.105],
        [0.06, 0.067, 0.07],
        [0.08, 0.002, 0.002],
      ],
      -0.365,
    );
    const wrist = new THREE.Group();
    wrist.position.set(0, -0.342, 0);
    elbow.add(wrist);
    oval(wrist, [0.051, 0.075, 0.027], [0, -0.045, 0], skin);
    for (let finger = 0; finger < 4; finger++) {
      const length = [0.072, 0.088, 0.082, 0.064][finger];
      organicMesh(
        wrist,
        new THREE.CapsuleGeometry(0.0105, length - 0.021, 4, 8),
        skin,
        [(finger - 1.5) * 0.022, -0.108 - length / 2, 0],
      );
    }
    const thumb = organicMesh(
      wrist,
      new THREE.CapsuleGeometry(0.015, 0.045, 4, 8),
      skin,
      [side * 0.06, -0.065, -0.004],
    );
    thumb.rotation.z = side * 0.55;
    return { shoulder, elbow, wrist };
  });
  const mug = new THREE.Group();
  mug.name = "coffee-cup";
  mug.visible = false;
  mug.position.set(0.015, -0.07, -0.04);
  arms[1].wrist.add(mug);
  organicMesh(
    mug,
    new THREE.CylinderGeometry(0.044, 0.034, 0.105, 20),
    mat("#f8f3e9"),
    [0, 0.053, 0],
  );
  organicMesh(
    mug,
    new THREE.CylinderGeometry(0.037, 0.037, 0.005, 20),
    mat("#4c2e20"),
    [0, 0.108, 0],
  );
  const lip = organicMesh(
    mug,
    new THREE.TorusGeometry(0.043, 0.004, 6, 24),
    mat("#b99c63"),
    [0, 0.109, 0],
  );
  lip.rotation.x = Math.PI / 2;
  const handle = organicMesh(
    mug,
    new THREE.TorusGeometry(0.034, 0.009, 6, 20),
    mat("#f8f3e9"),
    [0.06, 0.057, 0],
  );
  handle.scale.x = 0.7;
  const legs = [-1, 1].map((side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.133, -0.035, 0);
    hips.add(hip);
    const knee = softLimb(
      hip,
      root,
      cloth,
      [
        [-0.98, 0.067, 0.065],
        [-0.84, 0.07, 0.066],
        [-0.69, 0.088, 0.082],
        [-0.52, 0.092, 0.085],
        [-0.36, 0.104, 0.095],
        [-0.12, 0.123, 0.112],
        [0.03, 0.12, 0.105],
        [0.06, 0.002, 0.002],
      ],
      -0.52,
    );
    const ankle = new THREE.Group();
    ankle.position.y = -0.48;
    knee.add(ankle);
    oval(ankle, [0.086, 0.072, 0.177], [0, -0.045, -0.069], shoes);
    oval(ankle, [0.09, 0.025, 0.18], [0, -0.09, -0.069], mat("#172634"));
    return { hip, knee, ankle };
  });
  let skirt: THREE.Mesh<THREE.BufferGeometry> | null = null,
    rest: Float32Array | null = null;
  if (longCloth) {
    skirt = organicMesh(
      hips,
      tailoredSurface(
        [
          [-1.04, 0.32, 0.225],
          [-0.96, 0.33, 0.225],
          [-0.65, 0.3, 0.2],
          [-0.35, 0.27, 0.18],
          [-0.1, 0.25, 0.158],
          [0.08, 0.235, 0.15],
        ],
        0.035,
      ),
      cloth,
    );
    skirt.name = male ? "thobe-continuous-cloth" : "abaya-continuous-cloth";
    rest = new Float32Array(skirt.geometry.getAttribute("position").array);
  }
  let sitting = 0,
    lastBend = -1;
  const damp = (current: number, target: number, dt: number) =>
    THREE.MathUtils.damp(current, target, 12, dt);
  function update(p: HumanPose) {
    const dt = Math.min(0.1, Math.max(0, p.dt));
    sitting = damp(sitting, p.seated ? 1 : 0, dt);
    if (Math.abs(sitting - (p.seated ? 1 : 0)) < 0.001)
      sitting = p.seated ? 1 : 0;
    const phase = p.time * 6.4,
      stride = p.walking ? 1 : 0,
      idle = p.reducedMotion ? 0 : 1;
    hips.position.y =
      THREE.MathUtils.lerp(1.16, 0.755, sitting) +
      Math.sin(phase * 2) * 0.018 * stride;
    hips.rotation.y = Math.sin(phase) * 0.04 * stride;
    spine.rotation.x = damp(
      spine.rotation.x,
      p.shooter ? -0.32 : p.seated ? -0.045 : 0,
      dt,
    );
    spine.rotation.z = Math.sin(phase) * 0.018 * stride;
    head.rotation.y = Math.sin(p.time * 0.55) * 0.1 * idle;
    head.rotation.x = p.working ? -0.065 : 0;
    for (let i = 0; i < 2; i++) {
      const swing = Math.sin(phase + i * Math.PI) * stride;
      const { hip, knee, ankle } = legs[i];
      hip.rotation.x = THREE.MathUtils.lerp(swing * 0.38, 1.38, sitting);
      knee.rotation.x = THREE.MathUtils.lerp(
        -Math.max(0, -swing) * 0.58 - 0.035,
        -1.38,
        sitting,
      );
      ankle.rotation.x = -(hip.rotation.x + knee.rotation.x) * 0.8;
      const { shoulder, elbow, wrist } = arms[i];
      const desk = sitting > 0.5;
      const aim = p.shooter ? (i === 0 ? 0.95 : 0.55) : 0;
      const sipping = p.coffee && i === 1;
      shoulder.rotation.x = damp(
        shoulder.rotation.x,
        sipping
          ? 1.18 + Math.sin(p.time * 1.8) * 0.04
          : desk
            ? 0.35
            : aim || -swing * 0.32,
        dt,
      );
      shoulder.rotation.z = sipping
        ? 0.6
        : (i === 0 ? -1 : 1) * (desk ? 0.11 : 0.06);
      shoulder.rotation.y = damp(shoulder.rotation.y, sipping ? 0.8 : 0, dt);
      elbow.rotation.x = damp(
        elbow.rotation.x,
        sipping
          ? 2.47 + Math.sin(p.time * 1.8) * 0.05
          : desk
            ? 1.05
            : p.shooter
              ? 0.85
              : 0.1 + Math.max(0, swing) * 0.15,
        dt,
      );
      wrist.rotation.x = desk ? -0.08 : 0;
      wrist.rotation.z = desk ? (i === 0 ? 0.16 : -0.16) : 0;
      if (p.working && desk)
        wrist.rotation.x += Math.sin(p.time * 8 + i * 2) * 0.035 * idle;
    }
    mug.visible = !!p.coffee;
    mug.quaternion
      .copy(spine.quaternion)
      .multiply(arms[1].shoulder.quaternion)
      .multiply(arms[1].elbow.quaternion)
      .multiply(arms[1].wrist.quaternion)
      .invert();
    if (
      skirt &&
      rest &&
      (Math.abs(sitting - lastBend) > 0.0001 || p.walking || lastBend < 0)
    ) {
      const attr = skirt.geometry.getAttribute("position");
      for (let i = 0; i < attr.count; i++) {
        const x = rest[i * 3],
          y = rest[i * 3 + 1],
          z = rest[i * 3 + 2],
          down = Math.max(0, -y);
        const thigh = Math.min(0.54, down),
          shin = Math.max(0, down - 0.54),
          bend = sitting * 1.38;
        attr.setXYZ(
          i,
          x + Math.sin(phase) * 0.018 * stride * down,
          y >= 0 ? y : -Math.cos(bend) * thigh - shin,
          z -
            Math.sin(bend) * thigh +
            Math.sin(phase + x * 6) * 0.035 * stride * down,
        );
      }
      attr.needsUpdate = true;
      skirt.geometry.computeVertexNormals();
      skirt.geometry.computeBoundingSphere();
      lastBend = sitting;
    }
  }
  update({ time: 0, dt: 1, walking: false, seated: false });
  return { root, update };
}

/** GPU skinning blends across a joint so a sleeve bends as one piece of cloth. */
function softLimb(
  parent: THREE.Object3D,
  root: THREE.Object3D,
  material: THREE.Material,
  profile: readonly (readonly [number, number, number])[],
  jointY: number,
) {
  const geometry = tailoredSurface(profile),
    positions = geometry.getAttribute("position");
  const indices: number[] = [],
    weights: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    const blend = THREE.MathUtils.smoothstep(
      jointY - positions.getY(i),
      -0.065,
      0.065,
    );
    indices.push(0, 1, 0, 0);
    weights.push(1 - blend, blend, 0, 0);
  }
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(indices, 4),
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute(weights, 4),
  );
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  const upper = new THREE.Bone(),
    joint = new THREE.Bone();
  joint.position.y = jointY;
  upper.add(joint);
  mesh.add(upper);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([upper, joint]));
  // Conservative animated bound covers the entire bent limb, including ray picking.
  mesh.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, jointY * 0.6, 0),
    1.3,
  );
  return joint;
}
