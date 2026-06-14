declare function print(value: unknown): void;

class Box {
  x: number;

  constructor(x: number) {
    this.x = x;
  }
}

print(new Box(7).x);
