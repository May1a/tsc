declare function print(value: unknown): void;

function getStr(): string { return "hello"; }
const s = getStr();
print(s.at(-1));
print(s.at(0));
print(s.at(2));
