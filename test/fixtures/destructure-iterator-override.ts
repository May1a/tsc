declare function print(value: unknown): void;

const values: any = [1, 2, 3];
values[Symbol.iterator] = function iterator() {
  print("override");
  return {
    index: 0,
    next() {
      let index = Number(this.index);
      if (index < 1) {
        this.index = index + 1;
        return { value: 9, done: false };
      }
      return { value: undefined, done: true };
    }
  };
};

const [first, second] = values;
print(first);
print(second);
