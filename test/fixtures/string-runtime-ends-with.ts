declare function print(value: unknown): void;

const s: string = "Hello";
const r: boolean = s.endsWith("lo", 4);
print(r);