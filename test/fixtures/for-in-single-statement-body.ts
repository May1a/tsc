declare function print(value: unknown): void;

const o: { a: string; b: string } = { a: "1", b: "2" };

for (const k in o) print(k);
