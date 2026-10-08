declare function print(value: unknown): void;

const a: unknown[] = [1];
a.forEach(async () => { print(1); });
