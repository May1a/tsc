declare function print(value: unknown): void;
const rows = [{ items: [1, 2] }, { items: [3, 4] }];
for (const { items: [first, second] } of rows) { print(first); print(second); }
const inner = { items: [{ a: 5 }, { a: 6 }] };
const deep = [{ outer: inner }];
for (const { outer: { items: [{ a }, { a: b }] } } of deep) { print(a); print(b); }
