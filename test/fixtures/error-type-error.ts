declare function print(value: unknown): void;

const t = new TypeError("wrong type");
print(t.message);
print(t.name);
print(t.toString());
