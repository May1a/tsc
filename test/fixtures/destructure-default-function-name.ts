declare function print(value: unknown): void;

const [arrow = () => {}] = [];
const [fn = function () {}] = [];
const [xFn = function x() {}] = [];
const { objectArrow = () => {} } = {};

const present = () => {};
let mutable = function () {};
const source: any[] = [present];
const [kept = function fallback() {}] = source;

function evaluatedFallback(): any {
  print("evaluated");
  return 0;
}

const [notTaken = evaluatedFallback()] = source;

print(arrow.name);
print(fn.name);
print(xFn.name);
print(xFn.name !== "xFn");
print(objectArrow.name);
print(mutable.name);
print(kept.name);
print(notTaken.name);
print((arrow as any).missing);
