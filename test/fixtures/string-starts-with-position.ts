declare function print(value: unknown): void;

function getStr(): string { return "hello"; }
const s = getStr();
print(s.startsWith("ll", 2));
