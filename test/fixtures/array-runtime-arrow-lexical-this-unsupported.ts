declare function print(value: unknown): void;

class Multiplier {
  factor = 3;

  run(): unknown {
    const values: unknown[] = [2];
    const mapped = values.map((value) => Number(value) * this.factor, { factor: 9 });
    return mapped[0];
  }
}

print(new Multiplier().run());
