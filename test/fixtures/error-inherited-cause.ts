declare function print(value: unknown): void;
class Base { get cause() { print('cause'); return 42; } }
class Options extends Base {}
const options = new Options();
const e = new Error('message', options);
print(e.cause);
class Throwing { get cause() { throw 'cause failure'; } }
try { new Error('message', new Throwing()); } catch (e) { print(e); }
