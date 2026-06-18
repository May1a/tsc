declare function print(value: unknown): void;

class C {
  value() {
    return 5;
  }
}

const c = new C();
print(c.value());
print(Object.prototype.hasOwnProperty.call(c, "value"));
