declare function print(value: unknown): void;

function getStr(): string { return "hello world"; }
const s = getStr();
print(s.slice(0, 5));
print(s.slice(6));
print(s.slice(-5));
print(s.slice(2, -1));
print(s.slice(50));
print(s.slice(4, 2));
print(s.slice());
