declare function print(value: unknown): void;

const arr: unknown[] = ["a"];

print(arr.push("b"));
print(arr.unshift("z"));
print(arr.pop());
print(arr.shift());
print(arr.length);
