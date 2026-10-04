declare function print(value: unknown): void;

const global = /a/g;
print(global.flags);
const both = /a/gi;
print(both.flags);
const plain = /a/;
print(plain.flags);
const constructed = new RegExp("a", "y");
print(constructed.flags);
