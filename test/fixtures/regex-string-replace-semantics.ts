declare function print(value: unknown): void;

print("a1b22".replace(/\d+/g, "[$&]"));
print("abc".replace(/(b)/, "$$-$`-$&-$1-$'"));
print("bbb".replace(/a*/g, "x"));
