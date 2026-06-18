declare function print(value: unknown): void;

const s: any = "hello world";
print(s.includes("world"));
print(s.includes("xyz"));
print(s.includes("o", 5));
