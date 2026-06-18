declare function print(value: unknown): void;

const u: unknown = undefined;
print(typeof u);

const b: unknown = true;
print(typeof b);

const n: unknown = 42;
print(typeof n);

const s: unknown = "text";
print(typeof s);

function f(): number {
  return 1;
}
print(typeof f);

const nul: unknown = null;
print(typeof nul);
