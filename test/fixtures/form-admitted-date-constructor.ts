declare function print(value: unknown): void;

const epoch = new Date(0);
print(epoch.getTime());
print(epoch.toISOString());

const fromIso = new Date("2024-02-29T12:34:56.789Z");
print(fromIso.getTime());
print(fromIso.toISOString());

const nowDate = new Date();
print(nowDate.getTime() > 1700000000000);
const keys = Object.keys(epoch);
print(keys.length);
