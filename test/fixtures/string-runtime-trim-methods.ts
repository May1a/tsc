declare function print(value: unknown): void;
const value: any = "  hi  ";
print(value.trim());
print(value.trimStart());
print(value.trimEnd());
