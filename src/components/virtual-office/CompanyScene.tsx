"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { OfficeStaff } from "@/lib/virtual-office/domain";
import { companyRooms } from "@/lib/virtual-office/scene-layout";
import type { DepartmentId } from "@/lib/virtual-office/departments";
import { createOfficeCharacter } from "./human-character";
import PresenceBadge from "./OfficePresence";
import s from "./office.module.css";

type Props = {
  staff: OfficeStaff[];
  department: DepartmentId;
  onEnter: (department: DepartmentId) => void;
};
const compactSnapshot = () => window.matchMedia("(max-width: 600px)").matches;
const subscribeCompact = (changed: () => void) => {
  const media = window.matchMedia("(max-width: 600px)");
  media.addEventListener("change", changed);
  return () => media.removeEventListener("change", changed);
};
/** One physical company floor. Department doors lead into the detailed office. */
export default function CompanyScene({ staff, department, onEnter }: Props) {
  const compact = useSyncExternalStore(
    subscribeCompact,
    compactSnapshot,
    () => false,
  );
  const host = useRef<HTMLDivElement>(null),
    wrap = useRef<HTMLDivElement>(null);
  const doors = useRef(new Map<string, HTMLButtonElement>());
  const api = useRef<{
    zoom: (factor: number) => void;
    reset: () => void;
    focus: (id: DepartmentId) => void;
  } | null>(null);
  const live = useRef({ staff, onEnter });
  const [failed, setFailed] = useState(false),
    [expanded, setExpanded] = useState(false),
    [full, setFull] = useState(false),
    [hovered, setHovered] = useState<string | null>(null);
  const signature = staff
    .map((p) => `${p.id}:${p.name}:${p.officeDepartment}:${p.appearance}`)
    .join("|");
  const rooms = companyRooms(staff, compact ? 2 : 4);
  useEffect(() => {
    live.current = { staff, onEnter };
  }, [staff, onEnter]);
  useEffect(() => {
    const changed = () => setFull(document.fullscreenElement === wrap.current),
      escape = (e: KeyboardEvent) => {
        if (e.key === "Escape") setExpanded(false);
      };
    document.addEventListener("fullscreenchange", changed);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("fullscreenchange", changed);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const container: HTMLDivElement = element;
    const columns = compact ? 2 : 4;
    const layout = companyRooms(live.current.staff, columns),
      depth = layout[0].depth,
      floorWidth = columns * 20 + 2,
      floorLength = (8 / columns) * (depth + 8) - 8 + 3,
      receptionX = compact ? -12 : -29,
      coffeeX = compact ? 12 : 30;
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.style.touchAction = "none";
    container.prepend(renderer.domElement);
    const scene = new THREE.Scene(),
      camera = new THREE.OrthographicCamera(-50, 50, 40, -40, 0.1, 300);
    const overview = compact
      ? new THREE.Vector3(10, 100, 70)
      : new THREE.Vector3(43, 64, 73);
    camera.position.copy(overview);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.minZoom = 0.02;
    controls.maxZoom = Infinity;
    controls.minPolarAngle = 0.2;
    controls.maxPolarAngle = Math.PI / 2.3;
    scene.add(new THREE.HemisphereLight("#eaf3ff", "#9ca7b7", 3));
    const sun = new THREE.DirectionalLight("#fff0d4", 3.5);
    sun.position.set(-20, 45, 25);
    scene.add(sun);
    const materials = new Map<string, THREE.MeshStandardMaterial>();
    const mat = (color: string) => {
      if (!materials.has(color))
        materials.set(
          color,
          new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
        );
      return materials.get(color)!;
    };
    const box = (
      parent: THREE.Object3D,
      size: [number, number, number],
      at: [number, number, number],
      color: string,
    ) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat(color));
      m.position.set(...at);
      parent.add(m);
      return m;
    };
    function plaque(
      parent: THREE.Object3D,
      text: string,
      at: [number, number, number],
      width: number,
    ) {
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 192;
      const c = canvas.getContext("2d")!;
      c.fillStyle = "#203f68";
      c.fillRect(0, 0, 1024, 192);
      c.fillStyle = "#eddbb4";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.direction = "rtl";
      c.font = "bold 75px Cairo, Arial";
      c.fillText(text, 512, 100, 960);
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(width, (width * 192) / 1024),
        new THREE.MeshBasicMaterial({ map: t }),
      );
      m.position.set(...at);
      parent.add(m);
      return m;
    }
    function plant(parent: THREE.Object3D, x: number, z: number) {
      const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.25, 0.65, 12),
        mat("#c8b48c"),
      );
      pot.position.set(x, 0.32, z);
      parent.add(pot);
      for (let i = 0; i < 4; i++) {
        const leaf = new THREE.Mesh(
          new THREE.SphereGeometry(0.34, 10, 8),
          mat(i % 2 ? "#577d63" : "#7b9b74"),
        );
        leaf.scale.set(0.7, 1.5, 0.8);
        leaf.position.set(
          x + Math.cos(i * 2) * 0.18,
          0.9 + i * 0.18,
          z + Math.sin(i * 2) * 0.15,
        );
        parent.add(leaf);
      }
    }
    box(scene, [floorWidth, 0.5, floorLength], [0, -0.35, 0], "#203f68");
    box(
      scene,
      [floorWidth - 0.2, 0.16, floorLength - 0.2],
      [0, -0.05, 0],
      "#e8edf1",
    );
    box(scene, [floorWidth - 0.5, 0.025, 6.6], [0, 0.055, 0], "#cddbe3");
    for (let x = -floorWidth / 2 + 1; x <= floorWidth / 2; x += 4)
      box(scene, [0.025, 0.025, floorLength - 1], [x, 0.065, 0], "#d4dce3");
    // Reception and coffee counter occupy the shared central corridor.
    box(scene, [8, 1.05, 1.2], [receptionX, 0.58, 0], "#203f68");
    box(scene, [8.2, 0.12, 1.4], [receptionX, 1.15, 0], "#d3bd97");
    plaque(scene, "تواصل النخبة", [receptionX, 2.4, -0.6], 8);
    box(scene, [5, 0.9, 1.2], [coffeeX, 0.48, 0], "#274966");
    box(scene, [5.2, 0.1, 1.4], [coffeeX, 0.98, 0], "#ccb48c");
    box(scene, [0.7, 0.85, 0.7], [coffeeX - 1, 1.42, 0], "#31485e");
    for (const x of [coffeeX, coffeeX + 0.6, coffeeX + 1.2]) {
      const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.1, 0.23, 12),
        mat("#fffaf0"),
      );
      cup.position.set(x, 1.14, 0.25);
      scene.add(cup);
    }
    plaque(scene, "ركن القهوة", [coffeeX, 2.4, -0.6], 5);
    plant(scene, -floorWidth / 2 + 3, 0);
    plant(scene, floorWidth / 2 - 3, 0);
    const characters: {
      key: string;
      group: THREE.Group;
      character: ReturnType<typeof createOfficeCharacter>;
      root: THREE.Group;
      home: THREE.Vector3;
      points: THREE.Vector3[];
      roomIndex: number;
      index: number;
      count: number;
      length: number;
      previous: THREE.Vector3;
    }[] = [];
    layout.forEach((room, roomIndex) => {
      const g = new THREE.Group();
      g.position.set(room.x, 0, room.z);
      g.rotation.y = room.rotation;
      g.userData.department = room.department.id;
      scene.add(g);
      box(
        g,
        [18.3, 0.16, depth],
        [0, 0.08, 0],
        roomIndex % 2 ? "#f5f0e8" : "#f0f3f6",
      );
      box(g, [18.3, 3.3, 0.16], [0, 1.7, -depth / 2], "#dce3e9");
      box(g, [0.15, 1.1, depth], [-9.15, 0.6, 0], "#c6d1db");
      box(g, [0.15, 1.1, depth], [9.15, 0.6, 0], "#c6d1db");
      box(g, [18, 0.08, 0.12], [0, 0.2, depth / 2], "#ac8646");
      plaque(g, room.department.name, [0, 2.7, -depth / 2 + 0.1], 12);
      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(4.3, 1.35),
        new THREE.MeshStandardMaterial({
          color: "#a8c4d3",
          transparent: true,
          opacity: 0.45,
          side: THREE.DoubleSide,
        }),
      );
      glass.position.set(-5, 1.8, -depth / 2 + 0.13);
      g.add(glass);
      plant(g, -8, -depth / 2 + 1);
      plant(g, 8, -depth / 2 + 1);
      room.members.forEach((member, index) => {
        const [x, z] = member.position;
        box(g, [2.8, 0.15, 1.3], [x, 1.14, z - 0.6], "#d5c19e");
        for (const side of [-1, 1])
          box(g, [0.1, 1, 0.8], [x + side * 1.1, 0.6, z - 0.6], "#3d526c");
        box(g, [1.2, 0.72, 0.1], [x, 1.68, z - 0.94], "#223d58");
        box(g, [1.05, 0.57, 0.03], [x, 1.68, z - 0.87], member.color);
        box(g, [0.7, 0.04, 0.25], [x, 1.25, z - 0.1], "#dae3ea");
        box(g, [0.75, 0.14, 0.7], [x, 0.69, z + 0.66], "#365472");
        box(g, [0.75, 0.8, 0.12], [x, 1.04, z + 1.02], "#365472");
        box(g, [0.1, 0.6, 0.1], [x, 0.37, z + 0.66], "#365472");
        const character = createOfficeCharacter(
            member.appearance,
            member.color,
          ),
          root = character.root;
        root.position.set(x, 0.16, z + 0.55);
        root.userData.memberKey = member.key;
        root.userData.department = room.department.id;
        g.add(root);
        character.update({ time: index, dt: 1, walking: false, seated: true });
        const home = root.position.clone(),
          points = [
            home.clone(),
            new THREE.Vector3(x, 0.16, z + 1.7),
            new THREE.Vector3(7.3, 0.16, z + 1.7),
            new THREE.Vector3(7.3, 0.16, depth / 2 - 1.2),
            new THREE.Vector3(3, 0.16, depth / 2 - 1.2),
          ];
        characters.push({
          key: member.key,
          group: g,
          character,
          root,
          home,
          points,
          roomIndex,
          index,
          count: room.members.length,
          length: points
            .slice(1)
            .reduce((n, p, i) => n + p.distanceTo(points[i]), 0),
          previous: home.clone(),
        });
      });
    });
    const ray = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    let downX = 0,
      downY = 0,
      lastHover = 0;
    function hit(e: PointerEvent) {
      const r = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      );
      ray.setFromCamera(pointer, camera);
      const object = ray.intersectObjects(scene.children, true)[0]?.object;
      let at: THREE.Object3D | undefined = object;
      let memberKey: string | null = null,
        id: DepartmentId | undefined;
      while (at) {
        memberKey = memberKey || at.userData.memberKey;
        id = id || at.userData.department;
        at = at.parent || undefined;
      }
      return { memberKey, id };
    }
    const down = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 7) return;
      const { id } = hit(e);
      if (id) live.current.onEnter(id);
    };
    const move = (e: PointerEvent) => {
      if (e.buttons || performance.now() - lastHover < 100) return;
      lastHover = performance.now();
      const h = hit(e);
      setHovered(h.memberKey);
      renderer.domElement.style.cursor = h.id ? "pointer" : "grab";
    };
    const leave = () => setHovered(null);
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointerup", up);
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerleave", leave);
    api.current = {
      zoom(factor) {
        camera.zoom *= factor;
        camera.updateProjectionMatrix();
      },
      reset() {
        camera.zoom = 1;
        camera.position.copy(overview);
        controls.target.set(0, 0, 0);
        camera.updateProjectionMatrix();
      },
      focus(id) {
        const room = layout.find((r) => r.department.id === id)!;
        controls.target.set(room.x, 0, room.z);
        camera.position.set(room.x + 17, 24, room.z + 23);
        camera.zoom = 2.5;
        camera.updateProjectionMatrix();
      },
    };
    const resize = new ResizeObserver(() => {
      const w = container.clientWidth,
        h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      const aspect = w / h,
        half = compact
          ? Math.max(floorLength * 0.55, 27 / aspect)
          : Math.max(depth + 15, 54 / aspect);
      camera.left = -half * aspect;
      camera.right = half * aspect;
      camera.top = half;
      camera.bottom = -half;
      camera.updateProjectionMatrix();
    });
    resize.observe(container);
    let visible = true,
      frame = 0,
      previous = 0,
      start = 0,
      count = 0;
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
    });
    intersection.observe(container);
    const project = new THREE.Vector3(),
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    function draw(now: number) {
      frame = requestAnimationFrame(draw);
      if (!visible || document.hidden) {
        previous = now;
        return;
      }
      if (now - previous < 40) return;
      const dt = Math.min((now - previous) / 1000, 0.08);
      previous = now;
      if (!start) start = now;
      const time = (now - start) / 1000;
      count++;
      for (const p of characters) {
        const phase = (time + p.roomIndex * 3 + p.index * 20) % (p.count * 20),
          away = phase < 20,
          progress = away
            ? phase < 8
              ? phase / 8
              : phase < 12
                ? 1
                : 1 - (phase - 12) / 8
            : 0;
        p.previous.copy(p.root.position);
        let distance = p.length * progress;
        p.root.position.copy(p.home);
        for (let i = 1; i < p.points.length; i++) {
          const length = p.points[i].distanceTo(p.points[i - 1]);
          if (distance <= length || i === p.points.length - 1) {
            p.root.position.lerpVectors(
              p.points[i - 1],
              p.points[i],
              length ? Math.min(1, distance / length) : 0,
            );
            break;
          }
          distance -= length;
        }
        const dx = p.root.position.x - p.previous.x,
          dz = p.root.position.z - p.previous.z,
          walking = Math.hypot(dx, dz) > 0.0001;
        if (walking) p.root.rotation.y = Math.atan2(-dx, -dz);
        else if (!away) p.root.rotation.y = 0;
        // Distant seated poses update at a lower rate; walking always stays articulated.
        if (away || count % 4 === p.index % 4)
          p.character.update({
            time: time + p.index,
            dt: away ? dt : dt * 4,
            walking,
            seated: !away,
            working: !away,
            reducedMotion: reduced.matches,
          });
      }
      controls.update();
      for (const room of layout) {
        const el = doors.current.get(room.department.id);
        if (!el) continue;
        project
          .set(
            room.x,
            compact ? 4.5 : 0.4,
            compact
              ? room.z
              : room.z + (room.rotation === 0 ? 1 : -1) * (depth / 2 - 0.2),
          )
          .project(camera);
        el.style.transform = `translate(-50%,-50%) translate(${(project.x * 0.5 + 0.5) * container.clientWidth}px,${(-project.y * 0.5 + 0.5) * container.clientHeight}px)`;
        el.style.visibility =
          Math.abs(project.x) > 0.95 ||
          Math.abs(project.y) > 0.9 ||
          Math.abs(project.z) > 1
            ? "hidden"
            : "visible";
      }
      renderer.render(scene, camera);
    }
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      controls.dispose();
      api.current = null;
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointerup", up);
      renderer.domElement.removeEventListener("pointermove", move);
      renderer.domElement.removeEventListener("pointerleave", leave);
      const geometries = new Set<THREE.BufferGeometry>(),
        mats = new Set<THREE.Material>(),
        textures = new Set<THREE.Texture>();
      scene.traverse((o) => {
        if (o instanceof THREE.SkinnedMesh) o.skeleton.dispose();
        if (o instanceof THREE.Mesh) {
          geometries.add(o.geometry);
          for (const m of Array.isArray(o.material)
            ? o.material
            : [o.material]) {
            mats.add(m);
            for (const value of Object.values(m))
              if (value instanceof THREE.Texture) textures.add(value);
          }
        }
      });
      geometries.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [signature, compact]);
  async function fullscreen() {
    if (document.fullscreenElement === wrap.current) {
      await document.exitFullscreen();
      return;
    }
    if (expanded) {
      setExpanded(false);
      return;
    }
    try {
      await wrap.current?.requestFullscreen();
    } catch {
      setExpanded(true);
    }
  }
  const hoveredPerson = rooms
      .flatMap((r) => r.members)
      .find((p) => p.key === hovered),
    real = hoveredPerson?.human
      ? staff.find((p) => `staff:${p.id}` === hoveredPerson.id)
      : null;
  return (
    <div
      ref={wrap}
      className={`${s.sceneWrap} ${s.companyScene} ${expanded ? s.sceneExpanded : ""}`}
      role="group"
      aria-label="مخطط الشركة الثلاثي الأبعاد"
    >
      {!failed && (
        <div ref={host} className={s.canvasHost}>
          {rooms.map((room) => (
            <button
              type="button"
              key={room.department.id}
              ref={(el) => {
                if (el) doors.current.set(room.department.id, el);
                else doors.current.delete(room.department.id);
              }}
              className={s.departmentDoor}
              aria-label={`دخول ${room.department.name}، ${room.members.length} موظفين`}
              onClick={() => onEnter(room.department.id)}
            >
              <strong>{room.department.short}</strong>
              <small>{room.members.length} موظفين · دخول ←</small>
            </button>
          ))}
        </div>
      )}
      {failed && (
        <div className={s.sceneFallback}>
          <strong>إدارات الشركة</strong>
          <p>اختر الإدارة من الروابط أعلاه لفتح مكتبها.</p>
        </div>
      )}
      <div className={s.sceneCaption}>
        <strong>الشركة كاملة</strong>
        <small>
          ٨ إدارات · {rooms.reduce((n, r) => n + r.members.length, 0)} موظفًا ·
          اضغط الإدارة للدخول
        </small>
      </div>
      {hoveredPerson && (
        <div className={s.companyPersonHint}>
          <strong>{hoveredPerson.name}</strong>
          <span>{hoveredPerson.role}</span>
          {real ? (
            <PresenceBadge presence={real.presence} />
          ) : (
            <small>موظف افتراضي</small>
          )}
        </div>
      )}
      <div className={s.cameraTools} aria-label="التحكم في الشركة">
        <button type="button" onClick={() => void fullscreen()}>
          {expanded || full ? "تصغير الشركة" : "ملء الشاشة"}
        </button>
        <button
          type="button"
          onClick={() => api.current?.zoom(1.3)}
          aria-label="تقريب الشركة"
        >
          ＋
        </button>
        <button
          type="button"
          onClick={() => api.current?.zoom(1 / 1.3)}
          aria-label="إبعاد الشركة"
        >
          −
        </button>
        <button type="button" onClick={() => api.current?.focus(department)}>
          تقريب إدارتي
        </button>
        <button type="button" onClick={() => api.current?.reset()}>
          الشركة كاملة
        </button>
      </div>
    </div>
  );
}
