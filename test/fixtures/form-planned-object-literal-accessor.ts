declare function print(value: unknown): void;

const o = {
  _v: 0,
  get v(): number {
    return this._v;
  },
  set v(n: number) {
    this._v = n;
  }
};
o.v = 5;
print(o.v);
