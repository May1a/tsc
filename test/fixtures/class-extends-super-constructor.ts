declare function print(value: unknown): void;

class C {
  x: number;

  constructor(x: number) {
    this.x = x;
  }
}

class D extends C {
  constructor(x: number) {
    super(x);
  }
}

print(new D(9).x);
