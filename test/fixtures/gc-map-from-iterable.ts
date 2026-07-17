declare function print(value: unknown): void;

const source: any = {
  [Symbol.iterator]() {
    return {
      index: 0,
      next() {
        let index = Number(this.index);
        if (index < 6000) {
          this.index = index + 1;
          return { value: [index, index + 1], done: false };
        }
        return { value: undefined, done: true };
      }
    };
  }
};

const map = new Map(source);
print(map.size);
print(map.get(0));
print(map.get(5999));
