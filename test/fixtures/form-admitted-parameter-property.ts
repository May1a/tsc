declare function print(value: unknown): void;

// `constructor(readonly v: number)` declares a field as well as receiving an argument, so the
// constructor stores it onto `this`. Reading `v` through a method is what shows the field exists.
class Box {
  constructor(readonly v: number) {}

  get(): number {
    return this.v;
  }
}

print(new Box(7).get());

// Every modifier that declares a field, and three parameters of different kinds in one constructor.
class Mixed {
  constructor(
    public n: number,
    protected s: string,
    readonly b: boolean
  ) {}

  show(): string {
    return `${this.n}${this.s}${this.b}`;
  }
}

print(new Mixed(1, "x", true).show());

// A derived class: the base's parameter properties are assigned by the base constructor, before the
// derived constructor's own body runs, so `getB` reads what `super` stored rather than a stale slot.
class Base {
  constructor(public b: number) {}

  getB(): number {
    return this.b;
  }
}

class Derived extends Base {
  constructor(b: number, public d: number) {
    super(b);
  }

  getD(): number {
    return this.d;
  }
}

const derived = new Derived(7, 8);
print(derived.getB());
print(derived.getD());

// The constructor body runs after the assignment, so a write in the body wins. TypeScript forbids
// reading a parameter property from a field initializer (TS2729), so that ordering is not observable
// from a program that typechecks; this is the part that is.
class Overwritten {
  constructor(public v: number) {
    this.v = this.v + 100;
  }

  get(): number {
    return this.v;
  }
}

print(new Overwritten(1).get());
