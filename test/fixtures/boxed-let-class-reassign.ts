declare function print(value: unknown): void;

class P {
  x: number;
  constructor(x: number) {
    this.x = x;
  }
  get(): number {
    return this.x;
  }
}

let p = new P(1);
p = new P(2);
print(p.get());
