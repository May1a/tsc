declare function print(value: unknown): void;

const x = 42;
print(String.raw`a\nb`);
print(String.raw`\5C${x}\00`);
