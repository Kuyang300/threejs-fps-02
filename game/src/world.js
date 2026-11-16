// world.js — the map. "Kestrel Yard": a desert industrial yard with two
// objective sites (Foundry = Site A, west; Depot = Site B, east), a mid lane,
// side corridors and crate cover. All geometry is three.js boxes/cylinders
// in one chosen palette (sun-baked sand, rust orange, teal steel, dark slate).
// Every solid box is both a visible mesh and an AABB collider; bullets stop
// on the same meshes, so what you see is what blocks you.
import * as THREE from 'three';

export const PALETTE = {
  sand: 0xc9a06a, sandDark: 0x8a6b42, rust: 0xb4552d, teal: 0x2e6f6a,
  slate: 0x3a4148, dark: 0x23272c, concrete: 0x9a938a, yellow: 0xe8b93c,
  accentA: 0xff7a3c, accentB: 0x37c8e8, hazard: 0xd8a020,
};

// Waypoint graph: nodes the bots walk. Edges are pairs of node indices.
export const WAYPOINTS = [
  [0, -16], [-6, -12], [6, -12], [0, -8], [-10, -8], [10, -8],
  [-14, -2], [14, -2], [-6, -2], [6, -2], [0, -1], [0, 4],
  [-12, 4], [12, 4], [-16, 8], [16, 8], [-13, 8], [13, 8],
  [-8, 10], [8, 10], [0, 12], [-4, 15], [4, 15], [0, 16],
  [-17, -4], [17, -4], [-17, 12], [17, 12],
];
const EDGES = [
  [0, 1], [0, 2], [1, 3], [2, 3], [1, 4], [2, 5], [3, 8], [3, 9], [3, 10],
  [4, 6], [5, 7], [6, 12], [7, 13], [8, 10], [9, 10], [10, 11], [11, 12],
  [11, 13], [12, 14], [13, 15], [14, 16], [15, 17], [12, 18], [13, 19],
  [18, 20], [19, 20], [20, 21], [20, 22], [21, 23], [22, 23], [4, 24],
  [5, 25], [24, 14], [25, 15], [14, 26], [15, 27], [26, 21], [27, 22],
  [6, 24], [7, 25], [16, 18], [17, 19], [8, 12], [9, 13],
];
export const GRAPH = WAYPOINTS.map(() => []);
for (const [a, b] of EDGES) { GRAPH[a].push(b); GRAPH[b].push(a); }

export function nearestWaypoint(x, z) {
  let best = 0; let bd = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i++) {
    const dx = WAYPOINTS[i][0] - x, dz = WAYPOINTS[i][1] - z;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// Breadth-first route from node a to node b. Returns node indices.
export function findRoute(a, b) {
  if (a === b) return [a];
  const prev = new Array(WAYPOINTS.length).fill(-1);
  const q = [a]; prev[a] = a;
  while (q.length) {
    const n = q.shift();
    for (const m of GRAPH[n]) {
      if (prev[m] === -1) { prev[m] = n; if (m === b) { const path = [b]; let c = b; while (c !== a) { c = prev[c]; path.unshift(c); } return path; } q.push(m); }
    }
  }
  return [a, b];
}

export const SITES = {
  A: { name: 'Foundry', center: [-13, 8], radius: 4.2, color: PALETTE.accentA },
  B: { name: 'Depot', center: [13, 8], radius: 4.2, color: PALETTE.accentB },
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = []; // {minX,maxX,minZ,maxZ,minY,maxY}
  const shootables = []; // meshes bullets stop on
  const mats = {};
  for (const [k, v] of Object.entries(PALETTE)) {
    mats[k] = new THREE.MeshStandardMaterial({ color: v, roughness: k === 'teal' || k === 'rust' ? 0.6 : 0.92, metalness: k === 'teal' ? 0.35 : 0.05 });
  }
  const hazardMat = new THREE.MeshStandardMaterial({ color: PALETTE.hazard, roughness: 0.8 });

  function box(w, h, d, x, y, z, mat, solid = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[mat] || mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    shootables.push(m);
    if (solid) colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: y - h / 2, maxY: y + h / 2 });
    return m;
  }

  // Ground and perimeter (44 x 36 m yard, 5 m walls).
  box(46, 0.4, 38, 0, -0.2, 0, 'sandDark');
  box(0.6, 5, 38, -22.3, 2.5, 0, 'concrete');
  box(0.6, 5, 38, 22.3, 2.5, 0, 'concrete');
  box(46, 5, 0.6, 0, 2.5, -19.3, 'concrete');
  box(46, 5, 0.6, 0, 2.5, 19.3, 'concrete');

  // Site A — Foundry (west): furnace blocks, pipes, a low roof frame.
  box(6, 2.2, 1.2, -17.5, 1.1, 8, 'rust');
  box(3.2, 3.4, 3.2, -18.5, 1.7, 3.5, 'slate');
  box(1.4, 4.6, 1.4, -18.5, 2.3, 12.5, 'dark');
  box(5, 0.5, 5, -13, 3.4, 8, 'teal', false); // roof frame, no collision
  box(0.4, 3.4, 0.4, -15.4, 1.7, 5.6, 'teal');
  box(0.4, 3.4, 0.4, -10.6, 1.7, 5.6, 'teal');
  box(2.2, 1.0, 2.2, -11.5, 0.5, 11, 'sand');
  box(1.6, 0.8, 1.6, -15, 0.4, 5.2, 'sand');

  // Site B — Depot (east): container stack, gantry, pallets.
  box(6, 2.6, 2.6, 18, 1.3, 8, 'teal');
  box(6, 2.6, 2.6, 18, 3.9, 8, 'rust');
  box(4.5, 0.5, 4.5, 13, 3.6, 8, 'yellow', false);
  box(0.4, 3.6, 0.4, 10.8, 1.8, 5.8, 'yellow');
  box(0.4, 3.6, 0.4, 15.2, 1.8, 5.8, 'yellow');
  box(2.4, 1.0, 2.4, 11, 0.5, 11.5, 'sand');
  box(1.8, 0.9, 1.8, 15.5, 0.45, 11, 'sand');

  // Mid lane: central wall with two gaps, crates and a watchtower base.
  box(1.2, 2.6, 7, -4, 1.3, -1, 'concrete');
  box(1.2, 2.6, 7, 4, 1.3, -1, 'concrete');
  box(6.8, 1.0, 1.2, 0, 2.9, -1, 'slate'); // lintel over the mid gap
  box(2, 1.1, 2, -8, 0.55, -4, 'sand');
  box(2, 1.1, 2, 8, 0.55, -4, 'sand');
  box(1.4, 1.4, 1.4, 0, 0.7, 6, 'rust');
  box(3, 0.8, 3, -1.5, 0.4, 12.5, 'concrete');

  // Side corridors: staggered cover on both flanks.
  box(2.2, 1.2, 1.2, -16, 0.6, -4, 'sand');
  box(1.2, 1.2, 2.2, -16, 0.6, 0.5, 'sand');
  box(2.2, 1.2, 1.2, 16, 0.6, -4, 'sand');
  box(1.2, 1.2, 2.2, 16, 0.6, 0.5, 'sand');
  box(2.6, 2.4, 1, -10, 1.2, 4, 'teal');
  box(2.6, 2.4, 1, 10, 1.2, 4, 'teal');
  box(1.6, 0.9, 1.6, -6, 0.45, 12, 'sand');
  box(1.6, 0.9, 1.6, 6, 0.45, 12, 'sand');
  box(2, 1.8, 2, -19, 0.9, -10, 'rust');
  box(2, 1.8, 2, 19, 0.9, -10, 'rust');

  // Site floor markers: glowing rings the player plants inside.
  const siteMeshes = {};
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(s.radius - 0.35, s.radius, 48),
      new THREE.MeshBasicMaterial({ color: s.color, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.center[0], 0.03, s.center[1]);
    group.add(ring);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(s.radius - 0.4, 40),
      new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.10, side: THREE.DoubleSide }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(s.center[0], 0.02, s.center[1]);
    group.add(disc);
    siteMeshes[key] = { ring, disc };
  }

  // Sky: warm dusk gradient via fog + hemisphere, one shadow-casting sun.
  scene.fog = new THREE.Fog(0xd8a86e, 30, 95);
  scene.background = new THREE.Color(0xe0a869);
  const hemi = new THREE.HemisphereLight(0xffe0b3, 0x5a4632, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.4);
  sun.position.set(18, 26, -12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 80;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x7fb8c8, 0.5);
  fill.position.set(-14, 10, 18);
  scene.add(fill);

  // Distant silhouettes outside the walls (non-solid, cheap depth).
  const sil = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1 });
  for (const [x, z, h] of [[-38, -14, 12], [-34, 18, 9], [36, -8, 14], [40, 14, 8], [0, -34, 10], [-20, 34, 9]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(8, h, 8), sil);
    m.position.set(x, h / 2, z);
    scene.add(m);
  }

  return { group, colliders, shootables, siteMeshes, hazardMat };
}

// Circle-vs-AABB collision on the XZ plane. Returns corrected {x, z}.
export function collide(colliders, x, z, radius, y, height) {
  for (const c of colliders) {
    // A box whose top is at or below the actor's feet is floor to stand on,
    // never a wall: without this the ground slab shoves everyone to the edge.
    if (y + height < c.minY || y + 0.05 >= c.maxY) continue;
    const cx = Math.max(c.minX, Math.min(x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - cx, dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * radius;
        z = cz + (dz / d) * radius;
      } else {
        // Inside the box: push out along the smallest penetration axis.
        const pl = x - c.minX, pr = c.maxX - x, pt = z - c.minZ, pb = c.maxZ - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = c.minX - radius; else if (m === pr) x = c.maxX + radius;
        else if (m === pt) z = c.minZ - radius; else z = c.maxZ + radius;
      }
    }
  }
  // Clamp inside the yard.
  x = Math.max(-21.4, Math.min(21.4, x));
  z = Math.max(-18.4, Math.min(18.4, z));
  return { x, z };
}

// Line-of-sight between two points (eye height 1.5): true if no solid AABB
// blocks the segment. Uses slab intersection on the XZ/Y boxes.
export function hasLineOfSight(colliders, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  for (const c of colliders) {
    if (c.maxY < 0.3) continue; // floor slabs never block sight
    let t0 = 0, t1 = 1;
    for (const [o, d, lo, hi] of [[ax, dx, c.minX, c.maxX], [ay, dy, c.minY, c.maxY], [az, dz, c.minZ, c.maxZ]]) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { t0 = 1; t1 = 0; break; } }
      else {
        let a = (lo - o) / d, b = (hi - o) / d;
        if (a > b) { const t = a; a = b; b = t; }
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
        if (t0 > t1) break;
      }
    }
    if (t0 <= t1 && t0 < 1 && t1 > 0) return false;
  }
  return true;
}
