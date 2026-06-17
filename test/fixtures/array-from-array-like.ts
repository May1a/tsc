declare function print(value: unknown): void;
const source = JSON.parse("{\"0\":\"a\",\"1\":\"b\",\"length\":2}");
const result = Array.from(source);
print(result.length);
print(result[0]);
print(result[1]);
