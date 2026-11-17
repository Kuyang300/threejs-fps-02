# Sandline Protocol — a three.js tactical FPS

A round-based tactical first-person shooter in the style Counter-Strike made
famous, built on three.js 0.187.0 from static files — no build step, no
network. You are the spike carrier for the attacking team in Kestrel Yard,
a desert industrial yard with two objective sites: **Foundry (Site A)** and
**Depot (Site B)**, joined by a mid lane and two side corridors.

## How to play

```sh
node serve.ts        # serves game/ on http://localhost:8080
```

Open http://localhost:8080 in desktop Chrome and click **Click to play**.

| Key | Action |
| --- | ------ |
| W A S D | Move |
| Mouse | Look (pointer lock) |
| Click | Fire |
| R | Reload |
| 1–4 | Switch weapon (pistol / SMG / rifle / sniper) |
| G | Throw frag grenade |
| E (hold) | Plant the spike inside a site ring |
| Shift | Sprint · Ctrl | Crouch · Space | Jump |
| B | Buy menu (during the buy phase) |

## The game

- **Rounds:** first team to 5 rounds wins the match (max 9). A round lasts
  100 seconds, preceded by a 14-second buy phase.
- **Objective:** plant the spike at Foundry or Depot (hold E inside the
  ring for 3 s). It detonates 25 s later unless a defender defuses it
  (4 s channel). Or win by eliminating the other team; if the timer runs
  out with no detonation, the defenders hold the round.
- **Economy:** start with $800; earn $300 per kill, $300 for planting,
  $325 for a round win, $200 for a loss. Spend it on a rifle ($2,700),
  SMG ($1,500), sniper ($4,750), Kevlar armour ($650) or frag grenades
  ($300).
- **Gunplay:** hitscan with headshot multipliers, recoil, and spread that
  grows while moving — stopping to aim pays. Armour absorbs half of
  incoming damage.
- **Bots:** 4 defenders hold the sites and 2 allies push with you. Bots
  walk waypoint routes through the map, hold lanes, react to gunfire,
  chase last-seen positions, converge on a planted spike to defuse it,
  and strafe while burst-firing.
- **Sound:** all effects (shots, hits, reloads, plant beeps, explosions,
  round stingers) are synthesised with WebAudio — no audio files.

## Layout

- `game/index.html` — page, HUD, buy menu, import map for three.js
- `game/src/main.js` — bootstrap, fixed-step loop, round state machine
- `game/src/state.js` — constants, weapons, match state
- `game/src/world.js` — the Kestrel Yard map, colliders, waypoint graph
- `game/src/player.js` — first-person movement, weapons, plant channel
- `game/src/bots.js` — bot figures and AI (routes, combat, defuse)
- `game/src/combat.js` — hitscan shooting, damage, grenades, tracers
- `game/src/hud.js` — HUD, kill feed, banners, buy menu
- `game/src/audio.js` — synthesised WebAudio sounds
- `main.ts` — hands the game in (copies game/ + screenshots/, writes dossier.json)
- `serve.ts` — tiny static server for local play

Screenshots: open `game/?shot=start|play|end&seed=1` for a staged shot; add
`&download=1` and click the "Download screenshot PNG" button (top right) to
save that shot as a PNG file (the 3D canvas only).

MIT licensed. All map, art, sounds and names are original.
