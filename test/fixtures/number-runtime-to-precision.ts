declare function print(value: unknown): void;

const n: number = 3.14159;
const r: string = n.toPrecision(4);
print(r);