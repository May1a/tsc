declare function print(value: unknown): void;

const arr: unknown[] = [1, 2];

function double(value: unknown): unknown {
  return Number(value) * 2;
}

const mapped = arr.map(double, { factor: 2 });
print(mapped.length);
print(mapped[0]);
print(mapped[1]);
