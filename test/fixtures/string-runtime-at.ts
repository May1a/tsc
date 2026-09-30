declare function print(value: unknown): void;

const s: string = "Hello";
const r: unknown = s.at(1);
print(r);