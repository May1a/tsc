declare function print(value: unknown): void;

const o: { a: string; b: string; c: string } = { a: "1", b: "2", c: "3" };
for (const k in o) {
  if (k === "a") {
    continue;
  }
  if (k === "c") {
    break;
  }
  print(k);
}
