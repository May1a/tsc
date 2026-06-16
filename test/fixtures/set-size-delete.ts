declare function print(value: unknown): void;

const set = new Set();
set.add(NaN);
set.add(Number("nope"));
set.add(0);
set.add(-0);
print(set.size);
print(set.has(NaN));
print(set.has(-0));
print(set.delete(0));
print(set.has(-0));
print(set.size);
