declare function print(value: unknown): void;

// A tagged template is a call whose callee is the tag, and the template path never reaches a call
// diagnostic, so this asserts the table's refusal rather than a syntax kind.
const raw: string = String.raw`a\nb`;
print(raw);
