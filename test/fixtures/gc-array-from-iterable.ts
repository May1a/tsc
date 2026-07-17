declare function print(value: unknown): void;

const source: any = {
  [Symbol.iterator]() {
    return {
      index: 0,
      next() {
        let index = Number(this.index);
        if (index < 12000) {
          this.index = index + 1;
          return { value: index, done: false };
        }
        return { value: undefined, done: true };
      }
    };
  }
};

const values = Array.from(source);
print(values.length);
print(values[0]);
print(values[11999]);
