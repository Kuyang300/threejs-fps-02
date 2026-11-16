// combat.js — hitscan shooting shared by the player and the bots, plus the
// grenade. One raycast per shot against the world meshes and every living
// fighter's body parts; head parts take the weapon's head multiplier.
// No allocations in the hot path beyond one reused Raycaster and vector.
import * as THREE from 'three';

const raycaster = new THREE.Raycaster();
const origin = new THREE.Vector3();
const dir = new THREE.Vector3();
const tmp = new THREE.Vector3();

export function fireHitscan(world, fighters, shooter, ox, oy, oz, dx, dy, dz, weapon) {
  origin.set(ox, oy, oz);
  dir.set(dx, dy, dz).normalize();
  raycaster.set(origin, dir);
  raycaster.far = weapon.range;
  const targets = [];
  for (const f of fighters) {
    if (f === shooter || f.hp <= 0) continue;
    for (const part of f.hitParts) targets.push(part);
  }
  const hits = raycaster.intersectObjects([...world.shootables, ...targets], false);
  if (!hits.length) return null;
  const h = hits[0];
  const part = h.object.userData.fighter;
  if (!part) return { kind: 'wall', point: h.point, distance: h.distance };
  const head = h.object.userData.part === 'head';
  const dmg = weapon.damage * (head ? weapon.headMul : 1);
  return { kind: 'hit', fighter: part, head, damage: dmg, point: h.point, distance: h.distance };
}

export function applyDamage(target, dmg, state, audio, killer) {
  if (target.hp <= 0) return false;
  let rest = dmg;
  if (target.armour > 0) {
    const absorbed = Math.min(target.armour, rest * 0.5);
    target.armour -= absorbed;
    rest -= absorbed;
  }
  target.hp -= rest;
  if (target.hp <= 0) {
    target.hp = 0;
    target.dead = true;
    if (killer && killer.isPlayer) {
      state.money += 300;
      state.stats.kills++;
    }
    return true;
  }
  return false;
}

// A thrown grenade: simple ballistic arc, explodes on first ground/box hit
// or after its fuse, dealing falloff damage in a radius.
export function createGrenade(scene, x, y, z, vx, vy, vz, owner) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x2e4d2e, roughness: 0.5, metalness: 0.4 }),
  );
  mesh.position.set(x, y, z);
  scene.add(mesh);
  const light = new THREE.PointLight(0xff8833, 0, 9);
  scene.add(light);
  return { mesh, light, vx, vy, vz, fuse: 1.6, owner, exploded: false };
}

export function stepGrenade(g, dt, colliders, fighters, state, audio, onKill) {
  if (g.exploded) return true;
  g.vy -= 14 * dt;
  let x = g.mesh.position.x + g.vx * dt;
  let y = g.mesh.position.y + g.vy * dt;
  let z = g.mesh.position.z + g.vz * dt;
  g.fuse -= dt;
  let boom = g.fuse <= 0 || y <= 0.12;
  if (!boom) {
    for (const c of colliders) {
      if (y < c.maxY && y > c.minY - 0.1 && x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) { boom = true; break; }
    }
  }
  g.mesh.position.set(x, Math.max(y, 0.12), z);
  g.light.position.copy(g.mesh.position);
  if (!boom) return false;
  g.exploded = true;
  g.light.intensity = 60;
  audio.explosion();
  const p = g.mesh.position;
  for (const f of fighters) {
    if (f.hp <= 0) continue;
    tmp.set(f.x - p.x, 0, f.z - p.z);
    const d = tmp.length();
    if (d < 7) {
      const dmg = 110 * (1 - d / 7) + 10;
      const killed = applyDamage(f, dmg, state, audio, g.owner);
      if (killed && onKill) onKill(f, g.owner, 'grenade');
    }
  }
  setTimeout(() => { g.mesh.visible = false; g.light.intensity = 0; }, 120);
  return true;
}

export function tracer(scene, from, to, color) {
  const mat = new THREE.LineBasicMaterial({ color: color || 0xffe08a, transparent: true, opacity: 0.9 });
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  setTimeout(() => { scene.remove(line); geo.dispose(); mat.dispose(); }, 60);
  return line;
}
