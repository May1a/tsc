declare function print(value: unknown): void;

const iterable: any = {
  [Symbol.iterator]() {
    return {
      i: 0,
      next() {
        let i = Number(this.i);
        if (i === 0) {
          this.i = 1;
          return { value: "x", done: false };
        }
        if (i === 1) {
          this.i = 2;
          return { value: "y", done: false };
        }
        if (i === 2) {
          this.i = 3;
          return { value: "x", done: false };
        }
        return { value: undefined, done: true };
      }
    };
  }
};

const set = new Set(iterable);
print(set.size);
print(set.has("x"));
print(set.has("y"));
print(set.has("z"));
