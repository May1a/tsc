declare function print(value: unknown): void;

const obj = Object.fromEntries(["bad"]);
print(obj);
