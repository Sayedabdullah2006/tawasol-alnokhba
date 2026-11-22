import {
  officePath,
  type FloorPoint,
  type OfficeFloor,
} from "./office-navigation";
import type { companyRooms } from "@/lib/virtual-office/scene-layout";
export function createInteractionWalk(
  floor: OfficeFloor,
  from: FloorPoint,
  to: FloorPoint,
  home: FloorPoint,
) {
  let path = officePath(floor, from, to),
    phase: "away" | "pause" | "home" | "done" = "away",
    until = 0;
  return {
    tick(now: number, dt: number, position: FloorPoint) {
      let next = { ...position },
        walking = false;
      if (path.length) {
        const point = path[0],
          dx = point.x - position.x,
          dz = point.z - position.z,
          distance = Math.hypot(dx, dz),
          step = Math.min(dt, 0.1) * 3.2;
        walking = distance > 0.001;
        if (distance <= step) {
          next = { ...point };
          path.shift();
        } else {
          next = {
            x: position.x + (dx / distance) * step,
            z: position.z + (dz / distance) * step,
          };
        }
      } else if (phase === "away") {
        phase = "pause";
        until = now + 5500;
      } else if (phase === "pause" && now >= until) {
        phase = "home";
        path = officePath(floor, position, home);
      } else if (phase === "home") phase = "done";
      return { position: next, walking, phase, done: phase === "done" };
    },
  };
}
export type InteractionWalk = ReturnType<typeof createInteractionWalk>;
export function companyWalkFloor(
  rooms: ReturnType<typeof companyRooms>,
): OfficeFloor {
  const rectangles: {
    left: number;
    right: number;
    back: number;
    front: number;
  }[] = [];
  const depth = rooms[0].depth,
    minX = Math.min(...rooms.map((r) => r.x)) - 9.6,
    maxX = Math.max(...rooms.map((r) => r.x)) + 9.6,
    minZ = Math.min(...rooms.map((r) => r.z)) - depth / 2 - 0.65,
    maxZ = Math.max(...rooms.map((r) => r.z)) + depth / 2 + 0.65;
  for (const room of rooms) {
    const sign = room.rotation === 0 ? 1 : -1,
      back = room.z - (sign * depth) / 2;
    rectangles.push({
      left: room.x - 9.45,
      right: room.x + 9.45,
      back: back - 0.35,
      front: back + 0.35,
    });
    for (const side of [-1, 1])
      rectangles.push({
        left: room.x + side * 9.15 - 0.3,
        right: room.x + side * 9.15 + 0.3,
        back: room.z - depth / 2 - 0.2,
        front: room.z + depth / 2 + 0.2,
      });
    for (const member of room.members) {
      const x = room.x + sign * member.position[0],
        z = room.z + sign * (member.position[1] - 0.6);
      rectangles.push({
        left: x - 1.8,
        right: x + 1.8,
        back: z - 1.02,
        front: z + 1.02,
      });
    }
  }
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    canStand(p) {
      return (
        p.x >= minX &&
        p.x <= maxX &&
        p.z >= minZ &&
        p.z <= maxZ &&
        !rectangles.some(
          (r) => p.x > r.left && p.x < r.right && p.z > r.back && p.z < r.front,
        )
      );
    },
  };
}
