declare function print(value: unknown): void;

class C {
  #first = "a";
  second = this.#first + "b";
  #third = this.second + "c";

  value() {
    return this.#third;
  }

  set(value: string) {
    this.#third = value;
  }
}

class Base {
  #base = "base";

  baseValue() {
    return this.#base;
  }
}

class Derived extends Base {
  #derived = "derived";

  derivedValue() {
    return this.#derived;
  }
}

class Brand {
  #secret = 1;

  static read(instance: any) {
    return instance.#secret;
  }

  static write(instance: any, value: number) {
    instance.#secret = value;
  }
}

const c = new C();
print(c.value());
print(c.set("c"));
print(c.value());

const derived = new Derived();
print(derived.baseValue());
print(derived.derivedValue());

print(Brand.read(new Brand()));

try {
  print(Brand.write(Brand.prototype, 2));
} catch (e) {
  print(e);
}

print(Brand.read(Brand.prototype));
