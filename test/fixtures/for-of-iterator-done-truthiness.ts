declare function print(value: unknown): void;

const iterable: any = {
  [Symbol.iterator]() {
    return {
      step: 0,
      next() {
        let step = Number(this.step);
        this.step = step + 1;
        if (step === 0) {
          return { value: 10, done: 0 };
        }
        if (step === 1) {
          return { value: 20, done: "" };
        }
        return { value: 30, done: 1 };
      }
    };
  }
};

for (const value of iterable) {
  print(value);
}
