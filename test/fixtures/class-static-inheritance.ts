declare function print(value: unknown): void;

class Base {
  static value: number = 4;

  static describe(): number {
    return 5;
  }
}

class Derived extends Base {
  static describe(): number {
    return super.describe() + 1;
  }
}

print(Derived.value);
print(Derived.describe());
