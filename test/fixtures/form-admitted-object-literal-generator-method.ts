const seq = {
  base: 10,
  *[Symbol.iterator]() {
    yield this.base + 1;
    yield this.base + 2;
    yield this.base + 3;
  },
  *times(n: number) {
    for (let i = 1; i <= n; i++) {
      yield this.base * i;
    }
  }
};

const a: number[] = [];
for (const x of seq) {
  a.push(x);
}
console.log(a.join(","));
const timesArr = [...seq.times(3)];
console.log(timesArr.join(","));
