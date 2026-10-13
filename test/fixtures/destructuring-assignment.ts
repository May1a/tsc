declare function print(value: unknown): void;

// Array and object assignment patterns, and loop heads that assign an existing variable or pattern.
let a: any = 0, b: any = 0;
[a, b] = [1, 2];
print(a); print(b);
[a, b] = [b, a];
print(a); print(b);
({ a, b } = { a: 3, b: 4 });
print(a); print(b);
let c: any, d: any, rest: any;
[c = 10, [d], ...rest] = [undefined, ["nested"], 7, 8];
print(c); print(d); print(rest.length);
({ x: c = "dflt", y: d } = { y: "why" } as any);
print(c); print(d);
let old: any = "old";
[old = old] = [];
print(old);
let item: any;
const seen: any[] = [];
for (item of ["p", "q"]) {
  seen.push(item);
}
print(seen.join(","));
print(item);
let k: any, v: any;
for ([k, v] of [["one", 1], ["two", 2]]) {
  print(k + "=" + v);
}
try {
  let z: any;
  [z] = 5 as any;
} catch (error: any) {
  print(error.name);
}
