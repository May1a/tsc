declare function print(value: unknown): void;
print(Number.isNaN(NaN));
print(Number.isNaN(1));
print(Number.isFinite(1));
print(Number.isFinite(Infinity));
print(Number.isFinite("1"));
print(Number.isNaN("x"));
