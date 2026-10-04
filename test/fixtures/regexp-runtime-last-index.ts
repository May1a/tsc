declare function print(value: unknown): void;

// `lastIndex` reads as 0 on a fresh regex, and `exec` on a global regex advances it. The write form
// (`re.lastIndex = 0`) is not a lowering shape this build has: only a property read through a named
// binding is. That is recorded as a planned member rather than left to fail as an
// `ExpressionStatement` at the assignment.
const re = /a/g;
print(re.lastIndex);
const nonGlobal = /b/;
print(nonGlobal.lastIndex);
