declare function print(value: unknown): void;

const C = class {
  value() {
    return 1;
  }
};

print(new C().value());
