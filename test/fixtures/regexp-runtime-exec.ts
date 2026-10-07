declare function print(value: unknown): void;

const re = /a(b)c/;
const found = re.exec("xabc");
print(found === null ? "null" : found[0]);
print(found === null ? "null" : found[1]);
print(re.exec("xyz") === null ? "null" : "found");
