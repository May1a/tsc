class Range {
  start: number;
  end: number;

  constructor(start: number, end: number) {
    this.start = start;
    this.end = end;
  }

  *values() {
    for (let i = this.start; i <= this.end; i++) {
      yield i;
    }
  }

  *[Symbol.iterator]() {
    yield* this.values();
  }

  static *pair(a: number, b: number) {
    yield a;
    yield b;
  }
}

const range = new Range(2, 5);
const out: number[] = [];
for (const n of range) {
  out.push(n);
}
console.log(out.join(","));
const pairArr = [...Range.pair(10, 20)];
console.log(pairArr.join(","));
