// oxlint-disable eslint/no-template-curly-in-string, eslint/no-undef, eslint/prefer-template, eslint/no-magic-numbers -- test file: source literals contain ${}, vitest globals, and intentional string concatenation
import { hasInlineCppMarker, inlineCppMarker, inlineCppTag, isInlineCppMarkerAt, rewriteInlineCppSyntax } from "../../src/compiler/inline-cpp-rewriter.js";

function expectRewrite(input: string, expected: string): void {
  const actual = rewriteInlineCppSyntax(input);
  expect(actual).toBe(expected);
  const shouldHaveMarker = actual !== input && expected !== input;
  // hasInlineCppMarker is true iff rewriting changed the input
  // (i.e. there was at least one rewritable marker)
  expect(hasInlineCppMarker(input)).toBe(shouldHaveMarker);
  if (expected !== input) {
    // if expected contains the tag, the rewritten output should still report false for hasInlineCppMarker? No, after rewrite it contains __tscn_inline_cpp` but not @cpp`, so hasInlineCppMarker on output should be false
    expect(hasInlineCppMarker(actual)).toBe(false);
  }
}

describe("inline-cpp-rewriter: exports", () => {
  test("exports correct constants", () => {
    expect(inlineCppMarker).toBe("@cpp");
    expect(inlineCppTag).toBe("__tscn_inline_cpp");
  });
});

describe("inline-cpp-rewriter: basic rewrite", () => {
  test("rewrites plain marker", () => {
    expectRewrite("const x = @cpp`code`;", "const x = __tscn_inline_cpp`code`;");
  });

  test("rewrites marker at start of file", () => {
    expectRewrite("@cpp`hello`", "__tscn_inline_cpp`hello`");
  });

  test("rewrites marker at end of file", () => {
    expectRewrite("const x = @cpp`end`", "const x = __tscn_inline_cpp`end`");
  });

  test("rewrites empty template after marker", () => {
    expectRewrite("@cpp``", "__tscn_inline_cpp``");
  });

  test("does not rewrite @cpp without backtick", () => {
    expectRewrite("const x = @cpp;", "const x = @cpp;");
    expectRewrite("@cpp ", "@cpp ");
    expectRewrite("@cpp", "@cpp");
  });

  test("does not rewrite @cpp followed by space then backtick", () => {
    expectRewrite("@cpp `", "@cpp `");
  });

  test("does not rewrite similar prefix @cppx`", () => {
    expectRewrite("@cppx`", "@cppx`");
  });

  test("rewrites marker with surrounding code and newlines", () => {
    expectRewrite("let a = 1;\n@cpp`int x = 0;`\nlet b = 2;", "let a = 1;\n__tscn_inline_cpp`int x = 0;`\nlet b = 2;");
  });
});

describe("inline-cpp-rewriter: no rewrite in excluded contexts", () => {
  test("single-quoted string stays", () => {
    expectRewrite("'@cpp`'", "'@cpp`'");
  });

  test("double-quoted string stays", () => {
    expectRewrite('"@cpp`"', '"@cpp`"');
  });

  test("template quasi stays (simple)", () => {
    expectRewrite("`@cpp``", "`@cpp``");
  });

  test("template quasi with surrounding text stays", () => {
    expectRewrite("`a @cpp` b`", "`a @cpp` b`");
  });

  test("line comment stays until newline", () => {
    expectRewrite("// @cpp`", "// @cpp`");
  });

  test("line comment with trailing newline keeps newline and marker inside comment", () => {
    expectRewrite("// @cpp`\nconst x = 1;", "// @cpp`\nconst x = 1;");
  });

  test("line comment followed by rewritable marker on next line", () => {
    expectRewrite("// @cpp`\n@cpp`x`", "// @cpp`\n__tscn_inline_cpp`x`");
  });

  test("block comment stays", () => {
    expectRewrite("/* @cpp` */", "/* @cpp` */");
  });

  test("block comment with multiple markers stays", () => {
    expectRewrite("/* @cpp` @cpp` */", "/* @cpp` @cpp` */");
  });

  test("marker after block comment rewrites", () => {
    expectRewrite("/* comment */ @cpp`x`", "/* comment */ __tscn_inline_cpp`x`");
  });

  test("marker before block comment rewrites only outside", () => {
    expectRewrite("@cpp`a` /* @cpp` */", "__tscn_inline_cpp`a` /* @cpp` */");
  });

  test("single-quoted string with marker and following rewritable marker", () => {
    expectRewrite("'@cpp`' + @cpp`x`", "'@cpp`' + __tscn_inline_cpp`x`");
  });

  test("double-quoted string with marker and following rewritable marker", () => {
    expectRewrite('"@cpp`" + @cpp`y`', '"@cpp`" + __tscn_inline_cpp`y`');
  });
});

describe("inline-cpp-rewriter: rewrite inside template placeholders", () => {
  test("simple placeholder rewrite", () => {
    expectRewrite("`a ${@cpp`x`} b`", "`a ${__tscn_inline_cpp`x`} b`");
  });

  test("quasi parts not rewritten even when placeholder is rewritten", () => {
    // quasi text without backtick stays, placeholder rewrites
    expectRewrite("`foo ${@cpp`x`} bar`", "`foo ${__tscn_inline_cpp`x`} bar`");
    // marker that appears to be in quasi actually terminates the template, so it becomes
    // top-level code and DOES rewrite – verify that behaviour
    expectRewrite("`@cpp` ${@cpp`x`} @cpp` `", "`@cpp` ${__tscn_inline_cpp`x`} __tscn_inline_cpp` `");
  });

  test("template with multiple fragments and marker after template", () => {
    expectRewrite("`a ${'hello'} @cpp`x`}`", "`a ${'hello'} @cpp`x`}`");
    // actual marker after template should rewrite – separate test
    expectRewrite("`a ${'hello'}`; @cpp`x`", "`a ${'hello'}`; __tscn_inline_cpp`x`");
  });

  test("nested template inside placeholder with marker", () => {
    expectRewrite("`outer ${ `inner ${@cpp`code`} ` }`", "`outer ${ `inner ${__tscn_inline_cpp`code`} ` }`");
  });

  test("placeholder containing single-quoted string with marker does NOT rewrite", () => {
    expectRewrite("`a ${ '@cpp`' }`", "`a ${ '@cpp`' }`");
  });

  test("placeholder containing double-quoted string with marker does NOT rewrite", () => {
    expectRewrite('`a ${ "@cpp`" }`', '`a ${ "@cpp`" }`');
  });

  test("placeholder containing line comment with marker does NOT rewrite", () => {
    expectRewrite("`a ${ // @cpp`\n }`", "`a ${ // @cpp`\n }`");
  });

  test("placeholder containing block comment with marker does NOT rewrite", () => {
    expectRewrite("`a ${ /* @cpp` */ }`", "`a ${ /* @cpp` */ }`");
  });

  test("placeholder with braces and marker", () => {
    expectRewrite("`a ${ { x: @cpp`y` } }`", "`a ${ { x: __tscn_inline_cpp`y` } }`");
  });

  test("placeholder with nested braces", () => {
    expectRewrite("`a ${ { a: { b: @cpp`z` } } }`", "`a ${ { a: { b: __tscn_inline_cpp`z` } } }`");
  });

  test("multiple placeholders in one template", () => {
    expectRewrite("`${@cpp`a`} ${@cpp`b`}`", "`${__tscn_inline_cpp`a`} ${__tscn_inline_cpp`b`}`");
  });

  test("placeholder with template literal inside whose quasi contains marker (no rewrite in quasi)", () => {
    expectRewrite("`a ${ `quasi @cpp` stays` }`", "`a ${ `quasi @cpp` stays` }`");
  });

  test("placeholder with template inside whose placeholder rewrites", () => {
    expectRewrite("`a ${ `x ${@cpp`y`} z` }`", "`a ${ `x ${__tscn_inline_cpp`y`} z` }`");
  });

  test("deeply nested placeholders", () => {
    expectRewrite("`a ${ `b ${ `c ${@cpp`d`} ` }` }`", "`a ${ `b ${ `c ${__tscn_inline_cpp`d`} ` }` }`");
  });

  test("placeholder line comment does not bleed beyond newline", () => {
    expectRewrite("`a ${ // @cpp`\n@cpp`x` }`", "`a ${ // @cpp`\n__tscn_inline_cpp`x` }`");
  });
});

describe("inline-cpp-rewriter: escapes", () => {
  test("escaped single quote does not terminate single-quoted string", () => {
    expectRewrite("'a \\' @cpp`'", "'a \\' @cpp`'");
    expectRewrite("'a \\' still @cpp`' + @cpp`x`", "'a \\' still @cpp`' + __tscn_inline_cpp`x`");
  });

  test("escaped double quote does not terminate double-quoted string", () => {
    expectRewrite('"a \\" @cpp`"', '"a \\" @cpp`"');
    expectRewrite('"a \\" still @cpp`" + @cpp`y`', '"a \\" still @cpp`" + __tscn_inline_cpp`y`');
  });

  test("escaped backtick inside quasi does not close quasi", () => {
    expectRewrite("`a \\` @cpp` b`", "`a \\` @cpp` b`");
  });

  test("escaped dollar does not start placeholder", () => {
    expectRewrite("`a \\${ notPlaceholder } @cpp` b`", "`a \\${ notPlaceholder } @cpp` b`");
  });

  test("escaped backslash inside string", () => {
    expectRewrite("'\\\\' + @cpp`x`", "'\\\\' + __tscn_inline_cpp`x`");
  });

  test("escaped backslash inside template quasi with marker after", () => {
    expectRewrite("`\\\\` + @cpp`x`", "`\\\\` + __tscn_inline_cpp`x`");
  });

  test("single-quoted string with escaped backslash and marker inside stays", () => {
    expectRewrite("'\\\\ @cpp`'", "'\\\\ @cpp`'");
  });
});

describe("inline-cpp-rewriter: unterminated contexts", () => {
  test("unclosed single-quoted string copies to EOF without rewrite", () => {
    expectRewrite("'unclosed @cpp`", "'unclosed @cpp`");
  });

  test("unclosed double-quoted string copies to EOF", () => {
    expectRewrite('"unclosed @cpp`', '"unclosed @cpp`');
  });

  test("unclosed block comment copies to EOF", () => {
    expectRewrite("/* unclosed @cpp`", "/* unclosed @cpp`");
  });

  test("unclosed template literal copies to EOF and hides marker in quasi", () => {
    expectRewrite("`unclosed @cpp`", "`unclosed @cpp`");
  });

  test("unclosed template with placeholder containing rewritable marker", () => {
    // scanner will scan placeholder code even though outer template never closes
    expectRewrite("`unclosed ${@cpp`code`", "`unclosed ${__tscn_inline_cpp`code`");
  });

  test("unclosed line comment at EOF", () => {
    expectRewrite("code // unclosed @cpp`", "code // unclosed @cpp`");
  });

  test("unclosed string with newline still hides subsequent marker? Actually string terminated by EOF, newline inside string is literal", () => {
    // 'unclosed newline is still inside string until EOF, so second marker is also hidden
    expectRewrite("'unclosed \n @cpp`", "'unclosed \n @cpp`");
  });
});

describe("inline-cpp-rewriter: multiple markers and edge positions", () => {
  test("multiple markers in plain code", () => {
    expectRewrite(" @cpp`a` @cpp`b` ", " __tscn_inline_cpp`a` __tscn_inline_cpp`b` ");
  });

  test("adjacent markers", () => {
    expectRewrite("@cpp`a`@cpp`b`", "__tscn_inline_cpp`a`__tscn_inline_cpp`b`");
  });

  test("three markers", () => {
    expectRewrite("@cpp`a` @cpp`b` @cpp`c`", "__tscn_inline_cpp`a` __tscn_inline_cpp`b` __tscn_inline_cpp`c`");
  });

  test("marker at start adjacent to code", () => {
    expectRewrite("@cpp`x`; let y = 1;", "__tscn_inline_cpp`x`; let y = 1;");
  });

  test("marker between tokens without spaces", () => {
    expectRewrite("let a=@cpp`x`;", "let a=__tscn_inline_cpp`x`;");
  });

  test("marker inside line comment after code does not rewrite, marker on next line does", () => {
    expectRewrite("code // @cpp`\n@cpp`x`", "code // @cpp`\n__tscn_inline_cpp`x`");
  });

  test("empty input stays empty", () => {
    expectRewrite("", "");
  });

  test("input without any marker stays", () => {
    expectRewrite("const x = 1;", "const x = 1;");
  });

  test("input with @cpp but no backtick stays and hasInlineCppMarker false", () => {
    expectRewrite("const x = @cpp;", "const x = @cpp;");
    expect(hasInlineCppMarker("@cpp")).toBe(false);
    expect(hasInlineCppMarker("@cpp ")).toBe(false);
    expect(hasInlineCppMarker("@cpp `")).toBe(false);
  });

  test("lone @cpp` rewrites", () => {
    expectRewrite("@cpp`", "__tscn_inline_cpp`");
    expect(hasInlineCppMarker("@cpp`")).toBe(true);
  });
});

describe("inline-cpp-rewriter: hasInlineCppMarker and isInlineCppMarkerAt helpers", () => {
  test("hasInlineCppMarker true for rewritable plain marker", () => {
    expect(hasInlineCppMarker("@cpp`x`")).toBe(true);
    expect(hasInlineCppMarker(" @cpp`a` ")).toBe(true);
  });

  test("hasInlineCppMarker false when marker only in single-quoted string", () => {
    expect(hasInlineCppMarker("'@cpp`'")).toBe(false);
  });

  test("hasInlineCppMarker false when marker only in double-quoted string", () => {
    expect(hasInlineCppMarker('"@cpp`"')).toBe(false);
  });

  test("hasInlineCppMarker false when marker only in line comment", () => {
    expect(hasInlineCppMarker("// @cpp`")).toBe(false);
  });

  test("hasInlineCppMarker false when marker only in block comment", () => {
    expect(hasInlineCppMarker("/* @cpp` */")).toBe(false);
  });

  test("hasInlineCppMarker false when marker only in template quasi", () => {
    expect(hasInlineCppMarker("`@cpp` `")).toBe(false);
    expect(hasInlineCppMarker("`a @cpp` b`")).toBe(false);
  });

  test("hasInlineCppMarker true when marker inside placeholder", () => {
    expect(hasInlineCppMarker("`a ${@cpp`x`} b`")).toBe(true);
  });

  test("hasInlineCppMarker false when marker inside placeholder string", () => {
    expect(hasInlineCppMarker("`a ${ '@cpp`' }`")).toBe(false);
  });

  test("hasInlineCppMarker false for @cpp without backtick", () => {
    expect(hasInlineCppMarker("@cpp")).toBe(false);
    expect(hasInlineCppMarker("@cpp ")).toBe(false);
    expect(hasInlineCppMarker("no marker")).toBe(false);
  });

  test("isInlineCppMarkerAt detects marker at correct index", () => {
    expect(isInlineCppMarkerAt("@cpp`", 0)).toBe(true);
    expect(isInlineCppMarkerAt(" @cpp`", 1)).toBe(true);
    expect(isInlineCppMarkerAt("@cpp`", 1)).toBe(false);
    expect(isInlineCppMarkerAt("@@cpp`", 1)).toBe(true);
  });

  test("isInlineCppMarkerAt false when not at marker or missing backtick", () => {
    expect(isInlineCppMarkerAt("@cpp ", 0)).toBe(false);
    expect(isInlineCppMarkerAt("@cpp", 0)).toBe(false);
    expect(isInlineCppMarkerAt("", 0)).toBe(false);
    expect(isInlineCppMarkerAt("@cpp`", 5)).toBe(false);
  });

  test("isInlineCppMarkerAt is naive: returns true even inside string context", () => {
    const src = "'@cpp`'";
    // index 1 is where @ starts inside the string literal
    expect(isInlineCppMarkerAt(src, 1)).toBe(true);
    // but hasInlineCppMarker correctly returns false for that source
    expect(hasInlineCppMarker(src)).toBe(false);
  });

  test("isInlineCppMarkerAt negative and out-of-bounds indices", () => {
    expect(isInlineCppMarkerAt("@cpp`", 100)).toBe(false);
    // String.prototype.startsWith clamps negative index to 0, so -1 behaves like 0
    expect(isInlineCppMarkerAt("@cpp`", -1)).toBe(true);
    expect(isInlineCppMarkerAt("@cpp`", -100)).toBe(true);
    expect(isInlineCppMarkerAt("", -1)).toBe(false);
  });
});

describe("inline-cpp-rewriter: idempotence and invariants", () => {
  test("rewrite is idempotent for various inputs", () => {
    const cases = [
      "const x = @cpp`code`;",
      "'@cpp`'",
      '"@cpp`"',
      "`@cpp` `",
      "`a ${@cpp`x`} b`",
      "`a ${ '@cpp`' }`",
      "`outer ${ `inner ${@cpp`code`} ` }`",
      "/* @cpp` */ @cpp`x`",
      "// @cpp`\n@cpp`y`",
      " @cpp`a` @cpp`b` ",
      "`a \\` @cpp` b`",
      "'a \\' @cpp`'",
      "/* unclosed @cpp`",
      "`unclosed ${@cpp`code`",
      "",
      "@cpp``",
      "`a ${ { x: @cpp`y` } }`",
      "`${@cpp`a`} ${@cpp`b`}`",
    ];
    for (const input of cases) {
      const once = rewriteInlineCppSyntax(input);
      const twice = rewriteInlineCppSyntax(once);
      expect(twice).toBe(once);
    }
  });

  test("rewrite never introduces new @cpp` substring", () => {
    const inputs = ["@cpp`x`", "`a ${@cpp`y`} b`", " @cpp`a` @cpp`b` "];
    for (const input of inputs) {
      const out = rewriteInlineCppSyntax(input);
      // output should not contain literal "@cpp`" if it was rewritten
      // but if input had marker inside excluded context, output retains it – but then hasInlineCppMarker false
      // we check that output never has a rewritable marker left
      expect(hasInlineCppMarker(out)).toBe(false);
    }
  });

  test("rewritten output contains tag where input had rewritable marker", () => {
    const input = "let a = @cpp`x`;";
    const out = rewriteInlineCppSyntax(input);
    expect(out).toContain(inlineCppTag + "`");
    expect(out).not.toContain(inlineCppMarker + "`");
  });

  test("non-rewritable input preserves exact string", () => {
    const input = "'@cpp`' // @cpp`\n/* @cpp` */ `a @cpp` b`";
    expect(rewriteInlineCppSyntax(input)).toBe(input);
  });
});
