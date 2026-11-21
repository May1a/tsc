declare function print(value: unknown): void;

print(Math.acos(1));
print(Math.round(Math.acos(0) * 1000));
print(Math.round(Math.acos(-1) * 1000));
print(Number.isNaN(Math.acos(2)));
