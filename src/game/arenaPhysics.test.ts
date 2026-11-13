import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARENA_HALF_SIZE,
  ARENA_OBSTACLES,
  PLAYER_RADIUS,
  hasLineOfSight,
  raycastActorHitbox,
  raycastObstacles,
  resolveCircleAabbCollision,
} from './arenaPhysics';

test('player spawn at (0, 11) and enemy spawn at (0, -11) have clear initial sightline', () => {
  const clear = hasLineOfSight(0, 1.6, 11, 0, 1.6, -11, ARENA_OBSTACLES);
  assert.equal(clear, true);
});

test('collision pushes player outside obstacle and clamps inside arena bounds', () => {
  // Push near inner-se pillar at (5, 4.6)
  const ob = ARENA_OBSTACLES[3];
  const resolved = resolveCircleAabbCollision(ob.x, ob.z + ob.halfD + 0.1, PLAYER_RADIUS);
  assert.ok(resolved.z >= ob.z + ob.halfD + PLAYER_RADIUS - 1e-4);

  // Clamp outside arena perimeter
  const clamped = resolveCircleAabbCollision(999, -999, PLAYER_RADIUS);
  assert.equal(clamped.x, ARENA_HALF_SIZE - PLAYER_RADIUS);
  assert.equal(clamped.z, -ARENA_HALF_SIZE + PLAYER_RADIUS);
});

test('obstacle raycast blocks shots behind pillar', () => {
  // Pillar inner-nw at x = -5.0, z = -4.6, halfW = 1.15
  const dist = raycastObstacles(-5.0, 1.2, 2.0, 0, 0, -1, 50, ARENA_OBSTACLES);
  assert.ok(dist < 10);
  const clear = hasLineOfSight(-5.0, 1.2, 2.0, -5.0, 1.2, -10.0, ARENA_OBSTACLES);
  assert.equal(clear, false);
});

test('actor hitbox raycast detects torso and headshot hits accurately', () => {
  const torsoHit = raycastActorHitbox(0, 1.1, 10, 0, 0, -1, 0, 0, 0, 0.7, 2.2, 50);
  assert.equal(torsoHit.hit, true);
  assert.equal(torsoHit.headshot, false);

  const headHit = raycastActorHitbox(0, 1.82, 10, 0, 0, -1, 0, 0, 0, 0.7, 2.2, 50);
  assert.equal(headHit.hit, true);
  assert.equal(headHit.headshot, true);

  const miss = raycastActorHitbox(3, 1.5, 10, 0, 0, -1, 0, 0, 0, 0.7, 2.2, 50);
  assert.equal(miss.hit, false);
});
