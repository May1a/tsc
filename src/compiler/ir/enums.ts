import ts from "typescript";
import { type Lowered, type Produced, loweredOperation, produced, unsupportedIn } from "./lowered.js";
import type { JsIrRuntimeObjectField, JsIrRuntimeObjectValue, JsIrValueExpression } from "./expressions.js";

/**
 * The number a numeric *source* literal denotes, or `undefined` when the expression is not one.
 *
 * Distinct from `numericLiteralValue`, which reads an already-lowered number: this runs before lowering,
 * on a TypeScript expression. A sign in front of the literal is still a constant — TypeScript accepts
 * `enum E { A = -1 }` and emits `E[E["A"] = -1] = "A"` — so the sign belongs to the value rather than
 * being a separate operation.
 */
export function sourceNumericLiteralValue(expression: ts.Expression): number | undefined {
  if (ts.isNumericLiteral(expression)) {
    return Number(expression.text);
  }
  if (ts.isPrefixUnaryExpression(expression) && ts.isNumericLiteral(expression.operand)) {
    const magnitude = Number(expression.operand.text);
    if (expression.operator === ts.SyntaxKind.MinusToken) {
      return -magnitude;
    }
    if (expression.operator === ts.SyntaxKind.PlusToken) {
      return magnitude;
    }
  }
  return undefined;
}

/**
 * One enum member with the value TypeScript gives it, worked out before anything is lowered.
 *
 * `undefined` is a real value here and not a gap: a member that auto-numbers after a string member has
 * no number to take, so TypeScript gives it `undefined` and still gives it a reverse entry under the key
 * `"undefined"`. `enum Mixed { X = 5, Y, Z = "s", W }` has `Mixed.W === undefined`.
 */
interface EnumMemberValue {
  readonly name: string;
  readonly value: number | string | undefined;
}

/** What one member's initializer contributes: its value, and the counter for the member after it. */
interface EnumInitializerOutcome {
  readonly value: number | string | undefined;
  readonly nextNumber: number;
  readonly counterIsValid: boolean;
}

/** Classify a member's initializer, or `undefined` when it is not a constant this pass can read. */
function enumInitializerOutcome(initializer: ts.Expression): EnumInitializerOutcome | undefined {
  const signed = sourceNumericLiteralValue(initializer);
  if (signed !== undefined) {
    if (!Number.isFinite(signed)) {
      return undefined;
    }
    return { value: signed, nextNumber: signed + 1, counterIsValid: true };
  }
  if (ts.isStringLiteral(initializer)) {
    // A string leaves no counter, so the next auto-numbered member is `undefined` until a numeric
    // initializer restores it.
    return { value: initializer.text, nextNumber: 0, counterIsValid: false };
  }
  return undefined;
}

function enumMemberValues(members: ts.NodeArray<ts.EnumMember>): Produced<readonly EnumMemberValue[]> {
  const values: EnumMemberValue[] = [];
  let nextNumber = 0;
  let counterIsValid = true;
  for (const member of members) {
    const { name } = member;
    if (!ts.isIdentifier(name) && !ts.isStringLiteral(name)) {
      return unsupportedIn("An enum member name must be an identifier or a string literal");
    }
    const { initializer } = member;
    if (initializer === undefined) {
      let value: number | undefined;
      if (counterIsValid) {
        value = nextNumber;
        nextNumber += 1;
      }
      values.push({ name: name.text, value });
      continue;
    }
    const outcome = enumInitializerOutcome(initializer);
    if (outcome === undefined) {
      return unsupportedIn(
        `\`${name.text}\` has an enum initializer that is not a numeric or string literal; this build does not fold constant expressions`
      );
    }
    values.push({ name: name.text, value: outcome.value });
    const { nextNumber: following, counterIsValid: followingIsValid } = outcome;
    nextNumber = following;
    counterIsValid = followingIsValid;
  }
  return produced(values);
}

/**
 * An enum lowered to the object TypeScript's own emit builds.
 *
 * Both directions are in one object literal, as they are in TypeScript's output: the forward mapping is
 * `A: 0`, and the reverse mapping is the *key* `0` holding `"A"`. A string member contributes only the
 * forward entry, because a string has no reverse entry — that is what the plan means by handling numeric
 * and string members separately. The reverse key is the member's value rendered as a string, since a
 * property key is always a string; `undefined` becomes `"undefined"`, matching the quirk above.
 */
function lowerEnumValue(declaration: ts.EnumDeclaration): Produced<JsIrRuntimeObjectValue> {
  const members = enumMemberValues(declaration.members);
  if (members.kind !== "lowered") {
    return members;
  }
  const fields: JsIrRuntimeObjectField[] = [];
  for (const member of members.operation) {
    fields.push({
      kind: "field",
      key: { kind: "literal", value: member.name },
      value: enumMemberValueExpression(member.value)
    });
    if (typeof member.value === "number") {
      fields.push({
        kind: "field",
        key: { kind: "literal", value: String(member.value) },
        value: { kind: "string", value: { kind: "literal", value: member.name } }
      });
    } else if (member.value === undefined) {
      fields.push({
        kind: "field",
        key: { kind: "literal", value: "undefined" },
        value: { kind: "string", value: { kind: "literal", value: member.name } }
      });
    }
  }
  return produced({ fields });
}

function enumMemberValueExpression(value: number | string | undefined): JsIrValueExpression {
  if (typeof value === "number") {
    return { kind: "number", value: { kind: "literal", value } };
  }
  if (typeof value === "string") {
    return { kind: "string", value: { kind: "literal", value } };
  }
  return { kind: "undefined" };
}

/** `enum E { .. }` as the object-literal statement that binds `E`. */
export function lowerEnumDeclarationStatement(declaration: ts.EnumDeclaration): Lowered {
  const { name } = declaration;
  const value = lowerEnumValue(declaration);
  if (value.kind !== "lowered") {
    return unsupportedIn(value.reason);
  }
  return loweredOperation({ kind: "runtimeObjectLiteral", name: name.text, value: value.operation });
}
