declare function print(value: unknown): void;

const obj = { name: "plain" };
print(obj instanceof Error);

const fixedArr = [1, 2, 3];
print(fixedArr instanceof Error);

const runtimeArr = ["a", 1];
print(runtimeArr instanceof Error);
