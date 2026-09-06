// Generates the mountain path data. Hand-placing the snowline is what put
// snow outside the silhouette last time, so here every snowline vertex is
// derived from the slope it sits on and pushed DOWN from it — it cannot
// leave the rock by construction.
const BASE = 320;

// Each peak is its own outline, left base to right base, with the summit
// flagged. Shoulders sit on different sides and at different heights, and
// two of them carry a second summit, so no two profiles repeat.
const FAR = [
  // Five peaks a range, not eight. The count is half the point: with more
  // than this the two ranges' summits kept landing within a few units of
  // each other and the skyline turned into a thicket. Spacing is uneven
  // and the heights swing hard between neighbours, because evenly spaced
  // peaks of similar height read as one shape repeated whatever their
  // profiles do.
  { name: 'blunt, shoulder left', pts: [[-170, BASE], [-60, 236], [60, 150], [240, BASE]], apex: 2 },
  { name: 'tall twin summit',     pts: [[175, BASE], [330, 104], [374, 162], [402, 136], [530, BASE]], apex: 1, snow: true },
  { name: 'the giant',            pts: [[465, BASE], [585, 200], [700, 76], [806, 208], [940, BASE]], apex: 2, snow: true },
  { name: 'worn, rounded',        pts: [[865, BASE], [955, 190], [1010, 158], [1080, 214], [1190, BASE]], apex: 2 },
  { name: 'tall, shoulder left',  pts: [[1115, BASE], [1235, 214], [1330, 118], [1570, BASE]], apex: 2, snow: true },
];

// Summits sit in the gaps between the far ones rather than under them —
// a near peak directly below a far peak reads as one lumpy mass instead
// of two ranges. Interleaved, the closest any two summits come is 110
// units, against 10 before.
const NEAR = [
  { pts: [[-170, BASE], [190, 234], [300, 280], [400, BASE]], apex: 1 },
  { pts: [[330, BASE], [520, 206], [625, 270], [730, BASE]], apex: 1 },
  // Broad and worn flat. Every summit coming to a point is its own kind
  // of repetition.
  { pts: [[640, BASE], [860, 250], [950, 286], [1050, BASE]], apex: 1 },
  { pts: [[960, BASE], [1085, 256], [1180, 196], [1330, BASE]], apex: 2 },
  { pts: [[1265, BASE], [1440, 220], [1530, 272], [1640, BASE]], apex: 1 },
];

const p = (pt) => `${Math.round(pt[0])} ${Math.round(pt[1])}`;
const outline = (m) => `M${m.pts.map(p).join(' L')} Z`;

// Shadowed half: summit, everything down the right side, then straight
// back up the spur below the summit.
const shade = (m) => {
  const apex = m.pts[m.apex];
  const right = m.pts.slice(m.apex);
  return `M${[apex, ...right.slice(1), [apex[0], BASE]].map(p).join(' L')} Z`;
};

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// Snow: down one slope to the snowline, a ragged line across the face,
// then up the other. Every ragged vertex starts on a slope and is offset
// downward, so it always lands inside the rock.
// How far down each slope the snow reaches, as a drop in height rather
// than a fraction of the slope: neighbouring points sit at wildly
// different distances, so a fraction put the snowline halfway down one
// side and just under the summit on the other. A real snowline is level.
const DROP = 62;
const toDrop = (apex, next) => {
  const dy = next[1] - apex[1];
  return Math.max(0.16, Math.min(0.9, dy > 0 ? DROP / dy : 0.9));
};

const snow = (m, { teeth = 4, depth = 26 } = {}) => {
  const apex = m.pts[m.apex];
  const lNext = m.pts[m.apex - 1];
  const rNext = m.pts[m.apex + 1];
  const fLeft = toDrop(apex, lNext);
  const fRight = toDrop(apex, rNext);
  // Nudged a unit down the slope before rounding: these two land exactly
  // ON the outline, where rounding to integers can tip them just outside
  // it — which is the whole failure this generator exists to prevent.
  const lEnd = lerp(apex, lNext, fLeft);
  const rEnd = lerp(apex, rNext, fRight);
  lEnd[1] += 1;
  rEnd[1] += 1;

  const pts = [apex, rEnd];
  // Right half of the snowline, walking back up towards the summit…
  for (let i = 1; i <= teeth; i++) {
    const t = fRight * (1 - i / (teeth + 1));
    const on = lerp(apex, rNext, t);
    pts.push([on[0], on[1] + (i % 2 ? depth : depth * 0.3)]);
  }
  // …then down the left half, away from it.
  for (let i = teeth; i >= 1; i--) {
    const t = fLeft * (1 - i / (teeth + 1));
    const on = lerp(apex, lNext, t);
    pts.push([on[0], on[1] + (i % 2 ? depth * 0.35 : depth)]);
  }
  pts.push(lEnd);
  return `M${pts.map(p).join(' L')} Z`;
};

// The snow's own shadow side: summit down to the snowline on the right,
// back along the ragged line, then up the spur.
const snowShade = (m, opts = {}) => {
  const { teeth = 4, depth = 26 } = opts;
  const apex = m.pts[m.apex];
  const rNext = m.pts[m.apex + 1];
  const fRight = toDrop(apex, rNext);
  const pts = [apex, lerp(apex, rNext, fRight)];
  for (let i = 1; i <= teeth; i++) {
    const t = fRight * (1 - i / (teeth + 1));
    const on = lerp(apex, rNext, t);
    pts.push([on[0], on[1] + (i % 2 ? depth : depth * 0.3)]);
  }
  pts.push([apex[0], apex[1] + depth * 0.7]);
  return `M${pts.map(p).join(' L')} Z`;
};

const snowy = FAR.filter((m) => m.snow);
console.log('FAR      ', FAR.map(outline).join(' '));
console.log();
console.log('FAR SHADE', FAR.map(shade).join(' '));
console.log();
console.log('SNOW     ', snowy.map((m) => snow(m)).join(' '));
console.log();
console.log('SNOW SHD ', snowy.map((m) => snowShade(m)).join(' '));
console.log();
console.log('NEAR     ', NEAR.map(outline).join(' '));
console.log();
console.log('NEAR SHD ', NEAR.map(shade).join(' '));

// --- sanity check: no snow vertex may sit above the rock it lies on ---
const yOnOutline = (m, x) => {
  let best = null;
  for (let i = 0; i < m.pts.length - 1; i++) {
    const [a, b] = [m.pts[i], m.pts[i + 1]];
    const [lo, hi] = a[0] <= b[0] ? [a, b] : [b, a];
    if (x < lo[0] - 0.01 || x > hi[0] + 0.01) continue;
    const t = hi[0] === lo[0] ? 0 : (x - lo[0]) / (hi[0] - lo[0]);
    const y = lo[1] + (hi[1] - lo[1]) * t;
    if (best === null || y < best) best = y; // topmost surface at this x
  }
  return best;
};
let bad = 0;
for (const m of snowy) {
  const d = snow(m);
  const nums = d.match(/-?\d+/g).map(Number);
  for (let i = 0; i < nums.length; i += 2) {
    const [x, y] = [nums[i], nums[i + 1]];
    const surface = yOnOutline(m, x);
    if (surface !== null && y < surface) {
      console.log(`  !! snow above rock on "${m.name}" at x=${x}: y=${y} vs surface ${surface.toFixed(1)}`);
      bad++;
    }
  }
}
console.log(`\nsnow vertices outside the silhouette: ${bad}`);
// Non-zero on failure, so a bad set can't quietly be pasted into the
// markup — snow escaping the rock is exactly the bug this replaced.
if (bad) process.exit(1);
