declare function print(value: unknown): void;

function getStr(): string { return "hello"; }
const s = getStr();
print(s.startsWith("he"));
print(s.startsWith("lo"));
print(s.startsWith("x"));
