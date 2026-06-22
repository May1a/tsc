// Phase B stress fixture: a function that returns a new boxed string, called
// 70_000 times in a loop. Each call goes through valueBoxString → gcAlloc
// (8-byte header + 16-byte payload = 24 bytes per cell). 70_000 × 24 ≈ 1.6 MiB,
// which crosses the GC's initial 1 MiB collection threshold and forces at
// least one gcCollect cycle during the loop. The fixture ends by printing
// the post-loop binding. The string-returning helper exercises the
// valueBoxString → gcRootPush/gcRootPop bracketing path end-to-end.
declare function print(value: unknown): void;

function dot() {
  return ".";
}

let s = "x";
for (let i = 0; i < 70000; i = i + 1) {
  s = s + dot();
}
print(s);
