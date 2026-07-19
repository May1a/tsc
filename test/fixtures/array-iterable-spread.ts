declare function print(value: unknown): void;

const iterable = {
  [Symbol.iterator]() {
    return {
      index: 0,
      next() {
        let index = Number(this.index);
        this.index = index + 1;
        if (index < 2) {
          return { value: index + 2, done: false };
        }
        return { value: undefined, done: true };
      }
    };
  }
};

const values: unknown[] = [1, ...iterable, 4, ...iterable];
print(values.length);
print(values[0]);
print(values[1]);
print(values[2]);
print(values[3]);
print(values[4]);
print(values[5]);
