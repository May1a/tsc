declare function print(value: unknown): void;

const text = '{"name":"tsc"}'.trim();
const value = JSON.parse(text);
print(value.name);
