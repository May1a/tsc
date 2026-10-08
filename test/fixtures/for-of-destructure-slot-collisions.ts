declare function print(value: unknown): void;
let value = 40;
const rows = [{ value: 1 }, { value: 2 }];
for (const { value } of rows) { print(value); }
for (const { value } of rows) { print(value); }
print(value);
