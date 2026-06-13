declare function print(value: unknown): void;

const arr = ["a", "b", "c", "d"];
const [head, ...tail] = arr;
print(head);
print(tail.length);
print(tail[0]);
print(tail[2]);
