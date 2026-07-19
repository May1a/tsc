declare function print(value: unknown): void;

const match = /(\w+)-(\d+)/.exec("word-42");
print(match ? match[0] : "miss");
print(match ? match[1] : "miss");
print(match ? match[2] : "miss");
print(/(go)-\1/.test("go-go"));
print(/(go)-\1/.test("go-stop"));
