declare function print(value: unknown): void;

function getStr(): string { return "hello world"; }
const s = getStr();
print(s.indexOf("o"));
print(s.indexOf("o", 5));
print(s.indexOf("z"));
print(s.indexOf("", 50));
print(s.indexOf("o", -3));
print(s.lastIndexOf("o"));
print(s.lastIndexOf("z"));
print(s.lastIndexOf(""));
print(s.includes("lo wo"));
print(s.includes("nope"));
