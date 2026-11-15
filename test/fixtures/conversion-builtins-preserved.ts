declare function print(value: unknown): void;
const array: any[] = [1, 2];
print(String(array));
print('a' + array);
const number = new Number(7);
const string = new String('text');
const boolean = new Boolean(false);
print(String(number)); print('n' + number);
print(String(string)); print(String(boolean));
const error = new TypeError('bad'); print(String(error));
function f() { return 1; }
const fn: any = f;
fn.toString = function () { return 'function'; };
print(String(fn));
