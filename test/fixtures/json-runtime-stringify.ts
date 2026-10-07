declare function print(value: unknown): void;

print(JSON.stringify({ a: 1, b: "two" }));
print(JSON.stringify([1, 2, 3]));
print(JSON.stringify({ a: 1, b: 2 }, undefined, 2));
print(JSON.stringify("plain"));
print(JSON.stringify(null));
