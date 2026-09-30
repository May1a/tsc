declare function print(value: unknown): void;

const s: string = "aXbXc";
const m = s.match(/X/) as { 0?: unknown } | null;
print(m === null ? "null" : m[0]);