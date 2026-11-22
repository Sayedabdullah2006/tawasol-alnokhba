/** Deterministic nine-ball pool: equal-mass collisions, cushions, friction, pockets and turn rules. */
export const POOL = { halfX: 2.65, halfZ: 1.25, radius: 0.105, pocket: 0.225 };
export const POCKETS = [
  [-2.65, -1.25],
  [0, -1.25],
  [2.65, -1.25],
  [-2.65, 1.25],
  [0, 1.25],
  [2.65, 1.25],
] as const;
export type PoolBall = {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  alive: boolean;
};
export type PoolGame = {
  balls: PoolBall[];
  players: number;
  turn: number;
  scores: number[];
  shots: number;
  moving: boolean;
  winner: number | null;
  message: string;
  firstHit: number | null;
  required: number;
  potted: number[];
  scratch: boolean;
  rail: boolean;
  accumulator: number;
};
export function newPoolGame(players = 6): PoolGame {
  const balls: PoolBall[] = [
    { id: 0, x: -1.35, z: 0, vx: 0, vz: 0, alive: true },
  ];
  const rack = [1, 2, 3, 4, 9, 5, 6, 7, 8];
  let index = 0;
  [1, 2, 3, 2, 1].forEach((count, row) => {
    for (let col = 0; col < count; col++)
      balls.push({
        id: rack[index++],
        x: 0.65 + row * 0.187,
        z: (col - (count - 1) / 2) * 0.216,
        vx: 0,
        vz: 0,
        alive: true,
      });
  });
  return {
    balls,
    players,
    turn: 0,
    scores: Array(players).fill(0),
    shots: 0,
    moving: false,
    winner: null,
    message: "الطاولة جاهزة",
    firstHit: null,
    required: 1,
    potted: [],
    scratch: false,
    rail: false,
    accumulator: 0,
  };
}
export function lowestPoolBall(game: PoolGame) {
  return Math.min(
    ...game.balls.filter((b) => b.alive && b.id > 0).map((b) => b.id),
  );
}
export function shootPool(game: PoolGame, angle: number, power = 3.8) {
  if (
    game.moving ||
    game.winner !== null ||
    !Number.isFinite(angle) ||
    !Number.isFinite(power)
  )
    return false;
  const cue = game.balls.find((b) => b.id === 0)!;
  if (!cue.alive) return false;
  const speed = Math.max(0.5, Math.min(5, power));
  cue.vx = Math.cos(angle) * speed;
  cue.vz = Math.sin(angle) * speed;
  game.moving = true;
  game.required = lowestPoolBall(game);
  game.firstHit = null;
  game.potted = [];
  game.scratch = false;
  game.rail = false;
  game.shots++;
  game.message = "التسديدة جارية";
  return true;
}
function respot(game: PoolGame, id: number, x: number, z: number) {
  const ball = game.balls.find((b) => b.id === id)!;
  for (let i = 0; i < 150; i++) {
    const px = i === 0 ? x : -2.2 + (i % 15) * 0.3,
      pz = i === 0 ? z : -0.9 + Math.floor(i / 15) * 0.19;
    if (
      game.balls.every(
        (b) =>
          b.id === id ||
          !b.alive ||
          Math.hypot(b.x - px, b.z - pz) > POOL.radius * 2.1,
      )
    ) {
      Object.assign(ball, { x: px, z: pz, vx: 0, vz: 0, alive: true });
      return;
    }
  }
}
function settle(game: PoolGame) {
  game.moving = false;
  const foul =
    game.scratch ||
    game.firstHit !== game.required ||
    (!game.rail && !game.potted.length);
  if (game.potted.includes(9) && !foul) {
    game.winner = game.turn;
    game.message = "فوز بالكرة ٩";
    return;
  }
  if (game.potted.includes(9)) respot(game, 9, 0.8, 0);
  if (game.scratch) respot(game, 0, -1.35, 0);
  game.scores[game.turn] += game.potted.filter(
    (id) => id > 0 && id !== 9,
  ).length;
  if (foul || !game.potted.some((id) => id > 0))
    game.turn = (game.turn + 1) % game.players;
  game.message = foul
    ? "خطأ؛ انتقل الدور إلى الزميل التالي"
    : game.potted.length
      ? "كرة في الجيب؛ تستمر فرصة اللاعب"
      : "انتهت التسديدة؛ تبديل الدور";
}
export function stepPool(game: PoolGame, seconds: number) {
  if (!game.moving) return;
  game.accumulator += Math.min(0.1, Math.max(0, seconds));
  const dt = 1 / 180;
  while (game.accumulator >= dt && game.moving) {
    game.accumulator -= dt;
    for (const b of game.balls) {
      if (!b.alive) continue;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      if (
        POCKETS.some(([x, z]) => Math.hypot(b.x - x, b.z - z) < POOL.pocket)
      ) {
        b.alive = false;
        b.vx = b.vz = 0;
        game.potted.push(b.id);
        if (b.id === 0) game.scratch = true;
        continue;
      }
      const boundX = POOL.halfX - POOL.radius,
        boundZ = POOL.halfZ - POOL.radius;
      if (Math.abs(b.x) > boundX) {
        b.x = Math.sign(b.x) * boundX;
        b.vx *= -0.85;
        if (game.firstHit !== null) game.rail = true;
      }
      if (Math.abs(b.z) > boundZ) {
        b.z = Math.sign(b.z) * boundZ;
        b.vz *= -0.85;
        if (game.firstHit !== null) game.rail = true;
      }
      const friction = Math.exp(-1.02 * dt);
      b.vx *= friction;
      b.vz *= friction;
      if (Math.hypot(b.vx, b.vz) < 0.025) b.vx = b.vz = 0;
    }
    for (let i = 0; i < game.balls.length; i++)
      for (let j = i + 1; j < game.balls.length; j++) {
        const a = game.balls[i],
          b = game.balls[j];
        if (!a.alive || !b.alive) continue;
        const dx = b.x - a.x,
          dz = b.z - a.z,
          d = Math.hypot(dx, dz),
          diameter = POOL.radius * 2;
        if (d >= diameter || d < 1e-8) continue;
        const nx = dx / d,
          nz = dz / d,
          overlap = (diameter - d) / 2 + 0.00001;
        a.x -= nx * overlap;
        a.z -= nz * overlap;
        b.x += nx * overlap;
        b.z += nz * overlap;
        const approach = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (approach > 0) {
          if (game.firstHit === null && (a.id === 0 || b.id === 0))
            game.firstHit = a.id === 0 ? b.id : a.id;
          const impulse = approach * 0.985;
          a.vx -= impulse * nx;
          a.vz -= impulse * nz;
          b.vx += impulse * nx;
          b.vz += impulse * nz;
        }
      }
    if (game.balls.every((b) => !b.alive || Math.hypot(b.vx, b.vz) === 0))
      settle(game);
  }
}
export function aimPool(game: PoolGame) {
  const cue = game.balls.find((b) => b.id === 0)!,
    target = game.balls.find((b) => b.id === lowestPoolBall(game));
  if (!target) return 0;
  let bestAngle = Math.atan2(target.z - cue.z, target.x - cue.x),
    best = Infinity;
  for (const [px, pz] of POCKETS) {
    const dx = px - target.x,
      dz = pz - target.z,
      length = Math.hypot(dx, dz),
      gx = target.x - (dx / length) * POOL.radius * 2,
      gz = target.z - (dz / length) * POOL.radius * 2;
    if (
      Math.abs(gx) > POOL.halfX - POOL.radius ||
      Math.abs(gz) > POOL.halfZ - POOL.radius
    )
      continue;
    const clear = (ax: number, az: number, bx: number, bz: number) =>
      game.balls.every((b) => {
        if (!b.alive || b.id === 0 || b.id === target.id) return true;
        const vx = bx - ax,
          vz = bz - az,
          t = Math.max(
            0,
            Math.min(
              1,
              ((b.x - ax) * vx + (b.z - az) * vz) / (vx * vx + vz * vz),
            ),
          );
        return (
          Math.hypot(b.x - ax - t * vx, b.z - az - t * vz) > POOL.radius * 2.1
        );
      });
    if (!clear(cue.x, cue.z, gx, gz) || !clear(target.x, target.z, px, pz))
      continue;
    const alignment =
      ((gx - cue.x) * dx + (gz - cue.z) * dz) /
      (Math.hypot(gx - cue.x, gz - cue.z) * length);
    const cost =
      (1 - alignment) * 8 + Math.hypot(gx - cue.x, gz - cue.z) + length * 0.3;
    if (cost < best) {
      best = cost;
      bestAngle = Math.atan2(gz - cue.z, gx - cue.x);
    }
  }
  return bestAngle;
}
