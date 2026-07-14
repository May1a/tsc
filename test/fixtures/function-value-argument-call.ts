declare function print(value: unknown): void;

function apply(fn: any, value: number): number {
  return fn(value);
}

function increment(value: number): number {
  return value + 1;
}

print(apply(increment, 4));
