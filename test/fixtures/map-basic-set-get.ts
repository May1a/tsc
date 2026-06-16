declare function print(value: unknown): void;

const map = new Map();
print(map.size);
const returned = map.set("answer", 42);
print(returned === map);
print(map.size);
print(map.get("answer"));
print(map.get("missing"));
