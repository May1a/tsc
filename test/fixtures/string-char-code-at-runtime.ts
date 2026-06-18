declare function print(value: unknown): void;

function getStr(): string { return "hello"; }
const s = getStr();
print(s.charCodeAt(0));
print(s.charCodeAt(1));
