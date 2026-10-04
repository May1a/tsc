declare function print(value: unknown): void;

const re = /a(b)c/g;
print(re.test("abc"));
print(re.test("xyz"));
print(/^x/.test("xyz"));
