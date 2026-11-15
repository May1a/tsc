declare function print(value: unknown): void;
let [...rest] = [1, 2];
rest = [3];
print(rest.length);
function capturedRest() {
  var [...items]: any = [4, 5];
  function replace() { items = [6, 7, 8]; }
  replace();
  print(items.length);
  items = null;
  print(items);
}
capturedRest();
let { nested: [...nested] } = { nested: [1, 2] };
nested = [9];
print(nested.length);
const [...fixed] = [10, 11];
for (const value of fixed) print(value);
let [...iterated] = [12];
iterated = [13, 14];
for (const value of iterated) print(value);
