declare function print(value: unknown): void;

const iterable = {
  [Symbol.iterator]() {
    return {
      i: 0,
      next() {
        let i = Number(this.i);
        if (i < 2) {
          this.i = i + 1;
          return { value: i + 1, done: false };
        }
        return { value: undefined, done: true };
      }
    };
  }
};

for (const value of iterable) {
  print(value);
}
