// @ts-nocheck -- Accessing `this` before `super()` is a TS error (TS17009);
// the fixture exists to pin the compiler's compile-time fallback for it.
declare function print(value: unknown): void;

class Base {
  value: number;

  constructor(value: number) {
    this.value = value;
  }
}

class Derived extends Base {
  constructor(value: number) {
    print(this);
    super(value);
  }
}

print(new Derived(7).value);
