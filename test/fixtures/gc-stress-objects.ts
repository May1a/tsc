// Phase C stress fixture: a function that allocates a new Holder and reads
// its single number field, called 25_000 times in a loop. Each call goes
// through objectNew -> gcAlloc(GC_TAG_OBJECT) -> valueBoxObject plus the
// constructor's objectSet. 25_000 cells × ~64 bytes per object cell ≈ 1.5
// MiB, well past the GC's 1 MiB initial collection threshold, so at least
// one gcCollect cycle runs during the loop. The lowering slice does not
// support top-level `let` bindings of class types, so the allocation
// happens inside `tick` and `loop` reads the result back as a primitive
// number.
declare function print(value: unknown): void;

class Holder {
  n: number;
  constructor(n: number) {
    this.n = n;
  }
}

function tick(n: number): number {
  return new Holder(n).n;
}

function loop(n: number): number {
  let last = 0;
  for (let i = 0; i < n; i = i + 1) {
    last = tick(i);
  }
  return last;
}

print(loop(25000));