declare function print(value: unknown): void;

const iterable = {
  [Symbol.iterator]() {
    return {
      i: 0,
      next() {
        const i = Number(this.i);
        if (i >= 1) {
          return { value: undefined, done: true };
        }
        this.i = i + 1;
        return { value: 1, done: false };
      }
    };
  }
};

for (const value of iterable) {
  try {
    throw value;
  } catch (error) {
    print(error);
  }
}
