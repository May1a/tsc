declare function print(value: unknown): void;

const pieces = "a1b22c".split(/(\d+)/);
print(pieces.length);
print(pieces[0]);
print(pieces[1]);
print(pieces[2]);
print(pieces[3]);
print(pieces[4]);

const limited = "a-b-c".split(/-/, 2);
print(limited.length);
print(limited[0]);
print(limited[1]);
