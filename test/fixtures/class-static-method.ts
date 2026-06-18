declare function print(value: unknown): void;

class C {
  static greet() {
    return "hi";
  }
}

print(C.greet());
