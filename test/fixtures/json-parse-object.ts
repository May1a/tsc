declare function print(value: unknown): void;

const obj = JSON.parse('{"k": "v", "n": 7}');
print(obj.k);
print(obj.n);

const nested = JSON.parse('{"deep": true}');
print(nested.deep);

const list = JSON.parse('[1, "two"]');
print(list[1]);
