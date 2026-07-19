declare function print(value: unknown): void;

const matches = "a1b22c333".match(/\d+/g);
print(matches ? matches.length : 0);
print(matches ? matches[0] : "miss");
print(matches ? matches[1] : "miss");
print(matches ? matches[2] : "miss");

const empty = "b".match(/a*/g);
print(empty ? empty.length : 0);
print(empty ? empty[0] : "miss");
print(empty ? empty[1] : "miss");
