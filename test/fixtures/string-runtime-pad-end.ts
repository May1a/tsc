declare function print(value: unknown): void;

const s: string = "7";
const r: string = s.padEnd(3, "0");
print(r);