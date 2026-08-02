declare function print(value: unknown): void;

function getStr(): string { return "hello world"; }
const s = getStr();
print(s.substr(6));
print(s.substr(0, 5));
print(s.substr(-5));
print(s.substr(-5, 2));
print(s.substr(6, -1));
print(s.substr(50));
print(s.substr(4, 0));
