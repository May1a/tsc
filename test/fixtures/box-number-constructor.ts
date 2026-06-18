declare function print(value: unknown): void;
const n: any = new Number(42);
print(n.valueOf());
print(n.toString());
