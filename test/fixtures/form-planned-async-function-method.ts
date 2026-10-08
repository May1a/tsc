declare function print(value: unknown): void;

class C { async m(): Promise<number> { return 1; } }
print(new C().m());
