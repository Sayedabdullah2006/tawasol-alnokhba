"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  OFFICE_APPEARANCE,
  type OfficePersonId,
  type OfficeStaff,
  type OfficeActivity,
} from "@/lib/virtual-office/domain";
import { createOfficeCharacter } from "./human-character";
import {
  departmentById,
  type DepartmentId,
} from "@/lib/virtual-office/departments";
import { officeExcerpt } from "@/lib/virtual-office/presentation";
import { officeActors as sceneActors } from "@/lib/virtual-office/scene-layout";
import { officeFloor, officePath, type FloorPoint } from "./office-navigation";
import { createOfficePool } from "./office-pool";
import { POOL, lowestPoolBall } from "./pool-physics";
import s from "./office.module.css";
import { presenceView } from "@/lib/virtual-office/presence";
import { usePresenceNow } from "./OfficePresence";

type Props = {
  department: DepartmentId;
  selected: OfficePersonId;
  active: OfficePersonId[];
  staff: OfficeStaff[];
  meeting: boolean;
  meetingAgents: OfficePersonId[];
  onSelect: (id: OfficePersonId) => void;
  onTalk: (id: OfficePersonId) => void;
  activities: OfficeActivity[];
  taskSummaries: Partial<Record<OfficePersonId, string>>;
  onOpenActivity: (activity: OfficeActivity) => void;
  employeeView?: boolean;
};
type SceneApi = {
  focus: (id?: OfficePersonId) => void;
  zoom: (amount: number) => void;
  rotate: () => void;
  walk: (enabled: boolean) => void;
  step: (direction: "forward" | "back" | "left" | "right") => void;
  recreation: (enabled: boolean) => void;
  newPoolRound: () => void;
};

export default function OfficeScene({
  department,
  selected,
  active,
  meeting,
  meetingAgents,
  onSelect,
  onTalk,
  staff,
  activities,
  taskSummaries,
  onOpenActivity,
  employeeView = false,
}: Props) {
  const presenceNow = usePresenceNow();
  const sceneId = useId().replace(/:/g, "");
  const wrap = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef(new Map<OfficePersonId, HTMLButtonElement>());
  const bubbles = useRef(new Map<OfficePersonId, HTMLButtonElement>());
  const hints = useRef(new Map<OfficePersonId, HTMLDivElement>());
  const visitorLabel = useRef<HTMLSpanElement>(null);
  const walkStatus = useRef<HTMLSpanElement>(null);
  const hintPerson = useRef<OfficePersonId | null>(null);
  const dismissedHint = useRef<OfficePersonId | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hovered, setHovered] = useState<OfficePersonId | null>(null);
  const [walking, setWalking] = useState(false);
  const ambient = true;
  const [recreation, setRecreation] = useState(false);
  const poolReadout = useRef<HTMLParagraphElement>(null);
  const lifeStatus = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [nativeFull, setNativeFull] = useState(false);
  useEffect(() => {
    const change = () =>
      setNativeFull(document.fullscreenElement === wrap.current);
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("fullscreenchange", change);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("fullscreenchange", change);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const walkEnabled = useRef(false);
  const [staffTasks, setStaffTasks] = useState<Record<string, string>>({});
  const live = useRef({
    selected,
    active,
    meeting,
    meetingAgents,
    onSelect,
    onTalk,
    staff,
    ambient,
  });
  const staffSignature = staff
    .map((p) => `${p.id}:${p.name}:${p.appearance}`)
    .join("|");
  const api = useRef<SceneApi | null>(null);
  const [failed, setFailed] = useState(false);
  const hideHints = useCallback(() => {
    hints.current.forEach((el) => el.hidePopover?.());
    hintPerson.current = null;
    setHovered(null);
  }, []);
  const showHint = useCallback((id: OfficePersonId) => {
    if (dismissedHint.current === id) return;
    dismissedHint.current = null;
    if (hintTimer.current) clearTimeout(hintTimer.current);
    if (hintPerson.current === id) return;
    hints.current.forEach((el, key) => {
      if (key !== id) el.hidePopover?.();
    });
    hintPerson.current = id;
    setHovered(id);
    hints.current.get(id)?.showPopover?.();
  }, []);
  const leaveHint = useCallback(() => {
    dismissedHint.current = null;
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(hideHints, 250);
  }, [hideHints]);
  useEffect(() => {
    let disposed = false;
    async function enhanceHints() {
      if (!("popover" in HTMLElement.prototype))
        await import("@oddbird/popover-polyfill");
      if (disposed) return;
      // Unsupported hint values become manual; our explicit dismissal also covers model hover.
      if (!("interestForElement" in HTMLButtonElement.prototype))
        await import("interestfor");
    }
    void enhanceHints();
    return () => {
      disposed = true;
      if (hintTimer.current) clearTimeout(hintTimer.current);
    };
  }, []);
  useEffect(() => {
    if (!hovered?.startsWith("staff:") || employeeView) return;
    const controller = new AbortController();
    async function loadTask() {
      try {
        const r = await fetch(
          `/api/admin/virtual-office?employee=${encodeURIComponent(hovered!.slice(6))}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!r.ok) return;
        const data = await r.json();
        const task = data.tasks?.find(
          (t: { stage: string }) => t.stage === "in_progress",
        );
        if (!controller.signal.aborted)
          setStaffTasks((old) => ({
            ...old,
            [hovered!]: task
              ? officeExcerpt(task.title)
              : "لا توجد مهمة قيد التنفيذ مسجلة",
          }));
      } catch {
        /* The staff panel exposes any directory error in full. */
      }
    }
    void loadTask();
    const timer = setInterval(() => {
      if (!document.hidden) void loadTask();
    }, 15000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [hovered, employeeView]);
  const visit = (id: OfficePersonId) => {
    onSelect(id);
    api.current?.focus(id);
  };
  const neighbour = (direction: number) => {
    const actors = sceneActors(staff, department),
      index = actors.findIndex((a) => a.id === selected);
    visit(actors[(index + direction + actors.length) % actors.length].id);
  };
  const previousSelection = useRef(selected);
  useEffect(() => {
    if (previousSelection.current !== selected) api.current?.focus(selected);
    previousSelection.current = selected;
  }, [selected]);
  useEffect(() => {
    live.current = {
      selected,
      active,
      meeting,
      meetingAgents,
      onSelect,
      onTalk,
      staff,
      ambient,
    };
  }, [
    selected,
    active,
    meeting,
    meetingAgents,
    onSelect,
    onTalk,
    staff,
    ambient,
  ]);
  useEffect(() => {
    if (!host.current) return;
    const container: HTMLDivElement = host.current;
    const actors = sceneActors(live.current.staff, department);
    const staffDepth = Math.ceil(live.current.staff.length / 4) * 4;
    const extraDepth = staffDepth + 7;
    const poolZ = 10 + staffDepth;
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
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.domElement.setAttribute("aria-hidden", "true");
    container.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-14, 14, 11, -11, 0.1, 100);
    const overviewZoom = () =>
      container.clientWidth / container.clientHeight > 1.4 ? 1.4 : 1.05;
    let framing: "overview" | "person" | "walk" = "overview";
    camera.zoom = overviewZoom();
    camera.position.set(19, 23, 26 + extraDepth / 2);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.3, extraDepth / 2);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.enablePan = false;
    controls.minZoom = 0.01;
    controls.maxZoom = Infinity;
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
    box(
      scene,
      [20.5, 0.5, 15.5 + extraDepth],
      [0, -0.4, extraDepth / 2],
      "#263d61",
    );
    box(
      scene,
      [20, 0.15, 15 + extraDepth],
      [0, -0.08, extraDepth / 2],
      "#e2e8ee",
    );
    for (let x = -9; x < 10; x += 2)
      for (let z = -6.5; z < 7 + extraDepth; z += 2)
        box(
          scene,
          [1.97, 0.015, 1.97],
          [x, 0.008, z],
          (x + z) % 4 ? "#e4e9ee" : "#dbe3eb",
        );
    box(scene, [20, 3.8, 0.2], [0, 1.9, -7.5], "#e9edf3");
    box(
      scene,
      [0.2, 3.8, 15 + extraDepth],
      [-10, 1.9, extraDepth / 2],
      "#d9e1ed",
    );
    box(scene, [20, 0.12, 0.23], [0, 3.85, -7.5], "#bda26d");
    for (const x of [-6, 6]) {
      box(scene, [4.8, 2.2, 0.12], [x, 2.25, -7.34], "#2f4b70");
      box(scene, [4.5, 1.9, 0.13], [x, 2.25, -7.25], "#b6d3e8");
      box(scene, [0.08, 2, 0.15], [x, 2.25, -7.15], "#f0f5f9");
      box(scene, [4.5, 0.08, 0.15], [x, 2.25, -7.15], "#f0f5f9");
    }
    const sign = textPlane(
      departmentById(department).name,
      4.7,
      1.2,
      "#203f68",
      "#ead8ae",
    );
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
    // A small coffee counter gives idle teammates an actual destination.
    box(scene, [1.8, 0.9, 0.65], [0, 0.45, -6.6], "#294366");
    box(scene, [1.9, 0.08, 0.75], [0, 0.94, -6.6], "#cbb18b");
    box(scene, [0.45, 0.45, 0.4], [-0.45, 1.2, -6.6], "#354b69");
    box(scene, [0.35, 0.16, 0.03], [-0.45, 1.28, -6.37], "#203f68");
    for (const x of [-0.57, -0.34])
      sphere(scene, 0.035, [x, 1.29, -6.34], "#cbb18b");
    box(scene, [0.3, 0.035, 0.24], [-0.45, 1.02, -6.3], "#b6c4ce");
    cylinder(scene, 0.12, 0.24, [0.77, 1.1, -6.57], "#644b3c");
    cylinder(scene, 0.13, 0.04, [0.77, 1.24, -6.57], "#cbb18b");
    const coffeeSign = textPlane("ركن القهوة", 1.9, 0.5, "#203f68", "#ead8ae");
    coffeeSign.position.set(0, 2.03, -6.62);
    scene.add(coffeeSign);
    for (const x of [0.2, 0.55])
      cylinder(scene, 0.09, 0.16, [x, 1.06, -6.5], "#f7f8fa");
    const clickable: THREE.Object3D[] = [];
    const people = actors.map((agent, index) => {
      const appearance = agent.appearance;
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
      const character = createOfficeCharacter(appearance, agent.color);
      const person = character.root;
      person.position.set(x, 0, z + 0.55);
      scene.add(person);
      const chair = new THREE.Group();
      chair.position.copy(person.position);
      scene.add(chair);
      box(chair, [0.8, 0.15, 0.72], [0, 0.63, 0.12], "#354b69");
      box(chair, [0.8, 0.85, 0.15], [0, 1.05, 0.45], "#354b69");
      cylinder(chair, 0.07, 0.55, [0, 0.3, 0.1], "#263b54");
      for (let i = 0; i < 5; i++) {
        const leg = box(chair, [0.08, 0.06, 0.65], [0, 0.1, 0.1], "#263b54");
        leg.rotation.y = (i * Math.PI) / 2.5;
      }
      character.update({ time: index, dt: 1, walking: false, seated: true });
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
        character,
        screen,
        marker,
        human: agent.human,
        home: new THREE.Vector3(x, 0, z + 0.55),
        seat: agent.human
          ? new THREE.Vector3(x, 0, z + 0.55)
          : new THREE.Vector3(seats[index][0], 0, seats[index][1]),
        index,
      };
    });
    const floor = officeFloor(
      actors.map((a) => a.position),
      extraDepth,
      poolZ,
    );
    const pool = createOfficePool(scene, poolZ, actors.length);
    const poolSign = textPlane(
      "ركن البلياردو · ٩ كرات",
      3.3,
      0.75,
      "#203f68",
      "#ead8ae",
    );
    poolSign.position.set(6, 1.5, poolZ + 2.9);
    scene.add(poolSign);
    let poolMode = false,
      nextShot = 0;
    const playPaths = new Map<OfficePersonId, FloorPoint[]>();
    const playSpots = [
      [-3.8, -1.3],
      [3.8, -1.3],
      [-3.8, 1.3],
      [3.8, 1.3],
      [-1.4, 2.7],
      [1.4, 2.7],
    ];
    const visitorCharacter = createOfficeCharacter(
      OFFICE_APPEARANCE.editor,
      "#ac8646",
    );
    const visitor = visitorCharacter.root;
    visitor.position.set(0, 0, 6.5);
    visitor.visible = walkEnabled.current;
    scene.add(visitor);
    const destination = new THREE.Mesh(
      new THREE.TorusGeometry(0.25, 0.025, 8, 32),
      mat("#ac8646"),
    );
    destination.rotation.x = Math.PI / 2;
    destination.visible = false;
    scene.add(destination);
    let walkPath: FloorPoint[] = [];
    type IdleTour = {
      id: OfficePersonId;
      path: FloorPoint[];
      phase: "away" | "pause" | "home";
      until: number;
      stride: number;
      destination: "coffee" | "library";
    };
    const idleTours = new Map<OfficePersonId, IdleTour>();
    let nextTour = 0,
      tourIndex = 0;
    const keys = new Set<string>();
    function goTo(at: FloorPoint) {
      walkPath = officePath(floor, visitor.position, at);
      const end = walkPath.at(-1);
      destination.visible = !!end;
      if (end) destination.position.set(end.x, 0.04, end.z);
    }
    let targetCamera: THREE.Vector3 | null = null,
      targetLook: THREE.Vector3 | null = null;
    api.current = {
      recreation(enabled) {
        poolMode = enabled;
        setRecreation(enabled);
        idleTours.clear();
        nextShot = performance.now() + 1200;
        people.forEach((p, i) => {
          const spot = playSpots[i] || [
            i % 2 ? -3.9 : 3.9,
            -2.3 + (Math.floor((i - 6) / 2) % 7) * 0.75,
          ];
          playPaths.set(
            p.id,
            officePath(
              floor,
              p.person.position,
              enabled ? { x: spot[0], z: poolZ + spot[1] } : p.home,
            ),
          );
        });
        walkEnabled.current = false;
        setWalking(false);
        visitor.visible = false;
        walkPath = [];
        keys.clear();
        destination.visible = false;
        const at = enabled
          ? new THREE.Vector3(0, 0.5, poolZ)
          : new THREE.Vector3(0, 0.5, staffDepth / 2);
        targetLook = at;
        targetCamera = at.clone().add(new THREE.Vector3(19, 23, 26));
        framing = "person";
        camera.zoom = enabled
          ? container.clientWidth / container.clientHeight > 1.4
            ? 3.2
            : 2.8
          : 1.6;
        camera.updateProjectionMatrix();
      },
      newPoolRound() {
        pool.reset();
        nextShot = performance.now() + 1200;
      },
      focus(id) {
        framing = id ? "person" : "overview";
        const person = people.find((p) => p.id === id);
        const at = person
          ? person.person.position.clone()
          : new THREE.Vector3(0, 0, extraDepth / 2);
        if (walkEnabled.current && person) {
          goTo({ x: at.x + (at.x > 0 ? -2 : 2), z: at.z + 0.2 });
          return;
        }
        if (!id) {
          walkEnabled.current = false;
          setWalking(false);
          visitor.visible = false;
          walkPath = [];
          keys.clear();
          destination.visible = false;
        }
        targetLook = at.clone().add(new THREE.Vector3(0, 0.5, 0));
        targetCamera = at.clone().add(new THREE.Vector3(19, 23, 26));
        camera.zoom = person ? 1.9 : overviewZoom();
        camera.updateProjectionMatrix();
      },
      zoom(amount) {
        framing = "person";
        const zoom = camera.zoom * amount;
        if (Number.isFinite(zoom)) camera.zoom = Math.max(0.01, zoom);
        camera.updateProjectionMatrix();
      },
      rotate() {
        targetCamera = targetLook = null;
        const offset = camera.position
          .clone()
          .sub(controls.target)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
        camera.position.copy(controls.target.clone().add(offset));
      },
      walk(enabled) {
        framing = enabled ? "walk" : "overview";
        walkEnabled.current = enabled;
        visitor.visible = enabled;
        setWalking(enabled);
        keys.clear();
        walkPath = [];
        destination.visible = false;
        hideHints();
        if (enabled) {
          targetCamera = targetLook = null;
          camera.zoom = 2.2;
          camera.updateProjectionMatrix();
          wrap.current?.focus({ preventScroll: true });
        } else api.current?.focus();
      },
      step(direction) {
        const forward = new THREE.Vector3()
          .subVectors(controls.target, camera.position)
          .setY(0)
          .normalize();
        const right = new THREE.Vector3(-forward.z, 0, forward.x);
        const offset =
          direction === "forward"
            ? forward
            : direction === "back"
              ? forward.negate()
              : direction === "right"
                ? right
                : right.negate();
        goTo({
          x: visitor.position.x + offset.x * 1.6,
          z: visitor.position.z + offset.z * 1.6,
        });
      },
    };
    let down = { x: 0, y: 0 };
    const ray = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    const pointerDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
      targetCamera = targetLook = null;
      if (walkEnabled.current) wrap.current?.focus({ preventScroll: true });
    };
    function castPointer(e: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      ray.setFromCamera(pointer, camera);
      return ray.intersectObjects(clickable)[0]?.object.userData.agent as
        OfficePersonId | undefined;
    }
    const pointerUp = (e: PointerEvent) => {
      if (Math.hypot(down.x - e.clientX, down.y - e.clientY) > 7) return;
      const id = castPointer(e);
      if (id) {
        live.current.onSelect(id);
        api.current?.focus(id);
        hideHints();
        live.current.onTalk(id);
      } else if (poolMode) {
        const at = ray.ray.intersectPlane(
          new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.25),
          new THREE.Vector3(),
        );
        if (
          at &&
          Math.abs(at.x) < POOL.halfX &&
          Math.abs(at.z - poolZ) < POOL.halfZ &&
          [...playPaths.values()].every((p) => !p.length)
        ) {
          const white = pool.game.balls[0];
          pool.shoot(Math.atan2(at.z - poolZ - white.z, at.x - white.x));
          nextShot = performance.now() + 1800;
        }
      } else if (walkEnabled.current) {
        const at = ray.ray.intersectPlane(
          new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
          new THREE.Vector3(),
        );
        if (
          at &&
          at.x >= floor.minX &&
          at.x <= floor.maxX &&
          at.z >= floor.minZ &&
          at.z <= floor.maxZ
        )
          goTo(at);
      }
    };
    const pointerMove = (e: PointerEvent) => {
      if (e.buttons || e.pointerType === "touch") return;
      const id = castPointer(e);
      renderer.domElement.style.cursor = id
        ? "pointer"
        : walkEnabled.current
          ? "crosshair"
          : "grab";
      if (id) showHint(id);
      else leaveHint();
    };
    const keyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dismissedHint.current = hintPerson.current;
        hideHints();
        keys.clear();
        walkPath = [];
        destination.visible = false;
        return;
      }
      if (!walkEnabled.current || e.target !== wrap.current) return;
      if (
        [
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
        ].includes(e.code)
      ) {
        e.preventDefault();
        keys.add(e.code);
        walkPath = [];
        destination.visible = false;
      }
    };
    const keyUp = (e: KeyboardEvent) => {
      keys.delete(e.code);
    };
    const clearKeys = () => {
      keys.clear();
    };
    const dismissHint = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (hintPerson.current) dismissedHint.current = hintPerson.current;
        hideHints();
      }
    };
    const contextLost = (e: Event) => {
      e.preventDefault();
      setFailed(true);
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("pointermove", pointerMove);
    renderer.domElement.addEventListener("pointerleave", leaveHint);
    const sceneWrap = wrap.current;
    sceneWrap?.addEventListener("keydown", keyDown);
    sceneWrap?.addEventListener("keyup", keyUp);
    sceneWrap?.addEventListener("focusout", clearKeys);
    window.addEventListener("blur", clearKeys);
    document.addEventListener("keydown", dismissHint);
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    const resize = new ResizeObserver(() => {
      const w = container.clientWidth,
        h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      const aspect = w / h;
      const halfHeight = Math.max(
        12.5 + extraDepth * 0.4,
        (13.5 + extraDepth * 0.5) / aspect,
      );
      camera.left = -halfHeight * aspect;
      camera.right = halfHeight * aspect;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      if (framing === "overview") camera.zoom = overviewZoom();
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
      if (!visible || document.hidden) {
        keys.clear();
        previous = now;
        return;
      }
      if (now - previous < 32) return;
      const dt = Math.min((now - previous) / 1000, 0.06);
      previous = now;
      let moved = false;
      if (walkEnabled.current) {
        const start = visitor.position.clone();
        if (keys.size) {
          const forward = new THREE.Vector3()
            .subVectors(controls.target, camera.position)
            .setY(0)
            .normalize();
          const right = new THREE.Vector3(-forward.z, 0, forward.x),
            move = new THREE.Vector3();
          if (keys.has("KeyW") || keys.has("ArrowUp")) move.add(forward);
          if (keys.has("KeyS") || keys.has("ArrowDown")) move.sub(forward);
          if (keys.has("KeyD") || keys.has("ArrowRight")) move.add(right);
          if (keys.has("KeyA") || keys.has("ArrowLeft")) move.sub(right);
          move.normalize().multiplyScalar(dt * 3.2);
          if (
            floor.canStand({
              x: visitor.position.x + move.x,
              z: visitor.position.z,
            })
          )
            visitor.position.x += move.x;
          if (
            floor.canStand({
              x: visitor.position.x,
              z: visitor.position.z + move.z,
            })
          )
            visitor.position.z += move.z;
        } else if (walkPath.length) {
          const next = walkPath[0],
            delta = new THREE.Vector3(next.x, 0, next.z).sub(visitor.position);
          if (delta.length() <= dt * 3.2) {
            visitor.position.set(next.x, 0, next.z);
            walkPath.shift();
          } else
            visitor.position.add(delta.normalize().multiplyScalar(dt * 3.2));
        }
        const distance = visitor.position.distanceTo(start);
        moved = distance > 0.001;
        if (moved) {
          const delta = visitor.position.clone().sub(start);
          visitor.rotation.y = Math.atan2(-delta.x, -delta.z);
        }
        visitorCharacter.update({
          time: now / 1000,
          dt,
          walking: moved,
          seated: false,
          reducedMotion: reduced.matches,
        });
        destination.visible = walkPath.length > 0;
        const lookAt = visitor.position
          .clone()
          .add(new THREE.Vector3(0, 0.6, 0));
        const cameraOffset = camera.position.clone().sub(controls.target);
        controls.target.lerp(lookAt, reduced.matches ? 1 : 0.12);
        camera.position.copy(controls.target).add(cameraOffset);
        if (walkStatus.current) {
          const text = moved ? "تتجول في المكتب" : "اختر وجهتك أو تحرك بالأسهم";
          if (walkStatus.current.textContent !== text)
            walkStatus.current.textContent = text;
        }
      }
      if (targetCamera && targetLook) {
        camera.position.lerp(targetCamera, reduced.matches ? 1 : 0.1);
        controls.target.lerp(targetLook, reduced.matches ? 1 : 0.1);
        if (camera.position.distanceTo(targetCamera) < 0.02)
          targetCamera = targetLook = null;
      }
      const t = now * 0.001;
      if (!nextTour) nextTour = now;
      if (!poolMode && idleTours.size < 2 && now >= nextTour) {
        const available = people.filter(
          (p) =>
            !idleTours.has(p.id) &&
            !playPaths.has(p.id) &&
            !live.current.active.includes(p.id) &&
            (p.id !== live.current.selected || people.length === 1),
        );
        const colleague = available[tourIndex % available.length];
        if (colleague) {
          const end =
            tourIndex % 2 ? { x: -7.9, z: -5.8 } : { x: 0.65, z: -5.1 };
          idleTours.set(colleague.id, {
            id: colleague.id,
            path: officePath(floor, colleague.person.position, end),
            phase: "away",
            until: 0,
            stride: 0,
            destination: tourIndex % 2 ? "library" : "coffee",
          });
          tourIndex++;
        }
        nextTour = now + 350;
      }
      pool.update(dt, poolMode);
      if (poolMode) {
        const ready = [...playPaths.values()].every(
            (path) => path.length === 0,
          ),
          game = pool.game;
        if (!ready || game.moving) nextShot = now + 1500;
        if (ready && !game.moving && now > nextShot) {
          if (game.winner !== null) {
            pool.reset();
            nextShot = now + 1500;
          } else {
            pool.shoot();
            nextShot = now + 4500;
          }
        }
        if (poolReadout.current) {
          const text = !ready
            ? "يتجه الفريق إلى طاولة البلياردو…"
            : game.winner !== null
              ? `${actors[game.winner].name} فاز بالكرة ٩!`
              : `دور ${actors[game.turn].name} · الهدف الكرة ${lowestPoolBall(game)} · ${game.balls.filter((b) => b.id > 0 && b.alive).length} كرات على الطاولة. ${game.message}`;
          if (poolReadout.current.textContent !== text)
            poolReadout.current.textContent = text;
        }
      }
      controls.update();
      const rect = container.getBoundingClientRect();
      for (const p of people) {
        const running = live.current.active.includes(p.id),
          gathering =
            live.current.meeting &&
            !p.human &&
            live.current.meetingAgents.includes(p.id);
        let strolling = false;
        const idleTour = idleTours.get(p.id),
          playPath = playPaths.get(p.id);
        function advance(path: FloorPoint[], speed: number) {
          const next = path[0];
          if (!next) return false;
          const delta = new THREE.Vector3(next.x, 0, next.z).sub(
              p.person.position,
            ),
            distance = delta.length();
          p.person.rotation.y = Math.atan2(-delta.x, -delta.z);
          if (distance < dt * speed) {
            p.person.position.set(next.x, 0, next.z);
            path.shift();
          } else
            p.person.position.add(delta.normalize().multiplyScalar(dt * speed));
          return distance > 0.001;
        }
        if (poolMode || playPath) {
          strolling = advance(playPath || [], 2.8);
          if (!strolling) {
            if (poolMode)
              p.person.rotation.y = Math.atan2(
                p.person.position.x,
                p.person.position.z - poolZ,
              );
            else {
              p.person.position.lerp(p.home, 0.15);
              if (p.person.position.distanceTo(p.home) < 0.04) {
                p.person.position.copy(p.home);
                playPaths.delete(p.id);
              }
            }
          }
        } else if (idleTour) {
          if (running && idleTour.phase !== "home") {
            idleTour.phase = "home";
            idleTour.path = officePath(floor, p.person.position, p.home);
          }
          if (idleTour.path.length) {
            strolling = advance(idleTour.path, 2.4);
            idleTour.stride += dt * 8;
          } else if (idleTour.phase === "away") {
            idleTour.phase = "pause";
            idleTour.until =
              now + (idleTour.destination === "coffee" ? 6500 : 1400);
          } else if (idleTour.phase === "pause" && now > idleTour.until) {
            idleTour.phase = "home";
            idleTour.path = officePath(floor, p.person.position, p.home);
          } else if (idleTour.phase === "home") {
            p.person.position.lerp(p.home, 0.15);
            if (p.person.position.distanceTo(p.home) < 0.04) {
              p.person.position.copy(p.home);
              idleTours.delete(p.id);
              nextTour = now;
            }
          }
          if (idleTour.phase === "pause" && idleTour.destination === "coffee")
            p.person.rotation.y = Math.atan2(
              p.person.position.x,
              p.person.position.z + 6.6,
            );
        } else
          p.person.position.lerp(
            gathering ? p.seat : p.home,
            reduced.matches ? 1 : 0.07,
          );
        if (!idleTour && !playPath && !poolMode)
          p.person.rotation.y = gathering
            ? p.index < 3
              ? -Math.PI / 2
              : Math.PI / 2
            : 0;
        p.marker.visible = live.current.selected === p.id;
        p.marker.position.x = p.person.position.x;
        p.marker.position.z = p.person.position.z;
        p.character.update({
          time: t + p.index * 0.37,
          dt,
          walking: strolling,
          seated:
            !strolling &&
            !poolMode &&
            !idleTour &&
            !playPath &&
            p.person.position.distanceTo(gathering ? p.seat : p.home) < 0.18,
          working: running,
          coffee:
            idleTour?.destination === "coffee" && idleTour.phase === "pause",
          playing: poolMode,
          shooter: poolMode && !strolling && pool.game.turn === p.index,
          reducedMotion: reduced.matches,
        });
        p.screen.material = mat(running ? "#4d9d9e" : agentColor(p.id));
        const label = labels.current.get(p.id);
        if (label) {
          project
            .copy(p.person.position)
            .add(new THREE.Vector3(0, 0.1, 0))
            .project(camera);
          label.style.transform = `translate(-50%,-50%) translate(${(project.x * 0.5 + 0.5) * container.clientWidth}px,${(-project.y * 0.5 + 0.5) * container.clientHeight + 14}px)`;
          label.style.visibility =
            Math.abs(project.z) > 1 ||
            Math.abs(project.x) > 0.98 ||
            Math.abs(project.y) > 0.92
              ? "hidden"
              : "visible";
        }
        project
          .copy(p.person.position)
          .add(new THREE.Vector3(0, 2.25, 0))
          .project(camera);
        const px = (project.x * 0.5 + 0.5) * container.clientWidth,
          py = (-project.y * 0.5 + 0.5) * container.clientHeight;
        const bubble = bubbles.current.get(p.id);
        if (bubble) {
          const x = THREE.MathUtils.clamp(
            px + (p.index < 3 ? -72 : 72),
            72,
            container.clientWidth - 72,
          );
          bubble.style.transform = `translate(-50%,-50%) translate(${x}px,${py - 6}px)`;
          bubble.style.visibility =
            Math.abs(project.z) > 1 ||
            px < 0 ||
            px > container.clientWidth ||
            py < 65 ||
            py > container.clientHeight - 80
              ? "hidden"
              : "visible";
        }
        const hint = hints.current.get(p.id);
        if (hint) {
          hint.style.left = `${THREE.MathUtils.clamp(rect.left + px + 24, 8, window.innerWidth - 248)}px`;
          hint.style.top = `${THREE.MathUtils.clamp(rect.top + py - 90, 8, window.innerHeight - 160)}px`;
        }
      }
      if (visitorLabel.current) {
        project
          .copy(visitor.position)
          .add(new THREE.Vector3(0, 0.1, 0))
          .project(camera);
        visitorLabel.current.style.transform = `translate(-50%,-50%) translate(${(project.x * 0.5 + 0.5) * container.clientWidth}px,${(-project.y * 0.5 + 0.5) * container.clientHeight + 14}px)`;
        visitorLabel.current.style.visibility = walkEnabled.current
          ? "visible"
          : "hidden";
      }
      if (lifeStatus.current) {
        const coffee = [...idleTours.values()].find(
          (tour) => tour.destination === "coffee" && tour.phase === "pause",
        );
        const name = coffee
          ? actors.find((a) => a.id === coffee.id)?.name
          : null;
        const text = poolMode
          ? "استراحة بلياردو تمثيلية للفريق"
          : name
            ? `${name} في ركن القهوة ☕`
            : "زيارات قهوة تلقائية بالتناوب";
        if (lifeStatus.current.textContent !== text)
          lifeStatus.current.textContent = text;
      }
      renderer.render(scene, camera);
    }
    function agentColor(id: OfficePersonId) {
      return actors.find((a) => a.id === id)!.color;
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
      renderer.domElement.removeEventListener("pointermove", pointerMove);
      renderer.domElement.removeEventListener("pointerleave", leaveHint);
      sceneWrap?.removeEventListener("keydown", keyDown);
      sceneWrap?.removeEventListener("keyup", keyUp);
      sceneWrap?.removeEventListener("focusout", clearKeys);
      window.removeEventListener("blur", clearKeys);
      document.removeEventListener("keydown", dismissHint);
      hideHints();
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      const textures = new Set<THREE.Texture>();
      const mats = new Set<THREE.Material>();
      scene.traverse((o) => {
        if (o instanceof THREE.SkinnedMesh) o.skeleton.dispose();
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
  }, [staffSignature, department, showHint, leaveHint, hideHints]);
  async function toggleFullscreen() {
    hideHints();
    if (document.fullscreenElement === wrap.current) {
      await document.exitFullscreen();
      return;
    }
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (document.fullscreenEnabled && wrap.current?.requestFullscreen) {
      try {
        await wrap.current.requestFullscreen();
        return;
      } catch {
        /* Embedded browsers can deny native fullscreen. */
      }
    }
    setExpanded(true);
  }
  return (
    <div
      ref={wrap}
      className={`${s.sceneWrap} ${expanded ? s.sceneExpanded : ""}`}
      tabIndex={0}
      role="group"
      aria-label="المكتب التفاعلي"
      aria-describedby={`${sceneId}-help`}
    >
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
            {sceneActors(staff, department).map((agent) => {
              const activity = activities.find((a) => a.agentId === agent.id);
              const task = taskSummaries[agent.id] || staffTasks[agent.id];
              const hintId = `${sceneId}-${agent.id.replace(":", "-")}`;
              const presence = agent.human
                ? presenceView(
                    staff.find((p) => `staff:${p.id}` === agent.id)?.presence,
                    presenceNow,
                  )
                : null;
              const caption =
                activity?.kind === "plan"
                  ? "الخطة جاهزة"
                  : activity?.kind === "handoff"
                    ? "جاهز للإسناد"
                    : activity?.kind === "question"
                      ? "سؤال"
                      : activity?.kind === "result"
                        ? "النتيجة"
                        : "رد جديد";
              return (
                <Fragment key={agent.id}>
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) labels.current.set(agent.id, el);
                      else labels.current.delete(agent.id);
                    }}
                    className={`${s.sceneLabel} ${selected === agent.id ? s.labelSelected : ""}`}
                    onClick={() => {
                      visit(agent.id);
                      hideHints();
                      onTalk(agent.id);
                    }}
                    onPointerEnter={() => showHint(agent.id)}
                    onPointerLeave={leaveHint}
                    onFocus={() => showHint(agent.id)}
                    onBlur={leaveHint}
                    {...{ interestfor: hintId }}
                    aria-label={`${agent.name}، ${agent.role}${presence ? `، ${presence.label}` : "، مساعد افتراضي"}`}
                    aria-describedby={hintId}
                    aria-pressed={selected === agent.id}
                  >
                    <span
                      className={
                        presence
                          ? s.presenceDot
                          : active.includes(agent.id)
                            ? s.workingDot
                            : ""
                      }
                      data-state={presence?.state}
                      style={presence ? undefined : { background: agent.color }}
                    />
                    {agent.name}
                  </button>
                  <div
                    id={hintId}
                    ref={(el) => {
                      if (el) hints.current.set(agent.id, el);
                      else hints.current.delete(agent.id);
                    }}
                    className={s.personHint}
                    popover="hint"
                    role="tooltip"
                    onPointerEnter={() => {
                      if (hintTimer.current) clearTimeout(hintTimer.current);
                    }}
                    onPointerLeave={leaveHint}
                  >
                    <strong>{agent.fullName}</strong>
                    <span>{agent.role}</span>
                    <small>
                      {agent.human ? presence?.label : "عضو الفريق الافتراضي"}
                    </small>
                    {task ? (
                      <p>
                        {active.includes(agent.id) ? "يعمل على: " : "المهمة: "}
                        {officeExcerpt(task)}
                      </p>
                    ) : (
                      <p>
                        {agent.human
                          ? "مهامه من نظام الفريق"
                          : "متاح لتكليف جديد"}
                      </p>
                    )}
                  </div>
                  {activity && (
                    <button
                      type="button"
                      ref={(el) => {
                        if (el) bubbles.current.set(agent.id, el);
                        else bubbles.current.delete(agent.id);
                      }}
                      className={`${s.speechBubble} ${["handoff", "plan"].includes(activity.kind) ? s.handoffBubble : ""}`}
                      onClick={() => {
                        hideHints();
                        onOpenActivity(activity);
                      }}
                      aria-label={`قراءة ${caption} من ${agent.name}: ${activity.preview}`}
                    >
                      <small>{caption}</small>
                      <span>{activity.preview}</span>
                      <b aria-hidden="true">↗</b>
                    </button>
                  )}
                </Fragment>
              );
            })}
            <span ref={visitorLabel} className={s.visitorLabel}>
              أنت
            </span>
          </div>
          <div className={s.sceneCaption}>
            <span>{departmentById(department).name}</span>
            <span ref={lifeStatus} className={s.officeLife}>
              زيارات قهوة تلقائية بالتناوب
            </span>
            <small id={`${sceneId}-help`}>
              {walking
                ? "انقر الأرض للمشي · الأسهم أو WASD للتحرك · Escape للتوقف"
                : staff.length
                  ? "حركة تمثيلية · اضغط الموظف لعرض أعماله الفعلية"
                  : "مرّر على الموظف للتعريف · اضغط الفقاعة لقراءة المحادثة"}
            </small>
          </div>
          <div className={s.staffNavigation} aria-label="التنقل بين الموظفين">
            <button
              type="button"
              onClick={() => neighbour(-1)}
              aria-label="الموظف السابق"
            >
              →
            </button>
            <span>
              {
                sceneActors(staff, department).find((a) => a.id === selected)
                  ?.name
              }
            </span>
            <button
              type="button"
              onClick={() => neighbour(1)}
              aria-label="الموظف التالي"
            >
              ←
            </button>
          </div>
          {recreation && (
            <div className={s.poolPanel}>
              <strong>بلياردو ٩ كرات</strong>
              <p ref={poolReadout}>يتجه الفريق إلى الطاولة…</p>
              <small>
                يلعبون تلقائيًا. انقر على الطاولة لتوجيه تسديدة الدور الحالي. أقل
                رقم أولًا، ودخول البيضاء خطأ.
              </small>
              <button type="button" onClick={() => api.current?.newPoolRound()}>
                جولة جديدة
              </button>
            </div>
          )}
          {walking && (
            <div className={s.walkControls}>
              <span ref={walkStatus}>اختر وجهتك أو تحرك بالأسهم</span>
              <div dir="ltr">
                <button
                  type="button"
                  onClick={() => api.current?.step("forward")}
                  aria-label="المشي للأمام"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => api.current?.step("left")}
                  aria-label="المشي لليسار"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => api.current?.step("back")}
                  aria-label="المشي للخلف"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => api.current?.step("right")}
                  aria-label="المشي لليمين"
                >
                  →
                </button>
              </div>
            </div>
          )}
          <div className={s.cameraTools} aria-label="التحكم في عرض المكتب">
            <button
              type="button"
              aria-pressed={expanded || nativeFull}
              onClick={() => void toggleFullscreen()}
            >
              {expanded || nativeFull ? "تصغير المكتب" : "ملء الشاشة"}
            </button>
            <button
              type="button"
              aria-pressed={recreation}
              onClick={() => api.current?.recreation(!recreation)}
            >
              {recreation ? "العودة للمكاتب" : "ترفيه الموظفين"}
            </button>
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
            <button
              aria-pressed={walking}
              onClick={() => api.current?.walk(!walking)}
            >
              {walking ? "إنهاء المشي" : "تجوّل في المكتب"}
            </button>
            <button onClick={() => api.current?.focus()}>المكتب كاملًا</button>
          </div>
        </>
      )}
    </div>
  );
}
