declare function print(value: unknown): void;

class Base {
  value: number = 4;

  get doubled(): number {
    return this.value * 2;
  }

  set doubled(next: number) {
    this.value = next / 2;
  }

  describe(): number {
    return this.value;
  }
}

class Derived extends Base {
  describe(): number {
    return super.describe() + 1;
  }
}

const value = new Derived();
print(value.describe());
print(value.doubled);
value.doubled = 20;
print(value.describe());
