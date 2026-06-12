declare function print(value: unknown): void;

const arr: unknown[] = ["a", "b", "c"];
const tail: unknown[] = arr.slice(-2);
const head: unknown[] = arr.slice(0, -1);
print(tail.length);
print(tail[0]);
print(head[1]);
