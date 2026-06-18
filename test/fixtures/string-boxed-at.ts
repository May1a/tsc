declare function print(value: unknown): void;

const s: any = "hello";
print(s.at(0));
print(s.at(-1));
print(s.at(5));
