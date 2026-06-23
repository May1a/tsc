// Phase C correctness fixture: a single long-lived object (`keep`) is held in a
// local across an allocation loop that crosses the 1 MiB collection threshold
// (25_000 transient Box cells). A gcCollect cycle runs mid-loop; `keep` must
// survive — it is pinned on the function's root frame — and still read back 7.
// If root marking, the object-field walk, or the per-iteration frame restore
// regressed, the surviving read would crash or print garbage instead of 7.
declare function print(value: unknown): void;

class Box {
  v: number;
  constructor(v: number) {
    this.v = v;
  }
}

function run(n: number): number {
  const keep = new Box(7);
  for (let i = 0; i < n; i = i + 1) {
    const tmp = new Box(i);
    // Read tmp.v so the allocation is live (never printed: i >= 0). This also
    // exercises allocation reached inside a conditional, where the old static
    // push/pop counter would have mis-balanced the root stack.
    if (tmp.v < 0) {
      print(tmp.v);
    }
  }
  return keep.v;
}

print(run(25000));
