declare function print(value: unknown): void;

class C {
  value = 1;

  get doubled() {
    return this.value * 2;
  }

  set doubled(next: number) {
    this.value = next / 2;
  }
}

const c = new C();
print(c.doubled + 1);
c.doubled = 16;
print(c.value);
