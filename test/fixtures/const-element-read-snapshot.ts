declare function print(value: unknown): void;

// A const initialized by an element read keeps the element it read, not the expression.
const rows: any[] = [{ n: 1 }, { n: 2 }];
let i = 0;
const first = rows[i];
i = 1;
print(first.n);
first.n = 10;
const zero = rows[0];
print(zero.n);
const values: number[] = [1, 2];
const v = values[0];
values[0] = 5;
print(v);
