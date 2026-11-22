declare function print(value: unknown): void;

const m = new Map<string, number>();
m.set("a", 1);
m.set("b", 2);
let sum = 0;
m.forEach((v: number, k: string) => {
  print(k + ":" + v);
  sum += v;
});
print(sum);

const s = new Set<number>();
s.add(5);
s.add(7);
const acc = { total: 0 };
s.forEach(function (this: { total: number }, v: number) {
  this.total = this.total + v;
}, acc);
print(acc.total);
