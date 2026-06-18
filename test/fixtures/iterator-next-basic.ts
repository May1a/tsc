declare function print(value: unknown): void;

const set = new Set();
set.add("only");

const iterator = set.values();
const first = iterator.next();
const second = iterator.next();

print(first.value);
print(first.done);
print(second.value);
print(second.done);
