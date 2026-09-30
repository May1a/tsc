declare function print(value: unknown): void;

// `Object.is` lowers for a numeric pair. A `NaN` operand is not in the lowered slice.
const same: boolean = Object.is(1, 1);
const different: boolean = Object.is(1, 2);
const signedZero: boolean = Object.is(0, -0);
print(same);
print(different);
print(signedZero);
