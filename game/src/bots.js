// bots.js — bot fighters. Each bot is a simple built-up figure (body box,
// head box, gun box, team-coloured trim) with hit parts the raycaster can
// strike. Behaviour, in priority order each tick:
//   1. if the spike is planted and I am a defender: run to it and defuse.
//   2. if I can see an enemy and am in range: stop, aim, burst fire.
//   3. if I heard a shot or saw an enemy recently: push their last position.
//   4. otherwise: walk my route (waypoint graph) toward my assigned site,
//      pausing at hold points to watch a lane.
// Bots strafe while firing, spread grows while they move, and their accuracy
// falls with distance — the same trade-offs the player faces.
import * as THREE from 'three';
import { WAYPOINTS, findRoute, nearestWaypoint, hasLineOfSight, SITES, collide } from './world.js';
import { fireHitscan, applyDamage } from './combat.js';
import { WEAPONS } from './state.js';

const NAMES = ['Vex', 'Mara', 'Ivo', 'Sable', 'Rook', 'Dune', 'Kite', 'Ash'];

function makeFigure(team, name) {
  const g = new THREE.Group();
  const bodyCol = team === 'attack' ? 0x2e6f6a : 0x8a2f26;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.32),
    new THREE.MeshStandardMaterial({ color: bodyCol, roughness: 0.8 }));
  body.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34),
    new THREE.MeshStandardMaterial({ color: 0xd8b48f, roughness: 0.85 }));
  head.position.y = 1.66;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.36),
    new THREE.MeshStandardMaterial({ color: team === 'attack' ? 0x37c8e8 : 0xff7a3c, roughness: 0.3, metalness: 0.4 }));
  visor.position.y = 1.68;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x1c1e20, roughness: 0.5, metalness: 0.5 }));
  gun.position.set(0.22, 1.25, 0.35);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x23272c, roughness: 0.9 }));
  legs.position.y = 0.32;
  g.add(body, head, visor, gun, legs);
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
  return { group: g, body, head };
}

export function spawnBots(scene, world, state, count, team, weaponId) {
  const bots = [];
  const spawnList = team === 'attack' ? [[-3, -17], [3, -17]] : [[-6, 15], [0, 16], [6, 15], [-11, 12], [11, 12]];
  for (let i = 0; i < count; i++) {
    const fig = makeFigure(team, NAMES[(bots.length + (team === 'defend' ? 4 : 0)) % NAMES.length]);
    const [sx, sz] = spawnList[i % spawnList.length];
    fig.group.position.set(sx, 0, sz);
    scene.add(fig.group);
    const weapon = WEAPONS[weaponId || (team === 'attack' ? 'rifle' : 'rifle')];
    const bot = {
      isPlayer: false, isBot: true, team, name: NAMES[(i + (team === 'defend' ? 4 : 0)) % NAMES.length],
      x: sx, z: sz, y: 0, hp: 100, armour: team === 'defend' ? 50 : 0,
      weapon, mag: weapon.mag, reserve: weapon.reserve,
      yaw: team === 'attack' ? 0 : Math.PI, pitch: 0,
      speed: 3.4 + Math.random() * 0.7,
      group: fig.group, hitParts: [],
      route: [], routeIdx: 0, holdT: 0, repathT: 0, burstLeft: 0,
      fireT: 0, reloadT: 0, lastSeen: null, lastSeenT: -99, heardT: -99,
      strafeDir: 1, strafeT: 0, site: Math.random() < 0.5 ? 'A' : 'B',
      defusing: false, planting: false, dead: false, aimErr: 0,
    };
    fig.body.userData.fighter = bot; fig.body.userData.part = 'body';
    fig.head.userData.fighter = bot; fig.head.userData.part = 'head';
    bot.hitParts = [fig.body, fig.head];
    bot.route = planRoute(bot, state);
    bots.push(bot);
  }
  return bots;
}

function planRoute(bot, state) {
  const target = bot.team === 'attack'
    ? SITES[bot.site].center
    : (Math.random() < 0.5 ? SITES[bot.site].center : WAYPOINTS[11]);
  const a = nearestWaypoint(bot.x, bot.z);
  const b = nearestWaypoint(target[0], target[1]);
  const path = findRoute(a, b);
  return path.map((i) => WAYPOINTS[i]);
}

export function updateBot(bot, dt, ctx) {
  const { state, world, player, audio, onKill, onPlant } = ctx;
  if (bot.hp <= 0) { bot.group.visible = false; return; }
  bot.fireT -= dt; bot.reloadT -= dt; bot.holdT -= dt; bot.repathT -= dt;
  const fighters = [player, ...state.bots].filter((f) => f && f.hp > 0);
  const enemies = fighters.filter((f) => f.team !== bot.team);

  // Pick the nearest visible enemy.
  let target = null; let targetD = Infinity;
  for (const e of enemies) {
    const dx = e.x - bot.x, dz = e.z - bot.z;
    const d = Math.hypot(dx, dz);
    if (d > 42) continue;
    const eyeY = e.isPlayer ? 1.45 : 1.5;
    if (hasLineOfSight(world.colliders, bot.x, 1.5, bot.z, e.x, eyeY, e.z)) {
      if (d < targetD) { targetD = d; target = e; }
    }
  }
  if (target) { bot.lastSeen = { x: target.x, z: target.z }; bot.lastSeenT = state.time; }

  // Objective: defenders converge on a planted spike and defuse it.
  const spike = state.spike;
  if (spike.state === 'planted' && bot.team === 'defend' && spike.pos) {
    const d = Math.hypot(spike.pos[0] - bot.x, spike.pos[1] - bot.z);
    if (d < 1.6) {
      bot.defusing = true;
      spike.state = 'defusing';
      spike.progress += dt / 4;
      if (Math.random() < dt * 4) audio.defuseBeep();
      if (spike.progress >= 1) { spike.state = 'defused'; spike.progress = 0; onPlant('defused', bot); }
      return;
    }
    moveAlong(bot, spike.pos[0], spike.pos[1], dt, world);
    faceToward(bot, spike.pos[0], spike.pos[1], dt);
    return;
  }
  bot.defusing = false;

  // Combat: face the enemy, strafe, burst fire with distance-based error.
  if (target) {
    faceToward(bot, target.x, target.z, dt);
    bot.strafeT -= dt;
    if (bot.strafeT <= 0) { bot.strafeDir *= -1; bot.strafeT = 0.7 + Math.random() * 0.9; }
    const moving = targetD > 9;
    const strafe = Math.sin(bot.yaw + Math.PI / 2) * bot.strafeDir * (moving ? 1.6 : 0);
    const fwd = targetD > 14 ? 1.2 : targetD < 6 ? -1.4 : 0;
    moveBot(bot, Math.sin(bot.yaw) * fwd + strafe, Math.cos(bot.yaw) * fwd, dt, world);
    if (bot.reloadT <= 0 && bot.fireT <= 0) {
      if (bot.mag <= 0) { bot.reloadT = bot.weapon.reloadTime; bot.mag = bot.weapon.mag; }
      else {
        bot.burstLeft = bot.burstLeft > 0 ? bot.burstLeft : 3 + Math.floor(Math.random() * 3);
        bot.burstLeft--;
        bot.fireT = bot.weapon.fireInterval * (bot.burstLeft > 0 ? 1 : 4);
        botShoot(bot, target, targetD, ctx);
      }
    }
    return;
  }

  // Chase a recently seen / heard enemy position.
  const chase = bot.lastSeen && state.time - bot.lastSeenT < 6;
  const heard = state.time - bot.heardT < 4 && bot.lastSeen;
  if (chase || heard) {
    const p = bot.lastSeen;
    const d = Math.hypot(p.x - bot.x, p.z - bot.z);
    if (d > 1.5) { moveAlong(bot, p.x, p.z, dt, world); faceToward(bot, p.x, p.z, dt); }
    else { bot.lastSeen = null; bot.route = planRoute(bot, state); bot.routeIdx = 0; }
    return;
  }

  // Route walk: follow waypoints to the assigned site, pausing to hold lanes.
  if (bot.holdT > 0) { faceToward(bot, bot.x + Math.sin(bot.yaw), bot.z + Math.cos(bot.yaw), dt); return; }
  if (bot.routeIdx >= bot.route.length) {
    if (bot.repathT <= 0) {
      bot.site = bot.site === 'A' ? 'B' : 'A';
      bot.route = planRoute(bot, state);
      bot.routeIdx = 0;
      bot.repathT = 2;
    }
    bot.holdT = 1.2 + Math.random() * 1.6;
    return;
  }
  const [wx, wz] = bot.route[bot.routeIdx];
  const d = Math.hypot(wx - bot.x, wz - bot.z);
  if (d < 0.8) {
    bot.routeIdx++;
    if (Math.random() < 0.25) bot.holdT = 1 + Math.random() * 2;
    return;
  }
  moveAlong(bot, wx, wz, dt, world);
  faceToward(bot, wx, wz, dt);
}

function moveAlong(bot, tx, tz, dt, world) {
  const dx = tx - bot.x, dz = tz - bot.z;
  const d = Math.hypot(dx, dz) || 1;
  moveBot(bot, (dx / d) * bot.speed, (dz / d) * bot.speed, dt, world);
}

function moveBot(bot, vx, vz, dt, world) {
  const nx = bot.x + vx * dt;
  const nz = bot.z + vz * dt;
  const r = collide(world.colliders, nx, nz, 0.45, 0, 1.8);
  bot.x = r.x; bot.z = r.z;
  bot.group.position.set(bot.x, Math.sin(performance.now() / 180 + bot.x) * 0.02, bot.z);
  bot.group.rotation.y = bot.yaw;
}

function faceToward(bot, tx, tz, dt) {
  const want = Math.atan2(tx - bot.x, tz - bot.z);
  let diff = want - bot.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  bot.yaw += Math.max(-4.5 * dt, Math.min(4.5 * dt, diff));
}

function botShoot(bot, target, dist, ctx) {
  const { state, world, audio, onKill, scene } = ctx;
  const w = bot.weapon;
  bot.mag--;
  // Error grows with distance and while the target moves; bots miss often up close.
  const err = 0.02 + dist * 0.0016 + (target.isPlayer && target.moving ? 0.02 : 0);
  const ox = bot.x, oy = 1.5, oz = bot.z;
  const ty = target.isPlayer ? 1.35 : 1.3;
  let dx = target.x - ox, dy = ty - oy, dz = target.z - oz;
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len; dy /= len; dz /= len;
  dx += (Math.random() - 0.5) * err * 2;
  dy += (Math.random() - 0.5) * err * 2;
  dz += (Math.random() - 0.5) * err * 2;
  const res = fireHitscan(world, [state.player, ...state.bots], bot, ox, oy, oz, dx, dy, dz, w);
  audio.distantShot();
  if (res && res.kind === 'hit') {
    const killed = applyDamage(res.fighter, res.damage, state, audio, bot);
    if (res.fighter.isPlayer) { audio.hurt(); }
    if (killed && onKill) onKill(res.fighter, bot, res.head ? 'headshot' : 'shot');
  }
  // Muzzle flash: a brief point light at the gun.
  const flash = new THREE.PointLight(0xffc36b, 6, 6);
  flash.position.set(bot.x + Math.sin(bot.yaw) * 0.5, 1.4, bot.z + Math.cos(bot.yaw) * 0.5);
  scene.add(flash);
  setTimeout(() => { scene.remove(flash); }, 50);
}
