declare function print(value: unknown): void;

// Private methods are shared by every instance, checked by brand, and distinct per class.
class Counter {
  #count = 0;
  #step(by: number) {
    this.#count = this.#count + by;
    return this.#count;
  }
  #describe(prefix = "n=") {
    return prefix + this.#count;
  }
  tick() {
    return this.#step(2);
  }
  label() {
    return this.#describe();
  }
  get stepper() {
    return this.#step;
  }
  same(other: any) {
    return this.#step === other.#step;
  }
  static probe(o: any) {
    return o.#describe("x");
  }
}
const a = new Counter();
print(a.tick());
print(a.tick());
print(a.label());
print(a.stepper(10));
print(a.same(new Counter()));
print(Counter.probe(a));
try {
  Counter.probe({});
} catch (error: any) {
  print(error.name);
}
class Base {
  #secret() { return "base"; }
  reveal() { return this.#secret(); }
}
class Derived extends Base {
  #secret() { return "derived"; }
  revealOwn() { return this.#secret(); }
}
const d = new Derived();
print(d.reveal());
print(d.revealOwn());
print(JSON.stringify(a));
