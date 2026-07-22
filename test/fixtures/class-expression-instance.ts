declare function print(value: unknown): void;

const C = class {
  value() {
    return 1;
  }
};

const instance = new C();
print(instance.value());
print(instance instanceof C);
