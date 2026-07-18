declare function print(value: unknown): void;

function identity(value: number): number {
  return value;
}

const fn = identity;
const first = function (value: number): number { return value; };
const second = function (value: number): number { return value; };
print(fn === fn);
print(identity === identity);
print(first !== second);
print(typeof fn);
