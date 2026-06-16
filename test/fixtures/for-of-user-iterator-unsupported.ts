declare function print(value: unknown): void;

const iterable = {
  [Symbol.iterator]() {
    return {
      next() {
        return { value: 1, done: true };
      }
    };
  }
};

for (const value of iterable) {
  print(value);
}
