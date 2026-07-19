declare function print(value: unknown): void;

class Base {
  base: number = 1;
  value: number;

  constructor(value: number) {
    this.value = value;
  }
}

class Middle extends Base {
  middle: number = 2;
}

class Derived extends Middle {
  derived: number = 3;
}

const value = new Derived(9);
print(value.base);
print(value.middle);
print(value.derived);
print(value.value);
