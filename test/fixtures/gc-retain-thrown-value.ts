declare function print(value: unknown): void;

class Box {
  value: number;

  constructor(value: number) {
    this.value = value;
  }
}

function fail(): void {
  throw new Box(7);
}

try {
  fail();
} catch (error: any) {
  for (let index = 0; index < 25000; index = index + 1) {
    const temporary = new Box(index);
    if (temporary.value < 0) {
      print(temporary.value);
    }
  }
  print(error.value);
}
