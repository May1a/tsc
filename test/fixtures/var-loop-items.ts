declare function print(value: unknown): void;

// A `var` loop item is one binding that every iteration and closure shares.
const fs: any[] = [];
for (var x of [1, 2, 3]) {
  fs.push(() => x);
}
for (const f of fs) print(f());
const gs: any[] = [];
for (let y of [1, 2, 3]) {
  gs.push(() => y);
}
for (const g of gs) print(g());
const o: { a: string; b: string } = { a: "1", b: "2" };
const hs: any[] = [];
for (var k in o) {
  hs.push(() => k);
}
for (const h of hs) print(h());
const nums = [4, 5];
let sum = 0;
for (var n of nums) {
  sum += n;
}
print(sum);
for (var ch of "hey") {
  print(ch);
}
const pairs: any[] = [[1, "a"], [2, "b"]];
const ps: any[] = [];
for (var [num, letter] of pairs) {
  ps.push(() => letter);
  print(num);
}
for (const p of ps) print(p());
for (var { length } of ["xy", "zzz"]) {
  print(length);
}
function inner() {
  const out: any[] = [];
  for (var item of ["p", "q"]) {
    out.push(() => item);
  }
  return out;
}
for (const f of inner()) print(f());
