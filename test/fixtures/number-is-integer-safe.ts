declare function print(value: unknown): void;
print(Number.isInteger(3));
print(Number.isInteger(3.5));
print(Number.isSafeInteger(9007199254740991));
print(Number.isSafeInteger(9007199254740992));
print(Number.isFinite("1"));
