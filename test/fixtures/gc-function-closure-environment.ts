declare function print(value: unknown): void;

class Box {
  v: number;

  constructor(v: number) {
    this.v = v;
  }
}

function retain(value: any) {
  return (): number => Number(value.v);
}

function run(count: number): number {
  const getValue = retain(new Box(7));
  for (let index = 0; index < count; index = index + 1) {
    const temporary = new Box(index);
    if (temporary.v < 0) {
      print(temporary.v);
    }
  }
  return getValue();
}

print(run(25000));
