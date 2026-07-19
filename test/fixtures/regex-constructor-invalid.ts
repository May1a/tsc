declare function print(value: unknown): void;

let pattern = "[";
const re = new RegExp(pattern);
print(re.test("anything"));
