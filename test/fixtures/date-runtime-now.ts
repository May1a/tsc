declare function print(value: unknown): void;

const t1 = Date.now();
const t2 = Date.now();
print(Number.isFinite(t1));
print(t1 > 1700000000000);
print(t2 >= t1);
