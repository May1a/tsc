declare function print(value: unknown): void;

function getStr(): string { return "hello"; }
const s = getStr();
print(s.charAt(0));
print(s.charAt(4));
print(s.charAt(5));
print(s.charAt(-1));
print(s.charAt(1 + 1));
