declare function print(value: unknown): void;

const s: string = "7";
const r: string = s.padStart(3, "0");
print(r);