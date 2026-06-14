declare function print(value: unknown): void;

class C {}

const notConstructor: any = {};
print(new C() instanceof notConstructor);
