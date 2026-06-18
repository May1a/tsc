declare function print(value: unknown): void;

const s: any = "hello world";
print(s.substr(6, 5));
print(s.substr(-5));
print(s.substr(0, -1));
