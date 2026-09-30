declare function print(value: unknown): void;

const s: string = "Hello";
const r: boolean = s.startsWith("He", 1);
print(r);