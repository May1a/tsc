declare function print(value: unknown): void;

class C { static async m(): Promise<number> { return 1; } }
print(C.m());
