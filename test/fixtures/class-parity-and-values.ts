declare function print(value: unknown): void;

// 1. Rest parameters on constructors, instance methods, static methods, and derived forwarding.
class Sum {
  total: number;
  constructor(...nums: number[]) {
    let acc = 0;
    for (const n of nums) {
      acc += n;
    }
    this.total = acc;
  }
  add(...more: number[]): number {
    let acc = this.total;
    for (const n of more) {
      acc += n;
    }
    return acc;
  }
  static joinAll(sep: string, ...parts: string[]): string {
    return parts.join(sep);
  }
}
class DerivedSum extends Sum {}
const s = new DerivedSum(1, 2, 3);
print(s.total);
print(s.add(4, 5));
print(Sum.joinAll("-", "a", "b", "c"));

// 2. Computed accessors & static accessors (literal and computed).
const dynKey = "val";
const staticKey = "sval";
class Accessors {
  _v = 10;
  static _s = 100;
  get [dynKey](): number {
    return this._v;
  }
  set [dynKey](n: number) {
    this._v = n * 2;
  }
  static get count(): number {
    return Accessors._s;
  }
  static set count(n: number) {
    Accessors._s = n + 1;
  }
  static get [staticKey](): number {
    return this._s * 3;
  }
}
const acc = new Accessors();
print(acc[dynKey]);
acc[dynKey] = 7;
print(acc[dynKey]);
print(Accessors.count);
Accessors.count = 50;
print(Accessors.count);
print(Accessors[staticKey]);

// 3. Static blocks + static private fields, methods, and accessors.
class Secret {
  static log: string[] = [];
  static #n = 5;
  static {
    Secret.log.push("block1:" + Secret.#n);
    Secret.#bump(3);
  }
  static after = Secret.#n;
  static {
    Secret.log.push("block2:" + Secret.after);
  }
  static #bump(delta: number) {
    this.#n += delta;
  }
  static get #double(): number {
    return this.#n * 2;
  }
  static set #double(v: number) {
    this.#n = v / 2;
  }
  static readSecret(): number {
    return this.#double;
  }
  static writeSecret(v: number) {
    this.#double = v;
  }
}
class SubSecret extends Secret {}
print(Secret.log.join(","));
print(Secret.readSecret());
Secret.writeSecret(20);
print(Secret.readSecret());
try {
  print(SubSecret.readSecret());
} catch (e) {
  print(e instanceof TypeError);
}

// 4. Constructor returning replacement object.
class Wrapper {
  constructor(x: number) {
    return { custom: x * 3 } as unknown as Wrapper;
  }
}
const wrapped: any = new Wrapper(7);
print(wrapped.custom);

// 5. Classes as boxed values, dynamic `new`, `typeof`, and dynamic `instanceof`.
class Point {
  x: number;
  y: number;
  static origin = 0;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
  sum(): number {
    return this.x + this.y;
  }
}
const K = Point;
print(typeof Point);
print(typeof K);
print(K.origin);
const p = new K(3, 4);
print(p.sum());
print(p instanceof K);
print(p instanceof Point);

function instantiate(Ctor: typeof Point, a: number, b: number) {
  return new Ctor(a, b);
}
const p2 = instantiate(Point, 10, 20);
print(p2.sum());
print(p2 instanceof K);

const notCtor: any = {};
try {
  print(p instanceof notCtor);
} catch (e) {
  print(e instanceof TypeError);
}

// 6. Subclassing Error.
class AppError extends Error {
  code: number;
  constructor(msg: string, code: number) {
    super(msg);
    this.code = code;
  }
}
const appErr = new AppError("failed", 500);
print(appErr instanceof AppError);
print(appErr.message);
print(appErr.code);
