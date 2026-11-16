// state.js — one place for every shared constant, weapon definition and the
// mutable match state. Rendering never writes here directly; the simulation in
// main.js owns it, and hud.js only reads it.

// Game name: SANDLINE PROTOCOL. An original desert industrial yard: two
// objective sites (Foundry / Depot), a mid lane, and crate cover. No asset,
// name or map from any commercial game is used anywhere in this entry.

export const ROUND_TIME = 100; // seconds of live play per round
export const BUY_TIME = 14; // seconds of buy phase before each round
export const PLANT_TIME = 3; // seconds holding E inside a site to plant
export const DEFUSE_TIME = 4; // seconds holding E on a planted spike to defuse
export const SPIKE_TIMER = 25; // seconds from plant to detonation
export const WIN_ROUNDS = 5; // first team to this many rounds wins the match
export const MAX_ROUNDS = 9;
export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const ROUND_WIN_REWARD = 325;
export const ROUND_LOSS_REWARD = 200;
export const PLANT_REWARD = 300;
export const PLAYER_HP = 100;
export const BOT_COUNT_ENEMY = 4;
export const BOT_COUNT_ALLY = 2;

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', price: 0, damage: 26, headMul: 2.0,
    mag: 12, reserve: 48, fireInterval: 0.16, reloadTime: 1.4,
    spread: 0.011, moveSpread: 0.02, recoil: 0.011, range: 60, auto: false,
  },
  smg: {
    id: 'smg', name: 'Hornet SMG', price: 1500, damage: 19, headMul: 1.8,
    mag: 28, reserve: 112, fireInterval: 0.075, reloadTime: 1.9,
    spread: 0.016, moveSpread: 0.03, recoil: 0.008, range: 45, auto: true,
  },
  rifle: {
    id: 'rifle', name: 'VK-47 Rifle', price: 2700, damage: 34, headMul: 2.2,
    mag: 30, reserve: 90, fireInterval: 0.115, reloadTime: 2.2,
    spread: 0.009, moveSpread: 0.026, recoil: 0.016, range: 80, auto: true,
  },
  sniper: {
    id: 'sniper', name: 'Longbow DMR', price: 4750, damage: 88, headMul: 2.0,
    mag: 5, reserve: 20, fireInterval: 1.05, reloadTime: 3.0,
    spread: 0.0015, moveSpread: 0.06, recoil: 0.05, range: 120, auto: false,
  },
};

export const WEAPON_ORDER = ['pistol', 'smg', 'rifle', 'sniper'];
export const ARMOUR_PRICE = 650;
export const GRENADE_PRICE = 300;

// Spawn points. Attackers (player team) start south, defenders north.
export const SPAWNS = {
  attack: [
    [0, -16], [-3, -17], [3, -17],
  ],
  defend: [
    [-6, 15], [0, 16], [6, 15], [-11, 12], [11, 12],
  ],
};

export function freshState() {
  return {
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    phaseT: 0,
    round: 1,
    score: { attack: 0, defend: 0 },
    money: START_MONEY,
    timer: BUY_TIME,
    spike: {
      state: 'carried', // carried | planting | planted | defusing | detonated | defused
      site: null, // 'A' | 'B'
      progress: 0, // 0..1 channel progress
      fuse: 0, // seconds left once planted
      pos: null,
    },
    player: null, // filled by player.js
    bots: [], // filled by bots.js
    grenades: [],
    killfeed: [],
    banner: null,
    winner: null,
    matchWinner: null,
    stats: { kills: 0, deaths: 0, plants: 0, defuses: 0, shots: 0, hits: 0 },
    seed: 1,
    shotMode: null, // 'start' | 'play' | 'end' for deterministic screenshots
    time: 0,
  };
}
