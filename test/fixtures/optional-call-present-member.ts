declare function print(value: unknown): void;

const holder = { present: () => { print("present"); } };

holder.present?.();
holder.present?.();
print("done");
