// player.js — the first-person controller: pointer-lock mouse look, WASD
// movement with acceleration and friction, crouch, sprint, jump, and the
// weapon (fire / reload / switch / buy / grenade / plant channel).
// Movement punishes firing on the move: spread grows with speed, recoil
// kicks the view, and stopping to aim pays — the gunplay the bounty asks for.
import * as THREE from 'three';
import { collide, SITES } from './world.js';
import { WEAPONS, WEAPON_ORDER } from './state.js';
import { fireHitscan, applyDamage, createGrenade, tracer } from './combat.js';

export function createPlayer(scene, camera, world, state) {
  const gun = new THREE.Group();
  const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.62),
    new THREE.MeshStandardMaterial({ color: 0x1c1e20, roughness: 0.45, metalness: 0.55 }));
  const gunBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x3a3f44, roughness: 0.4, metalness: 0.6 }));
  gunBarrel.position.set(0, 0.02, -0.42);
  const gunGrip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.8 }));
  gunGrip.position.set(0, -0.14, 0.12);
  gun.add(gunBody, gunBarrel, gunGrip);
  gun.position.set(0.28, -0.26, -0.5);
  camera.add(gun);
  scene.add(camera);

  const p = {
    isPlayer: true, team: 'attack', name: 'You',
    x: 0, z: -16, y: 0, vx: 0, vz: 0, yaw: 0, pitch: 0,
    hp: 100, armour: 0, dead: false, crouched: false, moving: false,
    weaponId: 'pistol', mag: 12, reserve: 48, fireT: 0, reloadT: 0,
    recoil: 0, spreadBloom: 0, grenades: 0, hasSpike: true,
    hitParts: [], // the player is never a raycast target for bots (they aim at a point)
    keys: {}, mouseDown: false, jumpV: 0, grounded: true,
    gun, gunKick: 0,
  };
  return p;
}

export function resetPlayer(p, state) {
  p.x = 0; p.z = -16; p.y = 0; p.vx = 0; p.vz = 0;
  p.yaw = 0; p.pitch = 0; p.hp = 100; p.armour = 0; p.dead = false;
  p.weaponId = 'pistol'; p.mag = WEAPONS.pistol.mag; p.reserve = WEAPONS.pistol.reserve;
  p.fireT = 0; p.reloadT = 0; p.recoil = 0; p.grenades = 0; p.hasSpike = true;
  p.crouched = false;
}

export function equipWeapon(p, id, keepAmmo) {
  const w = WEAPONS[id];
  p.weaponId = id;
  if (!keepAmmo) { p.mag = w.mag; p.reserve = w.reserve; }
  p.fireT = 0; p.reloadT = 0;
}

export function buyItem(p, state, id, audio) {
  if (id === 'armour') {
    if (p.armour >= 100 || state.money < 650) { audio.denied(); return false; }
    state.money -= 650; p.armour = 100; audio.buy(); return true;
  }
  if (id === 'grenade') {
    if (p.grenades >= 2 || state.money < 300) { audio.denied(); return false; }
    state.money -= 300; p.grenades++; audio.buy(); return true;
  }
  const w = WEAPONS[id];
  if (!w || p.weaponId === id || state.money < w.price) { audio.denied(); return false; }
  state.money -= w.price;
  equipWeapon(p, id, false);
  audio.buy();
  return true;
}

export function updatePlayer(p, dt, ctx) {
  const { state, world, camera, audio, onKill, scene } = ctx;
  p.fireT -= dt;
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) {
      const w = WEAPONS[p.weaponId];
      const need = w.mag - p.mag;
      const take = Math.min(need, p.reserve);
      p.mag += take; p.reserve -= take;
    }
  }
  p.recoil = Math.max(0, p.recoil - dt * 0.09);
  p.spreadBloom = Math.max(0, p.spreadBloom - dt * 0.05);
  p.gunKick = Math.max(0, p.gunKick - dt * 0.35);

  const k = p.keys;
  const sprint = k['ShiftLeft'] || k['ShiftRight'];
  const crouch = k['ControlLeft'] || k['KeyC'];
  p.crouched = !!crouch;
  const speed = p.crouched ? 2.2 : sprint ? 6.4 : 4.6;
  let ix = (k['KeyD'] ? 1 : 0) - (k['KeyA'] ? 1 : 0);
  let iz = (k['KeyW'] ? 1 : 0) - (k['KeyS'] ? 1 : 0);
  const il = Math.hypot(ix, iz) || 1;
  ix /= il; iz /= il;
  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  const wx = (sin * -iz + cos * ix) * speed;
  const wz = (cos * -iz - sin * ix) * speed;
  // Acceleration + friction: velocity eases toward the wish direction.
  const accel = p.grounded ? 14 : 5;
  p.vx += (wx - p.vx) * Math.min(1, accel * dt);
  p.vz += (wz - p.vz) * Math.min(1, accel * dt);
  p.moving = Math.hypot(p.vx, p.vz) > 0.6;

  const r = collide(world.colliders, p.x + p.vx * dt, p.z + p.vz * dt, 0.42, p.y, 1.7);
  p.x = r.x; p.z = r.z;

  if (k['Space'] && p.grounded) { p.jumpV = 5.2; p.grounded = false; }
  if (!p.grounded) {
    p.jumpV -= 14 * dt;
    p.y += p.jumpV * dt;
    if (p.y <= 0) { p.y = 0; p.grounded = true; p.jumpV = 0; }
  }

  const eyeH = p.crouched ? 1.15 : 1.62;
  camera.position.set(p.x, p.y + eyeH, p.z);
  camera.rotation.set(p.pitch + p.recoil, p.yaw, 0, 'YXZ');
  p.gun.position.set(0.28, -0.26 + p.gunKick * 0.35, -0.5 + p.gunKick * 0.25);
  p.gun.rotation.x = p.gunKick * 0.6;

  // Firing.
  const w = WEAPONS[p.weaponId];
  if (p.mouseDown && p.fireT <= 0 && p.reloadT <= 0 && state.phase === 'live') {
    if (p.mag <= 0) { audio.dry(); p.fireT = 0.25; }
    else shoot(p, dt, ctx);
    if (!w.auto) p.mouseDown = false;
  }

  // Plant / defuse channel (hold E near a site, or near the planted spike).
  updateChannel(p, dt, ctx);
}

function shoot(p, dt, ctx) {
  const { state, world, camera, audio, onKill, scene } = ctx;
  const w = WEAPONS[p.weaponId];
  p.mag--;
  p.fireT = w.fireInterval;
  state.stats.shots++;
  const speedF = Math.hypot(p.vx, p.vz) / 6.4;
  const spread = w.spread + w.moveSpread * speedF + p.spreadBloom;
  p.spreadBloom = Math.min(0.05, p.spreadBloom + w.recoil * 0.5);
  p.recoil += w.recoil;
  p.gunKick = 1;
  audio.shot(w.id);
  // Alert nearby bots to the shot.
  for (const b of state.bots) {
    if (b.hp > 0 && Math.hypot(b.x - p.x, b.z - p.z) < 26) {
      b.heardT = state.time;
      b.lastSeen = { x: p.x, z: p.z };
    }
  }
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.x += (Math.random() - 0.5) * spread * 2;
  dir.y += (Math.random() - 0.5) * spread * 2;
  dir.z += (Math.random() - 0.5) * spread * 2;
  dir.normalize();
  const res = fireHitscan(world, [p, ...state.bots], p,
    camera.position.x, camera.position.y, camera.position.z, dir.x, dir.y, dir.z, w);
  const from = camera.position.clone();
  const to = res ? res.point.clone() : from.clone().add(dir.clone().multiplyScalar(w.range));
  tracer(scene, from, to);
  if (res && res.kind === 'hit') {
    state.stats.hits++;
    audio.hit();
    ctx.onHitmarker(res.head);
    const killed = applyDamage(res.fighter, res.damage, state, audio, p);
    if (killed) {
      audio.kill();
      if (onKill) onKill(res.fighter, p, res.head ? 'headshot' : 'shot');
    }
  }
}

function updateChannel(p, dt, ctx) {
  const { state, world, audio } = ctx;
  const spike = state.spike;
  const k = p.keys;
  let active = false;
  if (state.phase === 'live' && k['KeyE'] && !p.dead) {
    if (spike.state === 'carried' && p.hasSpike) {
      for (const key of ['A', 'B']) {
        const s = SITES[key];
        const d = Math.hypot(s.center[0] - p.x, s.center[1] - p.z);
        if (d < s.radius) {
          spike.state = 'planting'; spike.site = key; active = true;
          spike.progress += dt / 3;
          if (Math.random() < dt * 3) audio.plantBeep();
          if (spike.progress >= 1) {
            spike.state = 'planted'; spike.progress = 0; spike.fuse = 25;
            spike.pos = [s.center[0], s.center[1]];
            p.hasSpike = false;
            state.money += 300; state.stats.plants++;
            ctx.onPlant('planted', p);
          }
          break;
        }
      }
    } else if (spike.state === 'planted' && spike.pos && p.team === 'attack') {
      // Attackers cannot defuse their own spike; defenders do it via bots.
    }
  }
  if (!active && (spike.state === 'planting')) {
    spike.state = 'carried'; spike.progress = 0; spike.site = null;
  }
  ctx.planting = active;
}

export function throwGrenade(p, dt, ctx) {
  const { state, scene, camera, audio } = ctx;
  if (p.grenades <= 0 || state.phase !== 'live') return;
  p.grenades--;
  audio.grenadePin();
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const g = createGrenade(scene,
    camera.position.x + dir.x * 0.5, camera.position.y - 0.1, camera.position.z + dir.z * 0.5,
    dir.x * 14 + p.vx * 0.5, dir.y * 14 + 3.5, dir.z * 14 + p.vz * 0.5, p);
  state.grenades.push(g);
}

export function reload(p, audio) {
  const w = WEAPONS[p.weaponId];
  if (p.reloadT > 0 || p.mag >= w.mag || p.reserve <= 0) return;
  p.reloadT = w.reloadTime;
  audio.reload();
}
