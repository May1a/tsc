declare function print(value: unknown): void;
const pairs = [[1, 2], [3]];
for (const [i, x] of pairs) { print(i); print(x); }
for (const [x, y = 10] of pairs) { print(x); print(y); }
for (const [, second] of pairs) { print(second); }
const objects = [{ a: 4, b: 5 }, { a: 6 }];
for (const { a, b = 20 } of objects) { print(a); print(b); }
const nested: [[number, number], number][] = [[[7, 8], 9], [[10, 11], 12]];
for (const [[first, next], last] of nested) { print(first); print(next); print(last); }
const mixed: [{ n: number }, number][] = [[{ n: 13 }, 14]];
for (const [{ n }, tail] of mixed) { print(n); print(tail); }
