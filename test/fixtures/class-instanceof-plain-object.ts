declare function print(value: unknown): void;

class C {}

print({} instanceof C);
print([] instanceof C);
print((1 as any) instanceof C);
