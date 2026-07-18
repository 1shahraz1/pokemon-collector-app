// A simple points-based rank so the profile screen has something to work
// toward, not just a raw number. Purely cosmetic -- doesn't affect points,
// entries, or anything server-side.
const TIERS = [
  { label: "Rookie", min: 0 },
  { label: "Trainer", min: 100 },
  { label: "Ace", min: 500 },
  { label: "Champion", min: 1500 },
  { label: "Legend", min: 4000 },
];

export function getRank(points = 0) {
  let current = TIERS[0];
  let next = TIERS[1];

  for (let i = 0; i < TIERS.length; i++) {
    if (points >= TIERS[i].min) {
      current = TIERS[i];
      next = TIERS[i + 1] || null;
    }
  }

  const progress = next
    ? Math.min(100, Math.round(((points - current.min) / (next.min - current.min)) * 100))
    : 100;

  return { label: current.label, next: next?.label || null, pointsToNext: next ? next.min - points : 0, progress };
}
