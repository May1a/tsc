declare function print(value: unknown): void;

const arr: any = ["a", "b"];

print(arr.pop("ignored"));
print(arr.shift("ignored"));
print(arr.length);
