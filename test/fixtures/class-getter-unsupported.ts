declare function print(value: unknown): void;

class C {
  get value() {
    return 1;
  }
}

print(new C().value);
