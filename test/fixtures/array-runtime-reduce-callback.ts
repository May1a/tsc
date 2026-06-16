declare function print(value: unknown): void;

const arr: unknown[] = [1, 2, 3];

function sum(accumulator: unknown, value: unknown): unknown {
  return Number(accumulator) + Number(value);
}

const total = arr.reduce(sum, 10);
print(total);
