declare function print(value: unknown): void;

// Compiled once and held across the whole loop: the pattern object and its
// match result must survive every collection cycle until unreachable.
const keep = /(\w+)-(\d+)/;
const keepMatch = keep.exec("word-42");

// Many compiled patterns and match results: each iteration compiles a fresh
// pattern and produces a fresh match array, all transient garbage that forces
// repeated collection cycles under a constrained heap.
let hits = 0;
for (let index = 0; index < 20000; index = index + 1) {
  const pattern = /(\w+)-(\d+)/;
  const match = pattern.exec("word-42");
  if (match !== null && match[2] === "42") {
    hits = hits + 1;
  }
}
print(hits);
print(keep.test("word-42"));
print(keepMatch ? keepMatch[0] : "miss");
print(keepMatch ? keepMatch[1] : "miss");
print(keepMatch ? keepMatch[2] : "miss");
