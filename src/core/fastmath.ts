// ── v3 perf ── Math.hypot is a variadic builtin: about 12x slower than sqrt(a*a + b*b) in V8 (measured, 2M calls: 35 ms vs 3 ms) and
// it churns the heap when it is not inlined. The per-frame distance checks (terrain height, culling, triggers, physics) use this.
export function hyp(a: number, b: number): number {
  return Math.sqrt(a * a + b * b);
}
