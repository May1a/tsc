declare function print(value: unknown): void;

const iterable = {
  [Symbol.iterator]() {
    return {
      index: 0,
      next() {
        let index = Number(this.index);
        this.index = index + 1;
        if (index < 25000) {
          return { value: index, done: false };
        }
        return { value: undefined, done: true };
      }
    };
  }
};

// Long rest: the consumption loop allocates 25k transient iterator-result
// objects while the growing rest array must stay rooted across collections.
const [first, second, ...rest] = iterable as any;
print(first);
print(second);
print(rest.length);
print(rest[0]);
print(rest[24997]);
