declare function print(value: unknown): void;
const rows = [[{ a: 1 }], [{ a: 2 }]];
for (const [{ a }] of rows) { print(a); }
