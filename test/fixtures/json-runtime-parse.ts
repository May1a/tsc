declare function print(value: unknown): void;

const parsed = JSON.parse('{"a":1,"b":[2,3]}');
print(typeof parsed);
print(JSON.stringify(parsed));
print(JSON.stringify(JSON.parse('"hi"')));
print(JSON.stringify(JSON.parse("null")));
