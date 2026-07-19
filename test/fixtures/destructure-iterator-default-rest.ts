declare function print(value: unknown): void;

const iterable = {
  [Symbol.iterator]() {
    return {
      index: 0,
      next() {
        let index = Number(this.index);
        this.index = index + 1;
        if (index === 0) {
          return { value: undefined, done: false };
        }
        if (index === 1) {
          return { value: 0, done: false };
        }
        if (index === 2) {
          return { value: 30, done: false };
        }
        return { value: undefined, done: true };
      }
    };
  }
};

const [fallback = 10, falsy = 20, ...rest] = iterable as any;
print(fallback);
print(falsy);
print(rest.length);
print(rest[0]);
