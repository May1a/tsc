declare function print(value: unknown): void;

const arr: any = [1, 2, 3];
arr[Symbol.iterator] = function iterator() {
  return {
    i: 0,
    next() {
      let i = Number(this.i);
      if (i < 2) {
        this.i = i + 1;
        return { value: 100 + i, done: false };
      }
      return { value: undefined, done: true };
    }
  };
};

for (const value of arr) {
  print(value);
}
