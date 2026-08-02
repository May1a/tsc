declare function print(value: unknown): void;

function getStr(): string { return "hello"; }
const s = getStr();
print("[" + s.at(-1) + "]");
print("[" + s.at(0) + s.slice(1, 3) + "]");
print("[" + s.charAt(1) + s.substring(3) + "]");
