declare function print(value: unknown): void;

const literal = /a(b)c/g;
print(literal.source);
const simple = /^x$/i;
print(simple.source);
const constructed = new RegExp("a\\d+", "m");
print(constructed.source);
