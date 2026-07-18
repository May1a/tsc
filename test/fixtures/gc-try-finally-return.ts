declare function print(value: unknown): void;

function run(): number {
  try {
    const obj: any = { n: 42 };
    return Number(obj.n);
  } finally {
    const waste: any = { x: 1, y: 2, z: 3 };
    print(waste.x);
  }
}

print(run());
