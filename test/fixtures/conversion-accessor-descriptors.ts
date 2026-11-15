declare function print(value: unknown): void;
class C { n = 1; get cause() { return this.n; } set cause(value: number) { this.n = value; } }
const instance: any = new C();
instance['cause'] = 9;
const error = new Error('', instance);
print(error.cause);
const prototype = C.prototype;
const descriptor: any = Object.getOwnPropertyDescriptor(prototype, 'cause');
const get = descriptor.get; const set = descriptor.set;
print(get !== undefined); print(set !== undefined);
print(descriptor.enumerable); print(descriptor.configurable);
print(Object.prototype.hasOwnProperty.call(descriptor, 'value'));
print(Object.prototype.hasOwnProperty.call(descriptor, 'writable'));
