declare function print(value: unknown): void;

let closed = 0;
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
      },
      return() {
        closed = closed + 1;
        return { value: undefined, done: true };
      }
    };
  }
};

for (const value of iterable) {
  print(value);
  continue;
}
print(closed);
