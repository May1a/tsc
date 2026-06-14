declare function print(value: unknown): void;

const pattern = "foo";
const flags = "i";
const re = new RegExp(pattern, flags);
print(re.test("FOOD"));
print(re.source);
print(re.flags);
