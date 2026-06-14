declare function print(value: unknown): void;

class C {
  x: number;

  constructor(x: number) {
    this.x = x;
  }

  method() {
    return this.x;
  }
}

class Greeter {
  static greet() {
    return "hi";
  }
}

print(new C(7).method());
print(Greeter.greet());
