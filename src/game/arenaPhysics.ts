export interface ArenaObstacle {
  id: string;
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  height: number;
}

export const ARENA_HALF_SIZE = 15.2;
export const PLAYER_RADIUS = 0.65;
export const PLAYER_HEIGHT = 2.2;
export const EYE_HEIGHT = 1.68;

/**
 * Symmetric arena cover layout.
 * Leaves the central duel axis (x = 0, z = -11 .. +11) and wide flank lanes clear.
 */
export const ARENA_OBSTACLES: ArenaObstacle[] = [
  { id: 'inner-nw', x: -5.0, z: -4.6, halfW: 1.15, halfD: 1.15, height: 2.9 },
  { id: 'inner-ne', x: 5.0, z: -4.6, halfW: 1.15, halfD: 1.15, height: 2.9 },
  { id: 'inner-sw', x: -5.0, z: 4.6, halfW: 1.15, halfD: 1.15, height: 2.9 },
  { id: 'inner-se', x: 5.0, z: 4.6, halfW: 1.15, halfD: 1.15, height: 2.9 },
  { id: 'flank-w', x: -9.4, z: 0, halfW: 1.0, halfD: 2.1, height: 2.3 },
  { id: 'flank-e', x: 9.4, z: 0, halfW: 1.0, halfD: 2.1, height: 2.3 },
  { id: 'bastion-nw', x: -9.6, z: -9.2, halfW: 1.2, halfD: 1.2, height: 3.3 },
  { id: 'bastion-se', x: 9.6, z: 9.2, halfW: 1.2, halfD: 1.2, height: 3.3 },
];

export function resolveCircleAabbCollision(
  x: number,
  z: number,
  radius: number,
  obstacles: ArenaObstacle[] = ARENA_OBSTACLES,
  arenaHalfSize: number = ARENA_HALF_SIZE,
): { x: number; z: number } {
  let rx = Math.max(-arenaHalfSize + radius, Math.min(arenaHalfSize - radius, x));
  let rz = Math.max(-arenaHalfSize + radius, Math.min(arenaHalfSize - radius, z));

  for (let pass = 0; pass < 2; pass++) {
    for (const ob of obstacles) {
      const closestX = Math.max(ob.x - ob.halfW, Math.min(ob.x + ob.halfW, rx));
      const closestZ = Math.max(ob.z - ob.halfD, Math.min(ob.z + ob.halfD, rz));
      const dx = rx - closestX;
      const dz = rz - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        const dist = Math.sqrt(distSq);
        if (dist > 1e-5) {
          const push = radius - dist;
          rx += (dx / dist) * push;
          rz += (dz / dist) * push;
        } else {
          // Center inside AABB: push out along shallowest axis
          const penX = ob.halfW + radius - Math.abs(rx - ob.x);
          const penZ = ob.halfD + radius - Math.abs(rz - ob.z);
          if (penX < penZ) {
            rx += rx >= ob.x ? penX : -penX;
          } else {
            rz += rz >= ob.z ? penZ : -penZ;
          }
        }
      }
    }
    rx = Math.max(-arenaHalfSize + radius, Math.min(arenaHalfSize - radius, rx));
    rz = Math.max(-arenaHalfSize + radius, Math.min(arenaHalfSize - radius, rz));
  }

  return { x: rx, z: rz };
}

export function raycastObstacles(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  obstacles: ArenaObstacle[] = ARENA_OBSTACLES,
): number {
  let closest = maxDist;

  // Floor hit check (y = 0)
  if (dy < -1e-6 && oy > 0) {
    const tFloor = -oy / dy;
    if (tFloor > 0 && tFloor < closest) {
      closest = tFloor;
    }
  }

  for (const ob of obstacles) {
    const minX = ob.x - ob.halfW;
    const maxX = ob.x + ob.halfW;
    const minY = 0;
    const maxY = ob.height;
    const minZ = ob.z - ob.halfD;
    const maxZ = ob.z + ob.halfD;

    let tmin = 0;
    let tmax = closest;

    const invDx = Math.abs(dx) > 1e-8 ? 1 / dx : Infinity;
    const t1x = (minX - ox) * invDx;
    const t2x = (maxX - ox) * invDx;
    if (invDx === Infinity) {
      if (ox < minX || ox > maxX) continue;
    } else {
      tmin = Math.max(tmin, Math.min(t1x, t2x));
      tmax = Math.min(tmax, Math.max(t1x, t2x));
    }

    const invDy = Math.abs(dy) > 1e-8 ? 1 / dy : Infinity;
    const t1y = (minY - oy) * invDy;
    const t2y = (maxY - oy) * invDy;
    if (invDy === Infinity) {
      if (oy < minY || oy > maxY) continue;
    } else {
      tmin = Math.max(tmin, Math.min(t1y, t2y));
      tmax = Math.min(tmax, Math.max(t1y, t2y));
    }

    const invDz = Math.abs(dz) > 1e-8 ? 1 / dz : Infinity;
    const t1z = (minZ - oz) * invDz;
    const t2z = (maxZ - oz) * invDz;
    if (invDz === Infinity) {
      if (oz < minZ || oz > maxZ) continue;
    } else {
      tmin = Math.max(tmin, Math.min(t1z, t2z));
      tmax = Math.min(tmax, Math.max(t1z, t2z));
    }

    if (tmax >= tmin && tmin > 0 && tmin < closest) {
      closest = tmin;
    }
  }

  return closest;
}

export function raycastActorHitbox(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  actorX: number,
  actorY: number,
  actorZ: number,
  radius: number,
  height: number,
  maxDist: number,
): { hit: boolean; distance: number; headshot: boolean } {
  // Approximate vertical capsule/cylinder with 2 stacked spheres + mid cylinder check
  // Lower body center, mid torso center, head center
  const checks = [
    { cy: actorY + height * 0.82, r: radius * 0.72, headshot: true },
    { cy: actorY + height * 0.5, r: radius * 1.05, headshot: false },
    { cy: actorY + height * 0.22, r: radius * 1.0, headshot: false },
  ];

  let bestDist = maxDist;
  let bestHit = false;
  let bestHead = false;

  for (const c of checks) {
    const ocx = ox - actorX;
    const ocy = oy - c.cy;
    const ocz = oz - actorZ;
    const b = ocx * dx + ocy * dy + ocz * dz;
    const cc = ocx * ocx + ocy * ocy + ocz * ocz - c.r * c.r;
    const disc = b * b - cc;
    if (disc < 0) continue;
    const sqrtD = Math.sqrt(disc);
    const t = -b - sqrtD;
    if (t > 0 && t < bestDist) {
      bestDist = t;
      bestHit = true;
      bestHead = c.headshot;
    }
  }

  return { hit: bestHit, distance: bestDist, headshot: bestHead };
}

export function hasLineOfSight(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  obstacles: ArenaObstacle[] = ARENA_OBSTACLES,
): boolean {
  const vx = bx - ax;
  const vy = by - ay;
  const vz = bz - az;
  const dist = Math.hypot(vx, vy, vz);
  if (dist < 1e-4) return true;
  const hitT = raycastObstacles(
    ax,
    ay,
    az,
    vx / dist,
    vy / dist,
    vz / dist,
    dist,
    obstacles,
  );
  return hitT >= dist - 0.05;
}
