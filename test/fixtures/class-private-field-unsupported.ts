declare function print(value: unknown): void;

class C {
  #value = 1;

  value() {
    return this.#value;
  }
}

print(new C().value());
