declare function print(value: unknown): void;

print(/foo/.test("food"));
print(/foo/.test("bar"));
print(/\d+/.test("abc123"));
