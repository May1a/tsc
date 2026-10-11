declare function print(value: unknown): void;

// Class constructors, methods, static methods and accessors take defaults and destructuring patterns.
let outer = 100;
class Point {
  x: number;
  y: number;
  readonly label: string;
  constructor(x: number = 1, y: number = x + 1, label: string = "pt") {
    this.x = x;
    this.y = y;
    this.label = label;
  }
  scale(factor: number = 2, { dx = 0 }: any = {}) {
    print(dx);
    return this.x * factor;
  }
  describe([first, second = "b"]: any[] = ["a"]) {
    print(first);
    print(second);
    return this.label;
  }
  offset(amount: number = this.x * 10) {
    return amount;
  }
  withOuter(v: number = outer) {
    return v;
  }
  static make(x: number = 5) {
    return x;
  }
  set value(v: any) {
    this.x = v;
  }
}
const p = new Point();
print(p.x); print(p.y); print(p.label);
print(p.scale());
print(p.scale(3, { dx: 1 }));
print(p.describe());
print(p.describe(["c", "d"]));
print(p.offset());
print(p.offset(7));
outer = 200;
print(p.withOuter());
print(Point.make());
const r = new Point(4);
print(r.y);
class Base {
  n: number;
  constructor(n: number = 9) {
    this.n = n;
  }
}
class Derived extends Base {}
print(new Derived().n);
print(new Derived(3).n);
