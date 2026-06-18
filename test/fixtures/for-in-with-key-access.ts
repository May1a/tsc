declare function print(value: unknown): void;

const o: { [k: string]: string } = { a: "1", b: "2", c: "3" };
for (const k in o) {
  print(o[k]);
}
