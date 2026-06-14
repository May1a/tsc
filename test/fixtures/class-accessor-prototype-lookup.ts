declare function print(value: unknown): void;

class C {
  value = 6;

  get x() {
    return this.value;
  }
}

print(new C().x);
