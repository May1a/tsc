declare function print(value: unknown): void;

// The shape that reaches the bug: one name that is a static field *and* an instance field.
//
// `resolveReceiverClass` resolves both the class `Slot` and an instance `s` to the same `ClassInfo`, so
// deciding "is this a static write?" from the field's name alone sent `s.value = 7` to the class's static
// storage. The instance field was never written, both instances shared the static slot, and nothing
// reported it — the program computed the wrong answer silently.
class Slot {
  static value = 0;
  value = 0;

  readStatic(): number {
    return Slot.value;
  }

  readOwn(): number {
    return this.value;
  }
}

const s = new Slot();

Slot.value = 5;
print(Slot.value);
print(s.readStatic());

// This write belongs to the instance.
s.value = 7;
print(s.value);
print(s.readOwn());
print(Slot.value);
print(s.readStatic());

// A second instance must start at its own initializer rather than inherit the first one's write.
const t = new Slot();
print(t.value);
t.value = 9;
print(s.value);
print(t.value);
print(Slot.value);