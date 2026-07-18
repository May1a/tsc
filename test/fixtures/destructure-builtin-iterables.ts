declare function print(value: unknown): void;

const [letter] = "ok";
print(letter);

const values = new Set([4, 5]);
const [setValue] = values;
print(setValue);

const entries = new Map([["key", 7]]);
const [entry] = entries;
print(entry[0]);
print(entry[1]);
