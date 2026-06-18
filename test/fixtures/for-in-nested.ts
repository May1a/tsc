declare function print(value: unknown): void;

const o: { [k: string]: string } = { a: "1", b: "2" };
const p: { [k: string]: string } = { x: "10", y: "20" };
for (const k in o) {
  for (const j in p) {
    print(k + j);
  }
}
