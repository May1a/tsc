declare function print(value: unknown): void;

const iterable = {
  [Symbol.iterator]() {
    return {
      i: 0,
      next() {
        let i = Number(this.i);
        if (i < 5) {
          this.i = i + 1;
          return { value: i + 1, done: false };
        }
        return { value: undefined, done: true };
      }
    };
  }
};

let sum = 0;
for (const value of iterable) {
  sum = sum + Number(value);
}
print(sum);
