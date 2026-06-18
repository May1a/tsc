declare function print(value: unknown): void;

const match = "abc123".match(/\d+/);
print(match ? match[0] : "miss");
