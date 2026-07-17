declare function print(value: unknown): void;

const source: any = {
  [Symbol.iterator]() {
    return {
      index: 0,
      next() {
        let index = Number(this.index);
        if (index < 2) {
          this.index = index + 1;
          return { value: index + 1, done: false };
        }
        return { value: undefined, done: true };
      }
    };
  }
};

const result = Array.from(source, function (this: { factor: number }, value, index) {
  return Number(value) * Number(this.factor) + Number(index);
}, { factor: 3 });

print(result.length);
print(result[0]);
print(result[1]);
