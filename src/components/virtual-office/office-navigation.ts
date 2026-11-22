export type FloorPoint = { x: number; z: number };
type Obstacle = { left: number; right: number; back: number; front: number };
export function officeFloor(
  positions: readonly (readonly [number, number])[],
  extraDepth: number,
) {
  const obstacles: Obstacle[] = [
    { left: -2.85, right: 2.85, back: -1.35, front: 4.4 },
    { left: -4.7, right: -1.3, back: -7, front: -5.65 },
    { left: -1.1, right: 1.1, back: -7, front: -5.7 },
    { left: -9.8, right: -8.55, back: -6, front: -1.4 },
    ...positions.map(([x, z]) => ({
      left: x - 1.7,
      right: x + 1.7,
      back: z - 1.65,
      front: z + 1.4,
    })),
    ...[
      [-8.8, 6.2],
      [8.5, -6],
      [3.2, -6.5],
    ].map(([x, z]) => ({
      left: x - 0.65,
      right: x + 0.65,
      back: z - 0.65,
      front: z + 0.65,
    })),
  ];
  return {
    minX: -9.3,
    maxX: 9.3,
    minZ: -6.75,
    maxZ: 7 + extraDepth,
    canStand({ x, z }: FloorPoint) {
      return (
        x >= this.minX &&
        x <= this.maxX &&
        z >= this.minZ &&
        z <= this.maxZ &&
        !obstacles.some(
          (o) => x > o.left && x < o.right && z > o.back && z < o.front,
        )
      );
    },
  };
}
export type OfficeFloor = ReturnType<typeof officeFloor>;
/** A small four-neighbour floor grid keeps walks around desks and the meeting table. */
export function officePath(
  floor: OfficeFloor,
  from: FloorPoint,
  to: FloorPoint,
): FloorPoint[] {
  const size = 0.4,
    width = Math.floor((floor.maxX - floor.minX) / size) + 1,
    height = Math.floor((floor.maxZ - floor.minZ) / size) + 1;
  const point = (id: number) => ({
    x: floor.minX + (id % width) * size,
    z: floor.minZ + Math.floor(id / width) * size,
  });
  const closest = (p: FloorPoint) => {
    let best = -1,
      distance = Infinity;
    for (let id = 0; id < width * height; id++) {
      const q = point(id),
        d = (p.x - q.x) ** 2 + (p.z - q.z) ** 2;
      if (d < distance && floor.canStand(q)) {
        best = id;
        distance = d;
      }
    }
    return best;
  };
  const start = closest(from),
    goal = closest(to);
  if (start < 0 || goal < 0) return [];
  const queue = [start],
    parents = new Map<number, number>([[start, -1]]);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (id === goal) break;
    for (const next of [id - 1, id + 1, id - width, id + width]) {
      if (
        next < 0 ||
        next >= width * height ||
        parents.has(next) ||
        Math.abs((next % width) - (id % width)) > 1 ||
        !floor.canStand(point(next))
      )
        continue;
      parents.set(next, id);
      queue.push(next);
    }
  }
  if (!parents.has(goal)) return [];
  const route: FloorPoint[] = [];
  for (let id = goal; id !== start; id = parents.get(id)!)
    route.push(point(id));
  route.reverse();
  if (
    floor.canStand(to) &&
    Math.hypot(point(goal).x - to.x, point(goal).z - to.z) < size
  )
    route.push(to);
  return route;
}
