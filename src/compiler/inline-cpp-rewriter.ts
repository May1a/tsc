export const inlineCppTag = "__tscn_inline_cpp";
export const inlineCppMarker = "@cpp";

export function isInlineCppMarkerAt(source: string, index: number): boolean {
  return source.startsWith(`${inlineCppMarker}\``, index);
}

export function hasInlineCppMarker(source: string): boolean {
  // Use the rewriter for precise context-aware check; fast-path avoids full copy
  // when the substring never appears.
  if (!source.includes(`${inlineCppMarker}\``)) {
    return false;
  }
  return rewriteInlineCppSyntax(source) !== source;
}

export function rewriteInlineCppSyntax(source: string): string {
  return new Scanner(source).scan();
}

class Scanner {
  private readonly source: string;
  private readonly length: number;
  private pos = 0;
  private readonly out: string[] = [];

  public constructor(source: string) {
    this.source = source;
    this.length = source.length;
  }

  public scan(): string {
    this.scanCode(false);
    return this.out.join("");
  }

  private scanCode(stopAtPlaceholderEnd: boolean): void {
    let braceDepth = 0;

    while (this.pos < this.length) {
      const ch = this.source[this.pos];

      if (stopAtPlaceholderEnd && ch === "}" && braceDepth === 0) {
        return;
      }

      if (isInlineCppMarkerAt(this.source, this.pos)) {
        this.out.push(inlineCppTag);
        this.pos += inlineCppMarker.length;
        continue;
      }

      if (ch === '"' || ch === "'") {
        this.emitQuotedString(ch);
        continue;
      }

      if (ch === "`") {
        this.emitTemplateLiteral();
        continue;
      }

      if (ch === "/" && this.source[this.pos + 1] === "/") {
        this.emitLineComment();
        continue;
      }

      if (ch === "/" && this.source[this.pos + 1] === "*") {
        this.emitBlockComment();
        continue;
      }

      if (stopAtPlaceholderEnd && ch === "{") {
        braceDepth += 1;
      } else if (stopAtPlaceholderEnd && ch === "}") {
        braceDepth -= 1;
      }

      this.out.push(ch);
      this.pos += 1;
    }
  }

  private emitQuotedString(quote: string): void {
    const start = this.pos;
    this.pos += 1;
    while (this.pos < this.length) {
      const ch = this.source[this.pos];
      if (ch === "\\") {
        this.pos += 2;
        continue;
      }
      if (ch === quote) {
        this.pos += 1;
        break;
      }
      this.pos += 1;
    }
    this.out.push(this.source.slice(start, this.pos));
  }

  private emitLineComment(): void {
    const start = this.pos;
    const nl = this.source.indexOf("\n", this.pos + 2);
    if (nl === -1) {
      this.pos = this.length;
    } else {
      this.pos = nl;
    }
    this.out.push(this.source.slice(start, this.pos));
  }

  private emitBlockComment(): void {
    const start = this.pos;
    const end = this.source.indexOf("*/", this.pos + 2);
    if (end === -1) {
      this.pos = this.length;
    } else {
      this.pos = end + 2;
    }
    this.out.push(this.source.slice(start, this.pos));
  }

  private emitTemplateLiteral(): void {
    this.out.push("`");
    this.pos += 1;

    while (this.pos < this.length) {
      const ch = this.source[this.pos];

      if (ch === "\\") {
        this.out.push(this.source.slice(this.pos, this.pos + 2));
        this.pos += 2;
        continue;
      }

      if (ch === "`") {
        this.out.push("`");
        this.pos += 1;
        return;
      }

      if (ch === "$" && this.source[this.pos + 1] === "{") {
        this.out.push("${");
        this.pos += 2;
        this.scanCode(true);
        if (this.pos < this.length && this.source[this.pos] === "}") {
          this.out.push("}");
          this.pos += 1;
        }
        continue;
      }

      this.out.push(ch);
      this.pos += 1;
    }
  }
}
