declare function print(value: unknown): void;

const s: any = "hello world";
print(s.indexOf("o"));
print(s.indexOf("o", 5));
print(s.indexOf("z"));
print(s.indexOf("", 50));
