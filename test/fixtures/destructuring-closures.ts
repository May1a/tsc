declare function print(value: unknown): void;

// A destructured `let` is fresh in every iteration; a destructured `var` is one binding.
const fs: any[] = [];
for (const item of [[1], [2], [3]]) {
  let [v] = item;
  fs.push(() => v);
}
for (const f of fs) print(f());
const gs: any[] = [];
for (const item of [[1], [2], [3]]) {
  var [w] = item;
  gs.push(() => w);
}
for (const g of gs) print(g());
let counter = 0;
let [c] = [0];
const inc = () => { c += 1; counter += 1; };
inc(); inc();
print(c); print(counter);
