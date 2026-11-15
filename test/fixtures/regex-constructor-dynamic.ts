declare function print(value: unknown): void;

let pattern = "foo";
const re = new RegExp(pattern);
print(re.test("foo"));
