declare function print(value: unknown): void;

const s: any = "hello world";
print(s.slice(0, 5));
print(s.slice(6));
print(s.slice(-5));
