declare function print(value: unknown): void;

// A `const` holds the value its initializer produced when the declaration ran. A later write to
// a binding the initializer read must not change it, and reading it must not repeat a side effect.
function numbers(): number {
  let n = 1;
  const m = n * 10;
  n = 2;
  return m;
}
print(numbers());

function strings(): string {
  let s = "a";
  const t = s + "!";
  s = "b";
  return t;
}
print(strings());

function booleans(): boolean {
  let b = true;
  const c = !b;
  b = false;
  return c;
}
print(booleans());

function fixedElement(): number {
  const xs = [1, 2];
  const v = xs[0];
  xs[0] = 9;
  return v;
}
print(fixedElement());

function sideEffectOnce(): number {
  let i = 0;
  const a = ++i;
  const b = a + a;
  return b * 10 + i;
}
print(sideEffectOnce());

function loopWrites(): number {
  let n = 1;
  const m = n;
  for (let j = 0; j < 2; j++) {
    n++;
  }
  return m + n * 100;
}
print(loopWrites());

// Module scope: a `const` read through another `const`.
let counter = 1;
const scaled = counter * 10;
counter = 2;
const sum = scaled + counter;
print(sum);
