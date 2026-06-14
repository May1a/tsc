declare function print(value: unknown): void;

const match = /a.b/.exec("xxa-byy");
print(match ? match[0] : "miss");
print(match ? match.index : -1);
print(/a.b/.exec("zzz") === null);
