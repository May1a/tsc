declare function print(value: unknown): void;

const d = new Date(1234);
print(d.getTime());
const invalid = new Date(NaN);
print(Number.isNaN(invalid.getTime()));
