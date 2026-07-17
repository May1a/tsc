declare function print(value: unknown): void;

const arr: unknown[] = [1, , 3];
const iterator = arr[Symbol.iterator]();
const first = iterator.next();
const second = iterator.next();
const third = iterator.next();
const fourth = iterator.next();
const fifth = iterator.next();

print(first.value);
print(first.done);
print(second.value);
print(second.done);
print(third.value);
print(third.done);
print(fourth.value);
print(fourth.done);
print(fifth.done);
