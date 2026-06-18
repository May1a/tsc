declare function print(value: unknown): void;

const arr: unknown[] = [1, 2];

function double(value: unknown): unknown {
  return Number(value) * 2;
}

print(arr.map(double, { factor: 2 }));
