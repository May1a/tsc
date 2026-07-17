declare function print(value: unknown): void;

const iterable: any = {
  [Symbol.iterator]() {
    return {
      i: 0,
      next() {
        let i = Number(this.i);
        if (i === 0) {
          this.i = 1;
          return { value: ["a", 1], done: false };
        }
        if (i === 1) {
          this.i = 2;
          return { value: ["b", 2], done: false };
        }
        return { value: undefined, done: true };
      }
    };
  }
};

const map = new Map(iterable);
print(map.size);
print(map.get("a"));
print(map.get("b"));
