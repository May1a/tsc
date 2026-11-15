declare function print(value: unknown): void;
let n = 0;
class Example {
  value: number;
  constructor({ x = ++n }: { x?: number }, y = ++n) {
    print(x);
    print(y);
    this.value = y;
  }
  method({ x }: { x: number }, y = x) {
    return y + this.value;
  }
  static method({ x = ++n }: { x?: number }, y = ++n) {
    print(x);
    print(y);
  }
}
const example = new Example({});
print(example.method({ x: 7 }));
Example.method({});
class DestructuredConstructor {
  constructor({ x }: { x: number }, y = x) { print(y); }
}
new DestructuredConstructor({ x: 11 });
