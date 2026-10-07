declare function print(value: unknown): void;

const n: number = 1234;
const r: string = n.toExponential(2);
print(r);