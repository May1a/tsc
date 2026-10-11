declare function print(value: unknown): void;

// `let` and `var` object patterns read properties, apply defaults, and stay writable.
const source: any = { p: 1, q: { r: "deep" }, s: undefined };
let { p, q: { r }, s = "default", missing } = source;
print(p); print(r); print(s); print(missing === undefined);
p = { replaced: true };
print(p.replaced);
var { p: renamed } = source;
print(renamed);
renamed = "two";
print(renamed);
function f(o: any) {
  let { k = 3 } = o;
  k++;
  return k;
}
print(f({})); print(f({ k: 10 }));
