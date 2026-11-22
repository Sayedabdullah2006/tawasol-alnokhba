import * as THREE from "three";
import {
  POOL,
  POCKETS,
  newPoolGame,
  stepPool,
  shootPool,
  aimPool,
} from "./pool-physics";
export function createOfficePool(scene: THREE.Scene, z: number, players = 6) {
  let game = newPoolGame(players);
  const root = new THREE.Group();
  root.position.z = z;
  scene.add(root);
  function box(
    size: [number, number, number],
    at: [number, number, number],
    color: string,
  ) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(...size),
      new THREE.MeshStandardMaterial({ color, roughness: 0.6 }),
    );
    m.position.set(...at);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    return m;
  }
  box([6.15, 0.5, 3.35], [0, 0.85, 0], "#253e5f");
  box([5.95, 0.16, 3.15], [0, 1.12, 0], "#ba9965");
  box([5.4, 0.035, 2.55], [0, 1.23, 0], "#207267");
  for (const x of [-2.35, 2.35])
    for (const zz of [-1.1, 1.1])
      box([0.24, 0.75, 0.24], [x, 0.4, zz], "#29435d");
  for (const [x, zz] of POCKETS) {
    const p = new THREE.Mesh(
      new THREE.CylinderGeometry(0.225, 0.225, 0.04, 24),
      new THREE.MeshStandardMaterial({ color: "#102323" }),
    );
    p.position.set(x, 1.255, zz);
    root.add(p);
  }
  for (const x of [-2, -1, 0, 1, 2])
    for (const side of [-1, 1])
      box([0.035, 0.02, 0.05], [x, 1.215, side * 1.48], "#f3e1b6");
  const colors = [
    "#f9f6e9",
    "#e1bd38",
    "#386eaa",
    "#c4584d",
    "#72518c",
    "#db843d",
    "#2e8667",
    "#834437",
    "#25303d",
    "#e5c446",
  ];
  const balls = Array.from({ length: 10 }, (_, id) => {
    const group = new THREE.Group();
    root.add(group);
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(POOL.radius, 20, 14),
      new THREE.MeshStandardMaterial({ color: colors[id], roughness: 0.27 }),
    );
    sphere.castShadow = true;
    group.add(sphere);
    if (id > 0) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff9e9";
      ctx.beginPath();
      ctx.arc(64, 64, 61, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#20354b";
      ctx.font = "bold 82px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(id), 64, 69);
      const label = new THREE.Mesh(
        new THREE.CircleGeometry(0.063, 24),
        new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(canvas),
          transparent: true,
        }),
      );
      label.rotation.x = -Math.PI / 2;
      label.position.y = POOL.radius + 0.002;
      group.add(label);
    }
    return group;
  });
  const cue = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.029, 1.9, 12),
    new THREE.MeshStandardMaterial({ color: "#d6b984" }),
  );
  root.add(cue);
  let lastShot = 0;
  return {
    get game() {
      return game;
    },
    reset() {
      game = newPoolGame(players);
      lastShot = 0;
    },
    shoot(angle = aimPool(game)) {
      const ok = shootPool(game, angle, game.shots === 0 ? 4.8 : 3.6);
      if (ok) lastShot = performance.now();
      return ok;
    },
    update(dt: number, active: boolean) {
      if (active) stepPool(game, dt);
      for (const b of game.balls) {
        const mesh = balls[b.id];
        mesh.visible = b.alive;
        mesh.position.set(b.x, 1.27 + POOL.radius, b.z);
      }
      const white = game.balls[0];
      cue.visible = active && !game.moving && game.winner === null;
      const angle = aimPool(game);
      cue.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)),
      );
      cue.position.set(
        white.x - Math.cos(angle) * 1.1,
        1.4,
        white.z - Math.sin(angle) * 1.1,
      );
      return lastShot;
    },
  };
}
