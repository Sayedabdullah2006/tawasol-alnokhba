"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { OFFICE_AGENTS, type AgentId } from "@/lib/virtual-office/domain";
import s from "./office.module.css";

type Props = {
  selected: AgentId;
  active: AgentId[];
  meeting: boolean;
  onSelect: (id: AgentId) => void;
};
type SceneApi = {
  focus: (id?: AgentId) => void;
  zoom: (amount: number) => void;
  rotate: () => void;
};

export default function OfficeScene({
  selected,
  active,
  meeting,
  onSelect,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef(new Map<AgentId, HTMLButtonElement>());
  const live = useRef({ selected, active, meeting, onSelect });
  const api = useRef<SceneApi | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    live.current = { selected, active, meeting, onSelect };
  }, [selected, active, meeting, onSelect]);
  useEffect(() => {
    if (!host.current) return;
    const container: HTMLDivElement = host.current;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
    } catch {
      queueMicrotask(() => setFailed(true));
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.domElement.setAttribute("aria-hidden", "true");
    container.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-14, 14, 11, -11, 0.1, 100);
    camera.position.set(19, 23, 26);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.3, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.enablePan = false;
    controls.minZoom = 0.65;
    controls.maxZoom = 2.6;
    controls.minPolarAngle = 0.3;
    controls.maxPolarAngle = Math.PI / 2.55;
    controls.touches.ONE = null;
    renderer.domElement.style.touchAction = "pan-y";
    const light = new THREE.DirectionalLight("#fff3dd", 3.5);
    light.position.set(5, 15, 7);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    Object.assign(light.shadow.camera, {
      left: -13,
      right: 13,
      top: 12,
      bottom: -12,
      far: 40,
    });
    light.shadow.normalBias = 0.04;
    scene.add(light, new THREE.HemisphereLight("#eaf3ff", "#969eb0", 3));
    const fill = new THREE.DirectionalLight("#a9c8fa", 1.5);
    fill.position.set(-10, 8, -5);
    scene.add(fill);
    const materials = new Map<string, THREE.MeshStandardMaterial>();
    function mat(color: string, roughness = 0.65, metalness = 0) {
      const key = `${color}:${roughness}:${metalness}`;
      if (!materials.has(key))
        materials.set(
          key,
          new THREE.MeshStandardMaterial({ color, roughness, metalness }),
        );
      return materials.get(key)!;
    }
    function box(
      parent: THREE.Object3D,
      size: number[],
      at: number[],
      color: string,
    ) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(...(size as [number, number, number])),
        mat(color),
      );
      mesh.position.set(...(at as [number, number, number]));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    }
    function cylinder(
      parent: THREE.Object3D,
      radius: number,
      height: number,
      at: number[],
      color: string,
      bottom = radius,
    ) {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, bottom, height, 24),
        mat(color),
      );
      mesh.position.set(...(at as [number, number, number]));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    }
    function sphere(
      parent: THREE.Object3D,
      radius: number,
      at: number[],
      color: string,
    ) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 16, 12),
        mat(color),
      );
      mesh.position.set(...(at as [number, number, number]));
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    }
    function plant(x: number, z: number, scale = 1) {
      const p = new THREE.Group();
      p.position.set(x, 0, z);
      p.scale.setScalar(scale);
      scene.add(p);
      cylinder(p, 0.3, 0.55, [0, 0.3, 0], "#b9a17d", 0.23);
      cylinder(p, 0.025, 1.4, [0, 1, 0], "#51734c");
      for (let i = 0; i < 7; i++) {
        const angle = i * 2.4;
        const leaf = sphere(
          p,
          0.3,
          [Math.cos(angle) * 0.28, 0.8 + i * 0.14, Math.sin(angle) * 0.28],
          i % 2 ? "#4c715b" : "#73956b",
        );
        leaf.scale.set(0.6, 1.3, 0.8);
        leaf.rotation.z = Math.cos(angle) * 0.65;
      }
    }
    function textPlane(
      text: string,
      width: number,
      height: number,
      background: string,
      foreground: string,
    ) {
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 256;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, 1024, 256);
      ctx.font = "bold 100px Arial";
      ctx.fillStyle = foreground;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.direction = "rtl";
      ctx.fillText(text, 512, 130);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshBasicMaterial({ map: texture }),
      );
      return plane;
    }
    // A cutaway editorial floor, with the brand's navy and brass rather than a generic game room.
    box(scene, [20.5, 0.5, 15.5], [0, -0.4, 0], "#263d61");
    box(scene, [20, 0.15, 15], [0, -0.08, 0], "#e2e8ee");
    for (let x = -9; x < 10; x += 2)
      for (let z = -6.5; z < 7; z += 2)
        box(
          scene,
          [1.97, 0.015, 1.97],
          [x, 0.008, z],
          (x + z) % 4 ? "#e4e9ee" : "#dbe3eb",
        );
    box(scene, [20, 3.8, 0.2], [0, 1.9, -7.5], "#e9edf3");
    box(scene, [0.2, 3.8, 15], [-10, 1.9, 0], "#d9e1ed");
    box(scene, [20, 0.12, 0.23], [0, 3.85, -7.5], "#bda26d");
    for (const x of [-6, 6]) {
      box(scene, [4.8, 2.2, 0.12], [x, 2.25, -7.34], "#2f4b70");
      box(scene, [4.5, 1.9, 0.13], [x, 2.25, -7.25], "#b6d3e8");
      box(scene, [0.08, 2, 0.15], [x, 2.25, -7.15], "#f0f5f9");
      box(scene, [4.5, 0.08, 0.15], [x, 2.25, -7.15], "#f0f5f9");
    }
    const sign = textPlane("تواصل النخبة", 4.7, 1.2, "#203f68", "#ead8ae");
    sign.position.set(0, 2.55, -7.32);
    scene.add(sign);
    box(scene, [4.7, 0.08, 0.1], [0, 1.75, -7.3], "#bda26d");
    // Editorial library.
    box(scene, [0.55, 2.7, 3.6], [-9.45, 1.35, -3.8], "#294366");
    for (let shelf = 0; shelf < 3; shelf++) {
      box(
        scene,
        [0.7, 0.08, 3.65],
        [-9.35, 0.4 + shelf * 0.85, -3.8],
        "#bda26d",
      );
      for (let b = 0; b < 10; b++)
        box(
          scene,
          [0.35, 0.38 + (b % 3) * 0.1, 0.12],
          [-9.12, 0.65 + shelf * 0.85, -5.3 + b * 0.3],
          ["#8b627b", "#e7d3a8", "#52768c", "#6b8e80"][b % 4],
        );
    }
    // Meeting island.
    const rug = cylinder(scene, 2.9, 0.025, [0, 0.05, 1.2], "#b9cbdc");
    rug.scale.z = 1.35;
    const tabletop = cylinder(scene, 1.9, 0.18, [0, 1.15, 1.2], "#c2a47a");
    tabletop.scale.z = 1.5;
    cylinder(scene, 0.65, 1, [0, 0.55, 1.2], "#304b6e");
    box(scene, [0.9, 0.035, 0.6], [-0.5, 1.27, 1], "#f7f8fa");
    box(scene, [0.7, 0.04, 0.5], [0.65, 1.28, 1.8], "#26496a");
    cylinder(scene, 0.12, 0.17, [0.6, 1.33, 0.5], "#f7f8fa");
    const seats = [
      [-2.15, -0.2],
      [-2.3, 1.6],
      [-1.6, 3.5],
      [2.15, -0.2],
      [2.3, 1.6],
      [1.6, 3.5],
    ];
    seats.forEach(([x, z]) => {
      box(scene, [0.65, 0.15, 0.65], [x, 0.6, z], "#526985");
      cylinder(scene, 0.08, 0.55, [x, 0.3, z], "#30465e");
    });
    plant(-8.8, 6.2, 1.3);
    plant(8.5, -6, 1.5);
    plant(3.2, -6.5, 0.9);
    box(scene, [2.6, 0.75, 0.85], [-3, 0.4, -6.4], "#748fa5");
    box(scene, [2.6, 0.85, 0.3], [-3, 1, -6.65], "#748fa5");
    const clickable: THREE.Object3D[] = [];
    const people = OFFICE_AGENTS.map((agent, index) => {
      const [x, z] = agent.position;
      const station = new THREE.Group();
      station.position.set(x, 0, z - 0.6);
      scene.add(station);
      const top = box(station, [2.6, 0.16, 1.35], [0, 1.08, 0], "#cbb18b");
      top.userData.agent = agent.id;
      clickable.push(top);
      for (const dx of [-1.05, 1.05])
        for (const dz of [-0.45, 0.45])
          box(station, [0.09, 1, 0.09], [dx, 0.5, dz], "#31465e");
      box(station, [0.12, 0.32, 0.12], [0, 1.33, -0.32], "#263d58");
      box(station, [0.65, 0.04, 0.35], [0, 1.2, -0.3], "#263d58");
      const monitor = box(
        station,
        [1.25, 0.8, 0.1],
        [0, 1.74, -0.35],
        "#243b55",
      );
      const screen = box(
        station,
        [1.1, 0.65, 0.02],
        [0, 1.74, -0.288],
        agent.color,
      );
      for (let l = 0; l < 4; l++)
        box(
          station,
          [0.6 - (l % 2) * 0.2, 0.025, 0.024],
          [-0.12, 1.92 - l * 0.12, -0.27],
          "#c3d9e7",
        );
      monitor.userData.agent = agent.id;
      clickable.push(monitor);
      box(station, [0.75, 0.04, 0.28], [0, 1.19, 0.36], "#e1e7ec");
      cylinder(station, 0.1, 0.18, [0.88, 1.24, 0.35], "#edf2f5");
      box(station, [0.4, 0.05, 0.5], [-0.85, 1.2, 0.25], agent.color);
      // A sculpted desk character: face, hair, clothing, arms, chair and shoes.
      const person = new THREE.Group();
      person.position.set(x, 0, z + 0.55);
      scene.add(person);
      box(person, [0.8, 0.15, 0.72], [0, 0.63, 0.12], "#354b69");
      box(person, [0.8, 0.85, 0.15], [0, 1.05, 0.45], "#354b69");
      cylinder(person, 0.07, 0.55, [0, 0.3, 0.1], "#263b54");
      for (let i = 0; i < 5; i++) {
        const leg = box(person, [0.08, 0.06, 0.65], [0, 0.1, 0.1], "#263b54");
        leg.rotation.y = (i * Math.PI) / 2.5;
      }
      box(person, [0.62, 0.65, 0.4], [0, 1.02, 0], agent.color);
      const skin =
        index % 3 === 0 ? "#c9946e" : index % 3 === 1 ? "#d8aa83" : "#b97f59";
      const head = sphere(person, 0.29, [0, 1.63, -0.02], skin);
      head.scale.set(0.85, 1.12, 0.9);
      const hair = sphere(
        person,
        0.3,
        [0, 1.75, 0.025],
        index === 3 || index === 4 ? agent.color : "#28303b",
      );
      hair.scale.set(0.89, 0.66, 1);
      if (index === 0 || index === 5) {
        const hat = sphere(person, 0.305, [0, 1.8, 0.02], "#eff3f5");
        hat.scale.set(1, 0.44, 1);
      }
      for (const dx of [-0.1, 0.1])
        sphere(person, 0.025, [dx, 1.66, -0.27], "#263546");
      const arms: THREE.Mesh[] = [];
      for (const dx of [-0.4, 0.4]) {
        const arm = box(
          person,
          [0.18, 0.18, 0.55],
          [dx, 1.17, -0.24],
          agent.color,
        );
        arms.push(arm);
        sphere(person, 0.095, [dx, 1.16, -0.53], skin);
        box(person, [0.22, 0.45, 0.24], [dx * 0.52, 0.45, -0.25], "#314256");
        box(person, [0.24, 0.12, 0.37], [dx * 0.52, 0.19, -0.32], "#23344b");
      }
      person.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.userData.agent = agent.id;
          clickable.push(o);
        }
      });
      const marker = new THREE.Mesh(
        new THREE.TorusGeometry(0.7, 0.035, 8, 48),
        mat("#c4a05a"),
      );
      marker.rotation.x = Math.PI / 2;
      marker.position.set(x, 0.05, z + 0.55);
      scene.add(marker);
      return {
        id: agent.id,
        person,
        head,
        arms,
        screen,
        marker,
        home: new THREE.Vector3(x, 0, z + 0.55),
        seat: new THREE.Vector3(seats[index][0], 0, seats[index][1]),
        index,
      };
    });
    let targetCamera: THREE.Vector3 | null = null,
      targetLook: THREE.Vector3 | null = null;
    api.current = {
      focus(id) {
        const person = people.find((p) => p.id === id);
        const at = person
          ? person.person.position.clone()
          : new THREE.Vector3(0, 0, 0);
        targetLook = at.clone().add(new THREE.Vector3(0, 0.5, 0));
        targetCamera = at.clone().add(new THREE.Vector3(19, 23, 26));
        camera.zoom = person ? 1.6 : 1;
        camera.updateProjectionMatrix();
      },
      zoom(amount) {
        camera.zoom = THREE.MathUtils.clamp(camera.zoom * amount, 0.65, 2.6);
        camera.updateProjectionMatrix();
      },
      rotate() {
        const offset = camera.position
          .clone()
          .sub(controls.target)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
        camera.position.copy(controls.target.clone().add(offset));
      },
    };
    let down = { x: 0, y: 0 };
    const ray = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    const pointerDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
      targetCamera = targetLook = null;
    };
    const pointerUp = (e: PointerEvent) => {
      if (Math.hypot(down.x - e.clientX, down.y - e.clientY) > 7) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      ray.setFromCamera(pointer, camera);
      const hit = ray.intersectObjects(clickable)[0];
      if (hit?.object.userData.agent)
        live.current.onSelect(hit.object.userData.agent as AgentId);
    };
    const contextLost = (e: Event) => {
      e.preventDefault();
      setFailed(true);
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    const resize = new ResizeObserver(() => {
      const w = container.clientWidth,
        h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      const aspect = w / h;
      const halfHeight = Math.max(12.5, 13.5 / aspect);
      camera.left = -halfHeight * aspect;
      camera.right = halfHeight * aspect;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
    });
    resize.observe(container);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = true,
      frame = 0,
      previous = 0;
    const visibility = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
    });
    visibility.observe(container);
    const project = new THREE.Vector3();
    function draw(now: number) {
      frame = requestAnimationFrame(draw);
      if (!visible || document.hidden || now - previous < 32) return;
      previous = now;
      if (targetCamera && targetLook) {
        camera.position.lerp(targetCamera, reduced.matches ? 1 : 0.1);
        controls.target.lerp(targetLook, reduced.matches ? 1 : 0.1);
        if (camera.position.distanceTo(targetCamera) < 0.02)
          targetCamera = targetLook = null;
      }
      const t = now * 0.001;
      for (const p of people) {
        const running = live.current.active.includes(p.id),
          gathering = live.current.meeting;
        p.person.position.lerp(
          gathering ? p.seat : p.home,
          reduced.matches ? 1 : 0.07,
        );
        p.person.rotation.y = gathering
          ? p.index < 3
            ? -Math.PI / 2
            : Math.PI / 2
          : 0;
        p.marker.visible = live.current.selected === p.id;
        p.marker.position.x = p.person.position.x;
        p.marker.position.z = p.person.position.z;
        p.head.rotation.z =
          !reduced.matches && running ? Math.sin(t * 2 + p.index) * 0.04 : 0;
        p.arms.forEach((arm, i) => {
          arm.rotation.x =
            !reduced.matches && running ? Math.sin(t * 8 + i * 2) * 0.08 : 0;
        });
        p.screen.material = mat(running ? "#4d9d9e" : agentColor(p.id));
        const label = labels.current.get(p.id);
        if (label) {
          project
            .copy(p.person.position)
            .add(new THREE.Vector3(0, 2.55, 0))
            .project(camera);
          label.style.transform = `translate(-50%,-50%) translate(${(project.x * 0.5 + 0.5) * container.clientWidth}px,${(-project.y * 0.5 + 0.5) * container.clientHeight}px)`;
          label.style.visibility = project.z > 1 ? "hidden" : "visible";
        }
      }
      controls.update();
      renderer.render(scene, camera);
    }
    function agentColor(id: AgentId) {
      return OFFICE_AGENTS.find((a) => a.id === id)!.color;
    }
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      visibility.disconnect();
      controls.dispose();
      api.current = null;
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      const textures = new Set<THREE.Texture>();
      const mats = new Set<THREE.Material>();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const list = Array.isArray(o.material) ? o.material : [o.material];
          list.forEach((m) => {
            mats.add(m);
            if (m.map) textures.add(m.map);
          });
        }
      });
      textures.forEach((t) => t.dispose());
      materials.forEach((m) => mats.add(m));
      mats.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <div className={s.sceneWrap}>
      {failed ? (
        <div className={s.sceneFallback}>
          <strong>اختر موظفًا من قائمة الفريق</strong>
          <p>
            تعذر تشغيل العرض الثلاثي الأبعاد على هذا الجهاز. المحادثات والمهام
            متاحة بالكامل.
          </p>
        </div>
      ) : (
        <>
          <div ref={host} className={s.canvasHost}>
            {OFFICE_AGENTS.map((agent) => (
              <button
                key={agent.id}
                ref={(el) => {
                  if (el) labels.current.set(agent.id, el);
                  else labels.current.delete(agent.id);
                }}
                className={`${s.sceneLabel} ${selected === agent.id ? s.labelSelected : ""}`}
                onClick={() => onSelect(agent.id)}
                aria-pressed={selected === agent.id}
              >
                <span style={{ background: agent.color }} />
                {agent.name}
                {active.includes(agent.id) && <small>يعمل</small>}
              </button>
            ))}
          </div>
          <div className={s.sceneCaption}>
            <span>مكتب التحرير</span>
            <small>اسحب للدوران · اختر موظفًا للتحدث معه</small>
          </div>
          <div className={s.cameraTools} aria-label="التحكم في عرض المكتب">
            <button
              onClick={() => api.current?.zoom(1.15)}
              aria-label="تقريب المكتب"
            >
              ＋
            </button>
            <button
              onClick={() => api.current?.zoom(1 / 1.15)}
              aria-label="إبعاد المكتب"
            >
              −
            </button>
            <button
              onClick={() => api.current?.rotate()}
              aria-label="تدوير المكتب"
            >
              ↻
            </button>
            <button onClick={() => api.current?.focus(selected)}>
              مكتب الموظف
            </button>
            <button onClick={() => api.current?.focus()}>المكتب كاملًا</button>
          </div>
        </>
      )}
    </div>
  );
}
