declare function print(value: unknown): void;

const s: any = "hello world";
print(s.substring(6, 11));
print(s.substring(11, 6));
print(s.substring(-3, 5));
