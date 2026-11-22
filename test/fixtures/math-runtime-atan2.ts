declare function print(value: unknown): void;

print(Math.atan2(0, 1));
print(Math.round(Math.atan2(1, 1) * 1000));
print(Math.round(Math.atan2(1, 0) * 1000));
print(Math.round(Math.atan2(-1, 1) * 1000));
