declare function print(value: unknown): void;

const arr: unknown[] = ["a", , "c"];
print(arr.push("d"));
print(arr.length);
print(arr.pop());
print(arr.pop());
print(arr.pop());
print(arr.pop());
print(arr.pop());
print(arr.length);
