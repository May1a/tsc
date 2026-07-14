declare function print(value: unknown): void;

class Holder {
  value: number;
  constructor(value: number) {
    this.value = value;
  }
}

function allocate(count: number): number {
  let last = 0;
  for (let index = 0; index < count; index = index + 1) {
    last = new Holder(index).value;
  }
  return last;
}

const values: unknown[] = [0];
const mapped = values.map(function (this: { factor: number }, value) {
  return Number(value) + Number(this.factor) + allocate(25000) - 24999;
}, { factor: 7 });

print(mapped[0]);
