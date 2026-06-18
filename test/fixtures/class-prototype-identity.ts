declare function print(value: unknown): void;

class C {}

const first = C.prototype;
const second = C.prototype;
print(first === second);
print(Object.getPrototypeOf(new C()) === C.prototype);
