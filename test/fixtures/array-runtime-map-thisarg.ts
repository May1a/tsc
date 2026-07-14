declare function print(value: unknown): void;

const arr: unknown[] = [1, 2];

const result = arr.map(function (this: { factor: number }, value) {
  return Number(value) * Number(this.factor);
}, { factor: 3 });
print(result.length);
print(result[0]);
print(result[1]);
