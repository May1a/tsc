declare function print(value: unknown): void;

const s: string = "a,b,c";
const parts: string[] = s.split(",");
print(parts.length);
print(parts[1]);