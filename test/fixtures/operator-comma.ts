declare function print(value: unknown): void;

function sideEffect(): number { print("side"); return 0; }
function returnValue(): number { return 5; }

const y: number = (sideEffect(), returnValue() + 1);
print(y);
