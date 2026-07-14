declare function print(value: unknown): void;

function run(): unknown {
  const values: unknown[] = [2];
  const mapped = values.map(function (this: { factor: number }, value) {
    return Number(value) * Number(this.factor);
  }, { factor: 4 });
  return mapped[0];
}

print(run());
