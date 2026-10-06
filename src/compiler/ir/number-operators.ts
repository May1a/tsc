import ts from "typescript";
import type { JsIrNumberOperator } from "./expressions.js";

export function lowerNumberOperator(kind: ts.SyntaxKind): JsIrNumberOperator | undefined {
  switch (kind) {
    case ts.SyntaxKind.PlusToken: {
      return "add";
    }
    case ts.SyntaxKind.MinusToken: {
      return "subtract";
    }
    case ts.SyntaxKind.AsteriskToken: {
      return "multiply";
    }
    case ts.SyntaxKind.SlashToken: {
      return "divide";
    }
    case ts.SyntaxKind.PercentToken: {
      return "remainder";
    }
    case ts.SyntaxKind.AmpersandToken: {
      return "bitAnd";
    }
    case ts.SyntaxKind.BarToken: {
      return "bitOr";
    }
    case ts.SyntaxKind.CaretToken: {
      return "bitXor";
    }
    case ts.SyntaxKind.LessThanLessThanToken: {
      return "shiftLeft";
    }
    case ts.SyntaxKind.GreaterThanGreaterThanToken: {
      return "shiftRight";
    }
    case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken: {
      return "shiftRightUnsigned";
    }
    case ts.SyntaxKind.AsteriskAsteriskToken: {
      return "power";
    }
    default: {
      return undefined;
    }
  }
}
