declare function print(value: unknown): void;

const receiver = {
  base: 10,
  add(a: unknown, b: unknown) {
    print(Number(this.base) + Number(a) + Number(b));
  }
};

const args: unknown[] = [2, 3];
receiver.add(...args);
