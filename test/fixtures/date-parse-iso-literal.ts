declare function print(value: unknown): void;

print(Date.parse("1970-01-01T00:00:00.000Z"));
print(Date.parse("not a date"));
