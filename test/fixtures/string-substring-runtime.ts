declare function print(value: unknown): void;

function getStr(): string { return "hello world"; }
const s = getStr();
print(s.substring(6));
print(s.substring(0, 5));
print(s.substring(8, 2));
print(s.substring(-3));
print(s.substring(5, 50));
print(s.substring(3, 3));
