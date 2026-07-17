declare function print(value: unknown): void;

const bad: any = {
  [Symbol.iterator]() {
    return {
      i: 0,
      next() {
        let i = Number(this.i);
        if (i === 0) {
          this.i = 1;
          return { value: 1, done: false };
        }
        return { value: undefined, done: true };
      }
    };
  }
};

try {
  const map = new Map(bad);
  print(map.size);
} catch (error: any) {
  print(error.name);
  print(error.message);
}
