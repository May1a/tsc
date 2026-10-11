declare function print(value: unknown): void;

const o: { a: string; b: string } = { a: "1", b: "2" };
for (let k in o) {
  k = k + "!";
  print(k);
}
