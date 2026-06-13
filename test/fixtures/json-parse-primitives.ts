declare function print(value: unknown): void;

const s = JSON.parse('"text"');
print(s);

const n = JSON.parse("42");
print(n);

const negative = JSON.parse("-1.5");
print(negative);

const b = JSON.parse("true");
print(b);

const nul = JSON.parse("null");
print(nul);
