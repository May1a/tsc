declare function print(value: unknown): void;

const s: string = "HeLLo";
const r: boolean = s.normalize() === s;
print(r);