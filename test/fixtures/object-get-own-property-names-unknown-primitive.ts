declare function print(value: unknown): void;

const value: any = 1;
const names = Object.getOwnPropertyNames(value);
print(names);
