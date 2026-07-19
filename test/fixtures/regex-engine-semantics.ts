declare function print(value: unknown): void;

print(/[a-c]+\d?/.test("zzbb2zz"));
print(/^bar$/m.test("foo\nbar\nbaz"));
print(/foo/i.test("FOO"));
print(/cat|dog/.test("a dog"));
print(/a(b|c)d/.test("acd"));
print(/^(ab)+$/.test("abab"));
print(/\bcat\b/.test("a cat!"));
print(/\Bcat\B/.test("scats"));
print(/^.$/u.test("😀"));
print(/^..$/.test("😀"));
print(/^.$/.test("😀"));
print(/^[😀]$/u.test("😀"));
print(/^[😀]$/.test("😀"));
const astralLiteral = /😀/.exec("x😀");
print(astralLiteral ? astralLiteral[0] : "miss");
print(astralLiteral ? astralLiteral.index : -1);
print(/./.test("\n"));
print(/[é]+/.test("éé"));
print(/[é]{2}/.test("é"));
print(/[ê]/.test("é"));
print(/[é-ë]/.test("ê"));
print(/ê/.test("é"));
print(/a{2,3}b/.test("aaab"));
print(/a{2}b/.test("aab"));
const lazy = /a+?/.exec("aaa");
print(lazy ? lazy[0] : "miss");

const sticky = /a/y;
print(sticky.test("aa"));
print(sticky.lastIndex);
print(sticky.test("aa"));
print(sticky.lastIndex);
print(sticky.test("aa"));
print(sticky.lastIndex);

const global = /a/g;
print(global.test("a"));
print(global.lastIndex);
print(global.test("a"));
print(global.lastIndex);

const nonAscii = /x/.exec("éx");
print(nonAscii ? nonAscii.index : -1);
