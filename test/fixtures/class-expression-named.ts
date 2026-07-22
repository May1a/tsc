declare function print(value: unknown): void;

const C = class Inner {
  static label() {
    return "inner";
  }
  describe() {
    return Inner.label();
  }
  self() {
    return new Inner();
  }
};

const instance = new C();
print(instance.describe());
print(instance.self() instanceof C);
print(C.label());
