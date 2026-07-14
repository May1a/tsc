declare function print(value: unknown): void;

function identity(value: number): number {
  return value;
}

const fn = identity;
print(fn === fn);
print(typeof fn);
