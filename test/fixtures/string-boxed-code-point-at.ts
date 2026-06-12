declare function print(value: unknown): void;

const s: any = "hello";
print(s.codePointAt(0));
print(s.codePointAt(4));
print(s.codePointAt(5));
