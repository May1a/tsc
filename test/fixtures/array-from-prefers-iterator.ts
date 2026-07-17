declare function print(value: unknown): void;

// length is present, but Symbol.iterator must win over the array-like path.
const source: any = {
  length: 0,
  [Symbol.iterator]() {
    return {
      i: 0,
      next() {
        let i = Number(this.i);
        if (i < 2) {
          this.i = i + 1;
          return { value: `v${i}`, done: false };
        }
        return { value: undefined, done: true };
      }
    };
  }
};

const result = Array.from(source);
print(result.length);
print(result[0]);
print(result[1]);
