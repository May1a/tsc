declare function print(value: unknown): void;

const o: { [k: string]: string } = {};
let count = 0;
for (const k in o) {
  count = count + 1;
}
print(count);
