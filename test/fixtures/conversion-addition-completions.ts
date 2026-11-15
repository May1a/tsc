declare function print(value: unknown): void;
class Numeric { valueOf() { print('valueOf'); return 4; } }
const numeric: any = new Numeric();
print(numeric + numeric);
class Refusing { valueOf() { return {}; } toString() { return {}; } }
function rhs() { print('rhs'); return '!'; }
try { print(new Refusing() + rhs()); } catch (e: any) { print(e.name); }
class Throwing { valueOf() { throw 'left failure'; } }
try { print(new Throwing() + rhs()); } catch (e) { print(e); }
