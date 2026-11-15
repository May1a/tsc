declare function print(value: unknown): void;
const e = new Error({ toString() { print('convert'); return 'custom'; } } as any);
print(e.message);
try { new Error({ toString() { throw 'message failure'; } } as any); } catch (e) { print(e); }
