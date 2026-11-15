declare function print(value: unknown): void;
const error: any = new Error('original');
error.name = { toString() { print('name'); return ''; } };
error.message = { toString() { print('message'); return 'custom'; } };
print(String(error));
error.message = { toString() { throw 'error string failure'; } };
try { print(String(error)); } catch (e) { print(e); }
