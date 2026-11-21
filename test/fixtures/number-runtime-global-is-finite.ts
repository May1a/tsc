declare function print(value: unknown): void;

print(isFinite(7));
print(isFinite("42" as unknown as number));
print(isFinite(null as unknown as number));
print(isFinite(Infinity));
print(isFinite(-Infinity));
print(isFinite(NaN));
print(isFinite("abc" as unknown as number));
