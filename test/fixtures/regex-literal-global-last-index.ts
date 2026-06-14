declare function print(value: unknown): void;

const re = /a/g;
print(re.test("banana"));
print(re.lastIndex);
print(re.test("banana"));
print(re.lastIndex);
