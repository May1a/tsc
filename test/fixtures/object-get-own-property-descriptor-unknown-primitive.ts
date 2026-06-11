declare function print(value: unknown): void;

const value: any = 1;
const desc = Object.getOwnPropertyDescriptor(value, "x");
print(desc);
