// Pure functions: no database, no Express. That makes them trivial to unit test.

export function computeStatus(expected, actual) {
  if (actual === null || actual === undefined) return null; // not counted yet
  if (actual === expected) return "GREEN";
  return actual > expected ? "YELLOW" : "RED";
}

// Returns null if the batch may be approved, otherwise the reason it can't.
// Note: it recomputes from raw numbers instead of trusting the stored status column.
export function approvalBlocker(items) {
  if (items.length === 0) return "Order has no components to verify";

  const uncounted = items.filter((i) => i.actual_qty === null);
  if (uncounted.length > 0) {
    return `${uncounted.length} component(s) not counted yet`;
  }

  const short = items.filter((i) => i.actual_qty < i.expected_qty);
  if (short.length > 0) {
    return `Shortage in: ${short.map((i) => i.component_name).join(", ")}`;
  }
  return null;
}

// Fabric Wastage % = ((actual - expected) / expected) * 100, rounded to 2 decimals
export function wastagePct(actualYds, stdYdsPerPiece, qty) {
  const expected = stdYdsPerPiece * qty;
  return Math.round(((actualYds - expected) / expected) * 10000) / 100;
}