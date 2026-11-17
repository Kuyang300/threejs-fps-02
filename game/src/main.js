// main.js — bootstrap and the round state machine. Simulation runs on a
// fixed 1/60 s step kept apart from rendering; the renderer only draws.
// Flow: menu → buy phase (14 s, shop open) → live round (100 s) → round end
// (4 s) → next buy phase, until one team reaches 5 rounds or 9 rounds pass.
// Rounds are won by eliminating the other team, by detonating the planted
// spike, by defusing it, or by the defenders surviving the timer.
// ?shot=start|play|end puts the game in a deterministic screenshot state.
import * as THREE from 'three';
import {
  freshState, ROUND_TIME, BUY_TIME, WIN_ROUNDS, MAX_ROUNDS,
  ROUND_WIN_REWARD, ROUND_LOSS_REWARD, WEAPONS,
} from './state.js';
import { createWorld } from './world.js';
import { createPlayer, resetPlayer, updatePlayer, equipWeapon, buyItem, reload, throwGrenade } from './player.js';
import { spawnBots, updateBot } from './bots.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { stepGrenade } from './combat.js';

const params = new URLSearchParams(location.search);
const shotMode = params.get('shot');
const downloadShot = params.get('download') === '1'; // ?download=1 saves the staged shot as a PNG file
const seed = Number(params.get('seed') || 1);
let seedState = seed * 2654435761 >>> 0;
Math.random = () => { seedState = (seedState * 1664525 + 1013904223) >>> 0; return seedState / 4294967296; };

const state = freshState();
state.shotMode = shotMode;
state.seed = seed;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.08, 220);
const world = createWorld(scene);
const audio = createAudio();
const player = createPlayer(scene, camera, world, state);
state.player = player;
const hud = createHud(state, { onBuy: (id) => buyItem(player, state, id, audio) });

let botCtx = null;

function clearBots() {
  for (const b of state.bots) scene.remove(b.group);
  state.bots = [];
}

function startRound() {
  clearBots();
  resetPlayer(player, state);
  state.grenades = [];
  state.spike = { state: 'carried', site: null, progress: 0, fuse: 0, pos: null };
  state.phase = 'buy';
  state.phaseT = 0;
  state.timer = BUY_TIME;
  // 2 ally bots push with the player; 4 defenders hold the sites.
  const allies = spawnBots(scene, world, state, 2, 'attack', 'rifle');
  const enemies = spawnBots(scene, world, state, 4, 'defend', 'rifle');
  state.bots = [...allies, ...enemies];
  botCtx = { state, world, player, audio, scene, onKill, onPlant };
  hud.hideBanner();
  hud.renderBuy();
  hud.showOverlay(
    `SANDLINE PROTOCOL — Round ${state.round}`,
    'Buy phase. Spend your money, then the round starts. Plant the spike at Foundry (A) or Depot (B), or eliminate all four defenders.',
    'Click to play',
  );
}

function beginLive() {
  state.phase = 'live';
  state.phaseT = 0;
  state.timer = ROUND_TIME;
  hud.hideOverlay();
  hud.hideBanner();
  hud.banner(`ROUND ${state.round} — GO`, 'Plant the spike or eliminate the defenders', 2200);
  document.body.requestPointerLock?.();
}

function endRound(winner, reason) {
  if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
  state.phase = 'roundEnd';
  state.phaseT = 0;
  state.winner = winner;
  const won = winner === 'attack';
  if (won) { state.money += ROUND_WIN_REWARD; state.score.attack++; audio.roundWin(); }
  else { state.money += ROUND_LOSS_REWARD; state.score.defend++; audio.roundLose(); }
  hud.banner(won ? 'ROUND WON' : 'ROUND LOST', reason, 0);
  hud.feed(`${won ? 'Attackers take' : 'Defenders hold'} round ${state.round} — ${reason}`, won);
  document.exitPointerLock?.();
}

function endMatch() {
  state.phase = 'matchEnd';
  const a = state.score.attack, d = state.score.defend;
  state.matchWinner = a > d ? 'attack' : d > a ? 'defend' : 'draw';
  const title = state.matchWinner === 'attack' ? 'MATCH WON — SANDLINE IS YOURS'
    : state.matchWinner === 'defend' ? 'MATCH LOST' : 'MATCH DRAWN';
  hud.showOverlay(title, `Final score — Attackers ${a} : ${d} Defenders. Kills ${state.stats.kills} · Plants ${state.stats.plants} · Accuracy ${accuracy()}%.`, 'Play again');
}

function accuracy() {
  const s = state.stats;
  return s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
}

function onKill(victim, killer, how) {
  const kn = killer.isPlayer ? 'You' : killer.name;
  const vn = victim.isPlayer ? 'You' : victim.name;
  hud.feed(`${kn} ${how === 'headshot' ? '☠' : '▸'} ${vn}${how === 'headshot' ? ' (headshot)' : ''}`, killer.isPlayer);
  if (victim.isPlayer) { state.stats.deaths++; }
}

function onPlant(kind, who) {
  if (kind === 'planted') {
    hud.banner('SPIKE PLANTED', `Detonation in 25 s — defend Site ${state.spike.site}`, 3000);
    hud.feed(`You planted the spike at Site ${state.spike.site}`, true);
    audio.plantBeep();
  } else if (kind === 'defused') {
    endRound('defend', 'Spike defused by the defenders');
  }
}

function checkRoundEnd() {
  if (state.phase !== 'live') return;
  const aliveEnemies = state.bots.filter((b) => b.team === 'defend' && b.hp > 0);
  const aliveAllies = state.bots.filter((b) => b.team === 'attack' && b.hp > 0);
  if (aliveEnemies.length === 0) endRound('attack', 'All defenders eliminated');
  else if (player.hp <= 0 && aliveAllies.length === 0) endRound('defend', 'Attackers eliminated');
  else if (state.timer <= 0) endRound('defend', 'Time expired — spike never detonated');
}

// Fixed-step simulation.
const STEP = 1 / 60;
let acc = 0;
let last = performance.now();
let shotFrames = 0;
let downloadedShot = false;

function simStep(dt) {
  state.time += dt;
  if (state.phase === 'buy') {
    state.phaseT += dt;
    state.timer = Math.max(0, BUY_TIME - state.phaseT);
    if (state.phaseT >= BUY_TIME) beginLive();
  } else if (state.phase === 'live') {
    state.phaseT += dt;
    state.timer = Math.max(0, ROUND_TIME - state.phaseT);
    const sp = state.spike;
    if (sp.state === 'planted') {
      sp.fuse -= dt;
      if (sp.fuse <= 0) { sp.state = 'detonated'; endRound('attack', 'Spike detonated'); }
    }
    if (sp.state === 'defusing' && !state.bots.some((b) => b.defusing && b.hp > 0)) {
      sp.state = 'planted'; sp.progress = 0; // defuser died or walked off
    }
    if (state.phase === 'live') {
      updatePlayer(player, dt, { state, world, camera, audio, scene, onKill, onPlant, onHitmarker: (h) => hud.showHitmarker(h), planting: false });
      for (const b of state.bots) updateBot(b, dt, botCtx);
      for (let i = state.grenades.length - 1; i >= 0; i--) {
        if (stepGrenade(state.grenades[i], dt, world.colliders, [player, ...state.bots], state, audio, onKill)) {
          scene.remove(state.grenades[i].mesh);
          scene.remove(state.grenades[i].light);
          state.grenades.splice(i, 1);
        }
      }
      checkRoundEnd();
    }
  } else if (state.phase === 'roundEnd') {
    state.phaseT += dt;
    if (state.phaseT >= 4) {
      if (state.score.attack >= WIN_ROUNDS || state.score.defend >= WIN_ROUNDS || state.round >= MAX_ROUNDS) endMatch();
      else { state.round++; startRound(); }
    }
  }
  // Site ring pulse.
  for (const key of ['A', 'B']) {
    const m = world.siteMeshes[key];
    const active = state.spike.state === 'planted' && state.spike.site === key;
    m.ring.material.opacity = active ? 0.6 + 0.4 * Math.sin(state.time * 6) : 0.85;
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  if (!shotMode) { // screenshot modes freeze the staged state exactly
    acc += dt;
    while (acc >= STEP) { simStep(STEP); acc -= STEP; }
  } else { acc = 0; }
  hud.update(dt);
  renderer.render(scene, camera);
  // Screenshot download: after a few frames so shadows have settled, prepare
  // the staged shot as a PNG on a visible download link (real <a download>,
  // so the browser can save it from a click — auto-downloads without a user
  // gesture are blocked). The link holds only the 3D canvas (no DOM HUD).
  if (shotMode && downloadShot && !downloadedShot) {
    if (!window.__shotLink) {
      const names = { start: '1-start.png', play: '2-play.png', end: '3-end.png' };
      const a = document.createElement('a');
      a.id = 'shot-download';
      a.textContent = '⬇ Download screenshot PNG';
      a.href = '#';
      a.download = names[shotMode] || `${shotMode}.png`;
      a.style.cssText = 'position:fixed;top:12px;right:12px;z-index:99999;padding:10px 14px;font:600 14px system-ui,sans-serif;background:#f59e0b;color:#111;border:0;border-radius:8px;cursor:pointer;text-decoration:none;';
      document.body.appendChild(a);
      window.__shotLink = a;
    }
    if (++shotFrames >= 5) {
      downloadedShot = true;
      renderer.domElement.toBlob((blob) => {
        if (!blob) return;
        window.__shotLink.href = URL.createObjectURL(blob);
      }, 'image/png');
    }
  }
}

// Input.
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  player.keys[e.code] = true;
  if (e.code === 'KeyR') reload(player, audio);
  if (e.code === 'KeyG') throwGrenade(player, 0, { state, scene, camera, audio });
  if (e.code === 'KeyB' && state.phase === 'buy') hud.renderBuy();
  if (e.code === 'Digit1') equipWeapon(player, 'pistol', true);
  if (e.code === 'Digit2' && WEAPONS.smg && playerHas('smg')) equipWeapon(player, 'smg', true);
  if (e.code === 'Digit3' && playerHas('rifle')) equipWeapon(player, 'rifle', true);
  if (e.code === 'Digit4' && playerHas('sniper')) equipWeapon(player, 'sniper', true);
  if (e.code === 'Enter' && state.phase === 'matchEnd') { state.round = 1; state.score = { attack: 0, defend: 0 }; state.money = 800; startRound(); }
});
addEventListener('keyup', (e) => { player.keys[e.code] = false; });
addEventListener('mousedown', (e) => {
  if (e.button === 0 && document.pointerLockElement) { player.mouseDown = true; audio.unlock(); }
});
addEventListener('mouseup', (e) => { if (e.button === 0) player.mouseDown = false; });
addEventListener('mousemove', (e) => {
  if (!document.pointerLockElement) return;
  player.yaw -= e.movementX * 0.0021;
  player.pitch -= e.movementY * 0.0021;
  player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch));
});
document.getElementById('play').addEventListener('click', () => {
  audio.unlock();
  if (state.phase === 'menu') { state.round = 1; state.score = { attack: 0, defend: 0 }; state.money = 800; startRound(); }
  else if (state.phase === 'matchEnd') { state.round = 1; state.score = { attack: 0, defend: 0 }; state.money = 800; startRound(); }
  else if (state.phase === 'buy') { beginLive(); }
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Owned weapons are tracked by the buy menu: a weapon counts as owned once
// bought this match. (Pistol is always owned.)
const owned = new Set(['pistol']);
function playerHas(id) { return owned.has(id) || player.weaponId === id; }
// Record ownership when a buy button is clicked.
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-buy]');
  if (b && WEAPONS[b.dataset.buy]) owned.add(b.dataset.buy);
});

// ---- Screenshot modes: deterministic states, no pointer lock needed. ----
function applyShotMode() {
  if (!shotMode) return;
  if (shotMode === 'start') {
    state.phase = 'menu';
    hud.showOverlay(
      'SANDLINE PROTOCOL',
      'A round-based tactical FPS. Two teams, short rounds, money between rounds. Plant the spike at Foundry (A) or Depot (B) — or eliminate all four defenders. First to 5 rounds takes the match.',
      'Click to play',
    );
    player.x = 0; player.z = -14; player.yaw = 0; player.pitch = -0.02;
    camera.position.set(0, 1.62, -14);
    camera.rotation.set(-0.02, 0, 0, 'YXZ');
  } else if (shotMode === 'play') {
    startRound();
    beginLive();
    // Stage the shot: player mid-lane, two defenders in the sightline.
    player.x = 0; player.z = -6; player.yaw = 0.15; player.pitch = 0;
    camera.position.set(0, 1.62, -6);
    camera.rotation.set(0, 0.15, 0, 'YXZ');
    const defs = state.bots.filter((b) => b.team === 'defend');
    if (defs[0]) { defs[0].x = -2; defs[0].z = 4; defs[0].group.position.set(-2, 0, 4); defs[0].yaw = Math.PI; }
    if (defs[1]) { defs[1].x = 3; defs[1].z = 7; defs[1].group.position.set(3, 0, 7); defs[1].yaw = Math.PI; }
    const allies = state.bots.filter((b) => b.team === 'attack');
    if (allies[0]) { allies[0].x = -3; allies[0].z = -9; allies[0].group.position.set(-3, 0, -9); }
    hud.feed('You ▸ Vex', true);
    hud.feed('Mara ▸ Rook', false);
    hud.hideBanner();
    // Fire one tracer so the frame reads as mid-combat.
    player.mouseDown = false;
  } else if (shotMode === 'end') {
    startRound();
    beginLive();
    state.score.attack = 3; state.score.defend = 2;
    state.spike = { state: 'planted', site: 'A', progress: 0, fuse: 18, pos: [-13, 8] };
    hud.banner('SPIKE PLANTED', 'Detonation in 18 s — defend Site A (Foundry)', 0);
    player.x = -8; player.z = 2; player.yaw = -0.9; player.pitch = 0.02;
    camera.position.set(-8, 1.62, 2);
    camera.rotation.set(0.02, -0.9, 0, 'YXZ');
  }
}

// Boot.
if (shotMode) {
  applyShotMode();
  // In shot modes the fixed-step loop would advance the round; freeze the
  // simulation clock so the screenshot state stays exactly as staged.
  if (shotMode === 'play' || shotMode === 'end') state.phase = 'live';
  if (shotMode === 'start') state.phase = 'menu';
} else {
  hud.showOverlay(
    'SANDLINE PROTOCOL',
    'A round-based tactical FPS. Two teams, short rounds, money between rounds. Plant the spike at Foundry (A) or Depot (B) — or eliminate all four defenders. First to 5 rounds takes the match.',
    'Click to play',
  );
  player.x = 0; player.z = -14;
  camera.position.set(0, 1.62, -14);
}
requestAnimationFrame(frame);
