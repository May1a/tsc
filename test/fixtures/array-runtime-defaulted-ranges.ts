declare function print(value: unknown): void;

const sliceSource: unknown[] = ["a", , "c"];
const copied: unknown[] = sliceSource.slice();
print(copied.length);
print(copied[1]);
const copiedKeys: unknown[] = Object.keys(copied);
print(copiedKeys.length);

const fillTarget: unknown[] = ["a", "b", "c"];
fillTarget.fill("x", 1);
print(fillTarget[0]);
print(fillTarget[1]);
print(fillTarget[2]);

const copyTarget: unknown[] = ["a", "b", "c", "d"];
copyTarget.copyWithin(1, 0);
print(copyTarget[0]);
print(copyTarget[1]);
print(copyTarget[2]);
print(copyTarget[3]);
