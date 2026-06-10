declare function print(value: unknown): void;

const text: unknown = "x";
const zero: unknown = 0;
const one: unknown = 1;
const undef: unknown = undefined;
const none: unknown = null;

if (text) { print("text"); }
if (!zero) { print("zero"); }
if (one) { print("one"); }
if (!undef) { print("undefined"); }
if (!none) { print("null"); }
