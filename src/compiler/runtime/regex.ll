; Runtime RegExp object keys.
@.regex.source = private unnamed_addr constant [7 x i8] c"source\00"
@.regex.flags = private unnamed_addr constant [6 x i8] c"flags\00"
@.regex.global = private unnamed_addr constant [7 x i8] c"global\00"
@.regex.ignore.case = private unnamed_addr constant [11 x i8] c"ignoreCase\00"
@.regex.multiline = private unnamed_addr constant [10 x i8] c"multiline\00"
@.regex.sticky = private unnamed_addr constant [7 x i8] c"sticky\00"
@.regex.last.index = private unnamed_addr constant [10 x i8] c"lastIndex\00"
@.regex.index = private unnamed_addr constant [6 x i8] c"index\00"
@.regex.input = private unnamed_addr constant [6 x i8] c"input\00"
@.regex.syntax.error.name = private unnamed_addr constant [12 x i8] c"SyntaxError\00"
@.regex.syntax.error.prefix = private unnamed_addr constant [30 x i8] c"Invalid regular expression: /\00"
@.regex.syntax.error.suffix = private unnamed_addr constant [32 x i8] c"/: Unterminated character class\00"
@regex.capture.starts = internal global [10 x i64] zeroinitializer
@regex.capture.ends = internal global [10 x i64] zeroinitializer
define i1 @regexValid(ptr %pattern, i64 %plen, ptr %flags, i64 %flen) {
entry:
  %flag.position.addr = alloca i64
  %flag.mask.addr = alloca i64
  store i64 0, ptr %flag.position.addr
  store i64 0, ptr %flag.mask.addr
  br label %flags.loop
flags.loop:
  %flag.position = load i64, ptr %flag.position.addr
  %flags.done = icmp uge i64 %flag.position, %flen
  br i1 %flags.done, label %pattern.init, label %flag
flag:
  %flag.ptr = getelementptr i8, ptr %flags, i64 %flag.position
  %flag.ch = load i8, ptr %flag.ptr
  %flag.g = icmp eq i8 %flag.ch, 103
  %flag.i = icmp eq i8 %flag.ch, 105
  %flag.m = icmp eq i8 %flag.ch, 109
  %flag.u = icmp eq i8 %flag.ch, 117
  %flag.y = icmp eq i8 %flag.ch, 121
  %known.0 = or i1 %flag.g, %flag.i
  %known.1 = or i1 %flag.m, %flag.u
  %known.2 = or i1 %known.0, %known.1
  %known = or i1 %known.2, %flag.y
  br i1 %known, label %flag.bit, label %invalid
flag.bit:
  %bit.g = select i1 %flag.g, i64 1, i64 0
  %bit.i = select i1 %flag.i, i64 2, i64 0
  %bit.m = select i1 %flag.m, i64 4, i64 0
  %bit.u = select i1 %flag.u, i64 8, i64 0
  %bit.y = select i1 %flag.y, i64 16, i64 0
  %bit.0 = or i64 %bit.g, %bit.i
  %bit.1 = or i64 %bit.m, %bit.u
  %bit.2 = or i64 %bit.0, %bit.1
  %bit = or i64 %bit.2, %bit.y
  %mask = load i64, ptr %flag.mask.addr
  %seen.bits = and i64 %mask, %bit
  %duplicate = icmp ne i64 %seen.bits, 0
  br i1 %duplicate, label %invalid, label %flag.step
flag.step:
  %next.mask = or i64 %mask, %bit
  %next.flag.position = add i64 %flag.position, 1
  store i64 %next.mask, ptr %flag.mask.addr
  store i64 %next.flag.position, ptr %flag.position.addr
  br label %flags.loop
pattern.init:
  %position.addr = alloca i64
  %class.addr = alloca i1
  %escape.addr = alloca i1
  %depth.addr = alloca i64
  store i64 0, ptr %position.addr
  store i1 false, ptr %class.addr
  store i1 false, ptr %escape.addr
  store i64 0, ptr %depth.addr
  br label %pattern.loop
pattern.loop:
  %position = load i64, ptr %position.addr
  %pattern.done = icmp uge i64 %position, %plen
  br i1 %pattern.done, label %pattern.finish, label %pattern.character
pattern.character:
  %pointer = getelementptr i8, ptr %pattern, i64 %position
  %character = load i8, ptr %pointer
  %escaped = load i1, ptr %escape.addr
  br i1 %escaped, label %pattern.clear.escape, label %pattern.syntax
pattern.clear.escape:
  store i1 false, ptr %escape.addr
  br label %pattern.step
pattern.syntax:
  %is.escape = icmp eq i8 %character, 92
  br i1 %is.escape, label %pattern.set.escape, label %pattern.class.start.check
pattern.set.escape:
  store i1 true, ptr %escape.addr
  br label %pattern.step
pattern.class.start.check:
  %in.class = load i1, ptr %class.addr
  %is.class.start = icmp eq i8 %character, 91
  %outside.class = xor i1 %in.class, true
  %start.class = and i1 %is.class.start, %outside.class
  br i1 %start.class, label %pattern.set.class, label %pattern.class.end.check
pattern.set.class:
  store i1 true, ptr %class.addr
  br label %pattern.step
pattern.class.end.check:
  %is.class.end = icmp eq i8 %character, 93
  br i1 %is.class.end, label %pattern.clear.class, label %pattern.group.check
pattern.clear.class:
  br i1 %in.class, label %pattern.clear.class.valid, label %invalid
pattern.clear.class.valid:
  store i1 false, ptr %class.addr
  br label %pattern.step
pattern.group.check:
  br i1 %in.class, label %pattern.step, label %pattern.group
pattern.group:
  %is.open = icmp eq i8 %character, 40
  %is.close = icmp eq i8 %character, 41
  %depth = load i64, ptr %depth.addr
  br i1 %is.open, label %pattern.open, label %pattern.close.check
pattern.open:
  %deeper = add i64 %depth, 1
  store i64 %deeper, ptr %depth.addr
  br label %pattern.step
pattern.close.check:
  br i1 %is.close, label %pattern.close, label %pattern.step
pattern.close:
  %can.close = icmp ugt i64 %depth, 0
  br i1 %can.close, label %pattern.close.valid, label %invalid
pattern.close.valid:
  %shallower = sub i64 %depth, 1
  store i64 %shallower, ptr %depth.addr
  br label %pattern.step
pattern.step:
  %next.position = add i64 %position, 1
  store i64 %next.position, ptr %position.addr
  br label %pattern.loop
pattern.finish:
  %final.class = load i1, ptr %class.addr
  %final.escape = load i1, ptr %escape.addr
  %final.depth = load i64, ptr %depth.addr
  %depth.valid = icmp eq i64 %final.depth, 0
  %class.valid = xor i1 %final.class, true
  %escape.valid = xor i1 %final.escape, true
  %valid.0 = and i1 %depth.valid, %class.valid
  %valid = and i1 %valid.0, %escape.valid
  ret i1 %valid
invalid:
  ret i1 false
}
define { i64, i1 } @regexCompile(i64 %pattern, i64 %flags) {
entry:
  %flags.ptr = call ptr @valueStringPtr(i64 %flags)
  %flags.len = call i64 @valueStringLength(i64 %flags)
  %pattern.ptr = call ptr @valueStringPtr(i64 %pattern)
  %pattern.len = call i64 @valueStringLength(i64 %pattern)
  %valid = call i1 @regexValid(ptr %pattern.ptr, i64 %pattern.len, ptr %flags.ptr, i64 %flags.len)
  br i1 %valid, label %build, label %invalid
invalid:
  %message.prefix = call ptr @strConcat(i64 29, ptr @.regex.syntax.error.prefix, i64 %pattern.len, ptr %pattern.ptr)
  %message.prefix.len = add i64 29, %pattern.len
  %message.ptr = call ptr @strConcat(i64 %message.prefix.len, ptr %message.prefix, i64 31, ptr @.regex.syntax.error.suffix)
  %message.len = add i64 %message.prefix.len, 31
  %message = call i64 @valueBoxString(ptr %message.ptr, i64 %message.len)
  %error = call ptr @errorNew(i64 6, i64 11, ptr @.regex.syntax.error.name, i64 %message)
  %error.value = call i64 @valueBoxObject(ptr %error)
  %invalid.result.0 = insertvalue { i64, i1 } undef, i64 %error.value, 0
  %invalid.result = insertvalue { i64, i1 } %invalid.result.0, i1 true, 1
  ret { i64, i1 } %invalid.result
build:
  %object = call ptr @objectNew(i64 8)
  call void @objectSet(ptr %object, i64 6, ptr @.regex.source, i64 %pattern)
  call void @objectSet(ptr %object, i64 5, ptr @.regex.flags, i64 %flags)
  %i.addr = alloca i64
  %global.addr = alloca i1
  %ignore.addr = alloca i1
  %multiline.addr = alloca i1
  %sticky.addr = alloca i1
  store i64 0, ptr %i.addr
  store i1 false, ptr %global.addr
  store i1 false, ptr %ignore.addr
  store i1 false, ptr %multiline.addr
  store i1 false, ptr %sticky.addr
  br label %scan
scan:
  %i = load i64, ptr %i.addr
  %more = icmp ult i64 %i, %flags.len
  br i1 %more, label %scan.body, label %finish
scan.body:
  %ch.ptr = getelementptr i8, ptr %flags.ptr, i64 %i
  %ch = load i8, ptr %ch.ptr
  %is.g = icmp eq i8 %ch, 103
  %is.i = icmp eq i8 %ch, 105
  %is.m = icmp eq i8 %ch, 109
  %is.y = icmp eq i8 %ch, 121
  br i1 %is.g, label %set.g, label %check.i
set.g:
  store i1 true, ptr %global.addr
  br label %step
check.i:
  br i1 %is.i, label %set.i, label %check.m
set.i:
  store i1 true, ptr %ignore.addr
  br label %step
check.m:
  br i1 %is.m, label %set.m, label %check.y
set.m:
  store i1 true, ptr %multiline.addr
  br label %step
check.y:
  br i1 %is.y, label %set.y, label %step
set.y:
  store i1 true, ptr %sticky.addr
  br label %step
step:
  %next = add i64 %i, 1
  store i64 %next, ptr %i.addr
  br label %scan
finish:
  %global = load i1, ptr %global.addr
  %ignore = load i1, ptr %ignore.addr
  %multiline = load i1, ptr %multiline.addr
  %sticky = load i1, ptr %sticky.addr
  %global.value = select i1 %global, i64 9222246136947933186, i64 9222246136947933185
  %ignore.value = select i1 %ignore, i64 9222246136947933186, i64 9222246136947933185
  %multiline.value = select i1 %multiline, i64 9222246136947933186, i64 9222246136947933185
  %sticky.value = select i1 %sticky, i64 9222246136947933186, i64 9222246136947933185
  %zero = call i64 @valueBoxNumber(double 0.0)
  call void @objectSet(ptr %object, i64 6, ptr @.regex.global, i64 %global.value)
  call void @objectSet(ptr %object, i64 10, ptr @.regex.ignore.case, i64 %ignore.value)
  call void @objectSet(ptr %object, i64 9, ptr @.regex.multiline, i64 %multiline.value)
  call void @objectSet(ptr %object, i64 6, ptr @.regex.sticky, i64 %sticky.value)
  call void @objectSet(ptr %object, i64 9, ptr @.regex.last.index, i64 %zero)
  %boxed = call i64 @valueBoxObject(ptr %object)
  %result.0 = insertvalue { i64, i1 } undef, i64 %boxed, 0
  %result = insertvalue { i64, i1 } %result.0, i1 false, 1
  ret { i64, i1 } %result
}
define i64 @regexAtomEnd(ptr %pattern, i64 %plen, i64 %pi) {
entry:
  %p = getelementptr i8, ptr %pattern, i64 %pi
  %ch = load i8, ptr %p
  %escape = icmp eq i8 %ch, 92
  br i1 %escape, label %escaped, label %class.check
escaped:
  %escaped.end = add i64 %pi, 2
  ret i64 %escaped.end
class.check:
  %class = icmp eq i8 %ch, 91
  br i1 %class, label %class.init, label %single
single:
  %single.wide = zext i8 %ch to i64
  %single.ascii.bits = and i64 %single.wide, 128
  %single.ascii = icmp eq i64 %single.ascii.bits, 0
  %single.two.bits = and i64 %single.wide, 224
  %single.two = icmp eq i64 %single.two.bits, 192
  %single.three.bits = and i64 %single.wide, 240
  %single.three = icmp eq i64 %single.three.bits, 224
  %single.non.ascii.width = select i1 %single.two, i64 2, i64 4
  %single.encoded.width = select i1 %single.three, i64 3, i64 %single.non.ascii.width
  %single.width = select i1 %single.ascii, i64 1, i64 %single.encoded.width
  %single.end = add i64 %pi, %single.width
  ret i64 %single.end
class.init:
  %start = add i64 %pi, 1
  br label %class.loop
class.loop:
  %i = phi i64 [ %start, %class.init ], [ %next, %class.step ]
  %in.range = icmp ult i64 %i, %plen
  br i1 %in.range, label %class.body, label %class.unclosed
class.body:
  %cp = getelementptr i8, ptr %pattern, i64 %i
  %cc = load i8, ptr %cp
  %close = icmp eq i8 %cc, 93
  br i1 %close, label %class.closed, label %class.step
class.step:
  %next = add i64 %i, 1
  br label %class.loop
class.closed:
  %closed.end = add i64 %i, 1
  ret i64 %closed.end
class.unclosed:
  ret i64 %plen
}
define i64 @regexDecodeUtf8(ptr %bytes, i64 %position) {
entry:
  %p0 = getelementptr i8, ptr %bytes, i64 %position
  %b0.raw = load i8, ptr %p0
  %b0 = zext i8 %b0.raw to i64
  %ascii = icmp ult i64 %b0, 128
  br i1 %ascii, label %return.ascii, label %encoded
encoded:
  %two.bits = and i64 %b0, 224
  %two = icmp eq i64 %two.bits, 192
  %three.bits = and i64 %b0, 240
  %three = icmp eq i64 %three.bits, 224
  br i1 %two, label %decode.two, label %decode.three.check
decode.two:
  %i1 = add i64 %position, 1
  %p1 = getelementptr i8, ptr %bytes, i64 %i1
  %b1.raw = load i8, ptr %p1
  %b1 = zext i8 %b1.raw to i64
  %two.high.raw = and i64 %b0, 31
  %two.high = shl i64 %two.high.raw, 6
  %two.low = and i64 %b1, 63
  %two.codepoint = or i64 %two.high, %two.low
  %two.width = shl i64 2, 32
  %two.result = or i64 %two.width, %two.codepoint
  ret i64 %two.result
decode.three.check:
  br i1 %three, label %decode.three, label %decode.four
decode.three:
  %three.i1 = add i64 %position, 1
  %three.i2 = add i64 %position, 2
  %three.p1 = getelementptr i8, ptr %bytes, i64 %three.i1
  %three.p2 = getelementptr i8, ptr %bytes, i64 %three.i2
  %three.b1.raw = load i8, ptr %three.p1
  %three.b2.raw = load i8, ptr %three.p2
  %three.b1 = zext i8 %three.b1.raw to i64
  %three.b2 = zext i8 %three.b2.raw to i64
  %three.a.raw = and i64 %b0, 15
  %three.a = shl i64 %three.a.raw, 12
  %three.b.raw = and i64 %three.b1, 63
  %three.b = shl i64 %three.b.raw, 6
  %three.c = and i64 %three.b2, 63
  %three.ab = or i64 %three.a, %three.b
  %three.codepoint = or i64 %three.ab, %three.c
  %three.width = shl i64 3, 32
  %three.result = or i64 %three.width, %three.codepoint
  ret i64 %three.result
decode.four:
  %four.i1 = add i64 %position, 1
  %four.i2 = add i64 %position, 2
  %four.i3 = add i64 %position, 3
  %four.p1 = getelementptr i8, ptr %bytes, i64 %four.i1
  %four.p2 = getelementptr i8, ptr %bytes, i64 %four.i2
  %four.p3 = getelementptr i8, ptr %bytes, i64 %four.i3
  %four.b1.raw = load i8, ptr %four.p1
  %four.b2.raw = load i8, ptr %four.p2
  %four.b3.raw = load i8, ptr %four.p3
  %four.b1 = zext i8 %four.b1.raw to i64
  %four.b2 = zext i8 %four.b2.raw to i64
  %four.b3 = zext i8 %four.b3.raw to i64
  %four.a.raw = and i64 %b0, 7
  %four.a = shl i64 %four.a.raw, 18
  %four.b.raw = and i64 %four.b1, 63
  %four.b = shl i64 %four.b.raw, 12
  %four.c.raw = and i64 %four.b2, 63
  %four.c = shl i64 %four.c.raw, 6
  %four.d = and i64 %four.b3, 63
  %four.ab = or i64 %four.a, %four.b
  %four.abc = or i64 %four.ab, %four.c
  %four.codepoint = or i64 %four.abc, %four.d
  %four.width = shl i64 4, 32
  %four.result = or i64 %four.width, %four.codepoint
  ret i64 %four.result
return.ascii:
  %ascii.width = shl i64 1, 32
  %ascii.result = or i64 %ascii.width, %b0
  ret i64 %ascii.result
}
define i1 @regexAtomMatches(ptr %pattern, i64 %plen, i64 %pi, ptr %subject, i64 %si, i64 %flag.bits) {
entry:
  %subject.decoded = call i64 @regexDecodeUtf8(ptr %subject, i64 %si)
  %subject.codepoint = and i64 %subject.decoded, 4294967295
  %subject.ch = trunc i64 %subject.codepoint to i8
  %p = getelementptr i8, ptr %pattern, i64 %pi
  %ch = load i8, ptr %p
  %escape = icmp eq i8 %ch, 92
  br i1 %escape, label %escaped, label %dot.check
escaped:
  %ei = add i64 %pi, 1
  %ep = getelementptr i8, ptr %pattern, i64 %ei
  %ec = load i8, ptr %ep
  %digit.class = icmp eq i8 %ec, 100
  %not.digit.class = icmp eq i8 %ec, 68
  %word.class = icmp eq i8 %ec, 119
  %not.word.class = icmp eq i8 %ec, 87
  %space.class = icmp eq i8 %ec, 115
  %not.space.class = icmp eq i8 %ec, 83
  %digit.lo = icmp uge i8 %subject.ch, 48
  %digit.hi = icmp ule i8 %subject.ch, 57
  %digit = and i1 %digit.lo, %digit.hi
  %alpha.lo.a = icmp uge i8 %subject.ch, 65
  %alpha.hi.a = icmp ule i8 %subject.ch, 90
  %alpha.a = and i1 %alpha.lo.a, %alpha.hi.a
  %alpha.lo.b = icmp uge i8 %subject.ch, 97
  %alpha.hi.b = icmp ule i8 %subject.ch, 122
  %alpha.b = and i1 %alpha.lo.b, %alpha.hi.b
  %alpha = or i1 %alpha.a, %alpha.b
  %underscore = icmp eq i8 %subject.ch, 95
  %word.0 = or i1 %alpha, %digit
  %word = or i1 %word.0, %underscore
  %space.0 = icmp eq i8 %subject.ch, 32
  %space.1 = icmp eq i8 %subject.ch, 9
  %space.2 = icmp eq i8 %subject.ch, 10
  %space.3 = icmp eq i8 %subject.ch, 13
  %space.a = or i1 %space.0, %space.1
  %space.b = or i1 %space.2, %space.3
  %space = or i1 %space.a, %space.b
  br i1 %digit.class, label %return.digit, label %escaped.not.digit
escaped.not.digit:
  br i1 %not.digit.class, label %return.not.digit, label %escaped.word
escaped.word:
  br i1 %word.class, label %return.word, label %escaped.not.word
escaped.not.word:
  br i1 %not.word.class, label %return.not.word, label %escaped.space
escaped.space:
  br i1 %space.class, label %return.space, label %escaped.not.space
escaped.not.space:
  br i1 %not.space.class, label %return.not.space, label %literal.escape
return.digit:
  ret i1 %digit
return.not.digit:
  %not.digit = xor i1 %digit, true
  ret i1 %not.digit
return.word:
  ret i1 %word
return.not.word:
  %not.word = xor i1 %word, true
  ret i1 %not.word
return.space:
  ret i1 %space
return.not.space:
  %not.space = xor i1 %space, true
  ret i1 %not.space
literal.escape:
  %literal.escape.codepoint = zext i8 %ec to i64
  br label %literal
dot.check:
  %dot = icmp eq i8 %ch, 46
  br i1 %dot, label %dot.match, label %class.check
dot.match:
  %dot.line.feed = icmp eq i8 %subject.ch, 10
  %dot.carriage.return = icmp eq i8 %subject.ch, 13
  %dot.line.terminator = or i1 %dot.line.feed, %dot.carriage.return
  %dot.accepted = xor i1 %dot.line.terminator, true
  ret i1 %dot.accepted
class.check:
  %class = icmp eq i8 %ch, 91
  br i1 %class, label %class.init, label %literal.direct
class.init:
  %first.i = add i64 %pi, 1
  %first.p = getelementptr i8, ptr %pattern, i64 %first.i
  %first.c = load i8, ptr %first.p
  %negated = icmp eq i8 %first.c, 94
  %scan.start.0 = add i64 %first.i, 1
  %scan.start = select i1 %negated, i64 %scan.start.0, i64 %first.i
  br label %class.loop
class.loop:
  %ci = phi i64 [ %scan.start, %class.init ], [ %ci.next, %class.step ], [ %range.next, %class.loop.from.range ]
  %ci.in = icmp ult i64 %ci, %plen
  br i1 %ci.in, label %class.body, label %class.finish
class.body:
  %cip = getelementptr i8, ptr %pattern, i64 %ci
  %cic = load i8, ptr %cip
  %class.decoded = call i64 @regexDecodeUtf8(ptr %pattern, i64 %ci)
  %class.codepoint = and i64 %class.decoded, 4294967295
  %class.width = lshr i64 %class.decoded, 32
  %ci.close = icmp eq i64 %class.codepoint, 93
  br i1 %ci.close, label %class.finish, label %class.compare
class.compare:
  %after.one = add i64 %ci, %class.width
  %after.two = add i64 %after.one, 1
  %range.in = icmp ult i64 %after.two, %plen
  br i1 %range.in, label %range.check, label %single.compare
range.check:
  %dash.p = getelementptr i8, ptr %pattern, i64 %after.one
  %dash = load i8, ptr %dash.p
  %is.range = icmp eq i8 %dash, 45
  br i1 %is.range, label %range.compare, label %single.compare
range.compare:
  %end.p = getelementptr i8, ptr %pattern, i64 %after.two
  %end.c = load i8, ptr %end.p
  %end.decoded = call i64 @regexDecodeUtf8(ptr %pattern, i64 %after.two)
  %end.codepoint = and i64 %end.decoded, 4294967295
  %end.width = lshr i64 %end.decoded, 32
  %range.lo = icmp uge i64 %subject.codepoint, %class.codepoint
  %range.hi = icmp ule i64 %subject.codepoint, %end.codepoint
  %range.match = and i1 %range.lo, %range.hi
  br i1 %range.match, label %class.matched, label %range.step
range.step:
  %range.next = add i64 %after.two, %end.width
  br label %class.loop.from.range
class.loop.from.range:
  br label %class.loop
single.compare:
  %single.match = icmp eq i64 %subject.codepoint, %class.codepoint
  br i1 %single.match, label %class.matched, label %class.step
class.step:
  %ci.next = add i64 %ci, %class.width
  br label %class.loop
class.matched:
  %match.result = xor i1 %negated, true
  ret i1 %match.result
class.finish:
  ret i1 %negated
literal.direct:
  %literal.decoded = call i64 @regexDecodeUtf8(ptr %pattern, i64 %pi)
  %literal.direct.codepoint = and i64 %literal.decoded, 4294967295
  br label %literal
literal:
  %literal.codepoint = phi i64 [ %literal.escape.codepoint, %literal.escape ], [ %literal.direct.codepoint, %literal.direct ]
  %literal.ch = trunc i64 %literal.codepoint to i8
  %ignore.masked = and i64 %flag.bits, 1
  %ignore = icmp ne i64 %ignore.masked, 0
  %pat.upper.lo = icmp uge i8 %literal.ch, 65
  %pat.upper.hi = icmp ule i8 %literal.ch, 90
  %pat.upper = and i1 %pat.upper.lo, %pat.upper.hi
  %pat.lowered = add i8 %literal.ch, 32
  %pat.folded = select i1 %pat.upper, i8 %pat.lowered, i8 %literal.ch
  %sub.upper.lo = icmp uge i8 %subject.ch, 65
  %sub.upper.hi = icmp ule i8 %subject.ch, 90
  %sub.upper = and i1 %sub.upper.lo, %sub.upper.hi
  %sub.lowered = add i8 %subject.ch, 32
  %sub.folded = select i1 %sub.upper, i8 %sub.lowered, i8 %subject.ch
  %plain.eq = icmp eq i64 %literal.codepoint, %subject.codepoint
  %fold.eq = icmp eq i8 %pat.folded, %sub.folded
  %literal.eq = select i1 %ignore, i1 %fold.eq, i1 %plain.eq
  ret i1 %literal.eq
return.true:
  ret i1 true
}
define i64 @regexAtomStep(ptr %pattern, i64 %pi, ptr %subject, i64 %si, i64 %flag.bits) {
entry:
  %pattern.ptr = getelementptr i8, ptr %pattern, i64 %pi
  %pattern.ch = load i8, ptr %pattern.ptr
  %pattern.dot = icmp eq i8 %pattern.ch, 46
  %pattern.class = icmp eq i8 %pattern.ch, 91
  %pattern.code.unit.atom = or i1 %pattern.dot, %pattern.class
  %subject.ptr = getelementptr i8, ptr %subject, i64 %si
  %subject.ch = load i8, ptr %subject.ptr
  %wide = zext i8 %subject.ch to i64
  %ascii.bits = and i64 %wide, 128
  %ascii = icmp eq i64 %ascii.bits, 0
  br i1 %ascii, label %single, label %encoded
encoded:
  %four.bits = and i64 %wide, 240
  %four = icmp eq i64 %four.bits, 240
  %three.bits = and i64 %wide, 224
  %three = icmp eq i64 %three.bits, 224
  %two.bits = and i64 %wide, 192
  %two = icmp eq i64 %two.bits, 192
  %unicode.mask = and i64 %flag.bits, 4
  %unicode = icmp ne i64 %unicode.mask, 0
  %not.unicode = xor i1 %unicode, true
  %split.four = and i1 %pattern.code.unit.atom, %not.unicode
  %four.unicode.step = select i1 %split.four, i64 2, i64 4
  %three.or.two.step = select i1 %three, i64 3, i64 2
  %lead.step = select i1 %four, i64 %four.unicode.step, i64 %three.or.two.step
  %continuation.step = select i1 %two, i64 %lead.step, i64 2
  ret i64 %continuation.step
single:
  ret i64 1
}
define { i64, i64, i64, i1, i1 } @regexQuantifierInfo(ptr %pattern, i64 %plen, i64 %atom.end) {
entry:
  %minimum.addr = alloca i64
  %maximum.addr = alloca i64
  %rest.addr = alloca i64
  %lazy.addr = alloca i1
  %valid.addr = alloca i1
  %position.addr = alloca i64
  %digits.addr = alloca i64
  %value.addr = alloca i64
  store i64 0, ptr %minimum.addr
  store i64 0, ptr %maximum.addr
  store i64 %atom.end, ptr %rest.addr
  store i1 false, ptr %lazy.addr
  store i1 false, ptr %valid.addr
  %in.range = icmp ult i64 %atom.end, %plen
  br i1 %in.range, label %load, label %return
load:
  %pointer = getelementptr i8, ptr %pattern, i64 %atom.end
  %character = load i8, ptr %pointer
  %star = icmp eq i8 %character, 42
  %plus = icmp eq i8 %character, 43
  %question = icmp eq i8 %character, 63
  %brace = icmp eq i8 %character, 123
  br i1 %star, label %simple.star, label %simple.plus.check
simple.star:
  store i64 0, ptr %minimum.addr
  store i64 -1, ptr %maximum.addr
  br label %simple.finish
simple.plus.check:
  br i1 %plus, label %simple.plus, label %simple.question.check
simple.plus:
  store i64 1, ptr %minimum.addr
  store i64 -1, ptr %maximum.addr
  br label %simple.finish
simple.question.check:
  br i1 %question, label %simple.question, label %brace.check
simple.question:
  store i64 0, ptr %minimum.addr
  store i64 1, ptr %maximum.addr
  br label %simple.finish
simple.finish:
  %simple.rest = add i64 %atom.end, 1
  store i64 %simple.rest, ptr %rest.addr
  store i1 true, ptr %valid.addr
  br label %lazy.check
brace.check:
  br i1 %brace, label %minimum.init, label %return
minimum.init:
  %minimum.start = add i64 %atom.end, 1
  store i64 %minimum.start, ptr %position.addr
  store i64 0, ptr %digits.addr
  store i64 0, ptr %value.addr
  br label %minimum.loop
minimum.loop:
  %minimum.position = load i64, ptr %position.addr
  %minimum.in.range = icmp ult i64 %minimum.position, %plen
  br i1 %minimum.in.range, label %minimum.character, label %return
minimum.character:
  %minimum.pointer = getelementptr i8, ptr %pattern, i64 %minimum.position
  %minimum.character.value = load i8, ptr %minimum.pointer
  %minimum.digit.low = icmp uge i8 %minimum.character.value, 48
  %minimum.digit.high = icmp ule i8 %minimum.character.value, 57
  %minimum.is.digit = and i1 %minimum.digit.low, %minimum.digit.high
  br i1 %minimum.is.digit, label %minimum.digit, label %minimum.separator
minimum.digit:
  %minimum.value = load i64, ptr %value.addr
  %minimum.times.ten = mul i64 %minimum.value, 10
  %minimum.raw = zext i8 %minimum.character.value to i64
  %minimum.decimal = sub i64 %minimum.raw, 48
  %minimum.next.value = add i64 %minimum.times.ten, %minimum.decimal
  %minimum.digits = load i64, ptr %digits.addr
  %minimum.next.digits = add i64 %minimum.digits, 1
  %minimum.next.position = add i64 %minimum.position, 1
  store i64 %minimum.next.value, ptr %value.addr
  store i64 %minimum.next.digits, ptr %digits.addr
  store i64 %minimum.next.position, ptr %position.addr
  br label %minimum.loop
minimum.separator:
  %minimum.digit.count = load i64, ptr %digits.addr
  %has.minimum = icmp ugt i64 %minimum.digit.count, 0
  br i1 %has.minimum, label %minimum.separator.valid, label %return
minimum.separator.valid:
  %parsed.minimum = load i64, ptr %value.addr
  store i64 %parsed.minimum, ptr %minimum.addr
  %is.close = icmp eq i8 %minimum.character.value, 125
  %is.comma = icmp eq i8 %minimum.character.value, 44
  br i1 %is.close, label %exact, label %comma.check
exact:
  store i64 %parsed.minimum, ptr %maximum.addr
  %exact.rest = add i64 %minimum.position, 1
  store i64 %exact.rest, ptr %rest.addr
  store i1 true, ptr %valid.addr
  br label %lazy.check
comma.check:
  br i1 %is.comma, label %maximum.init, label %return
maximum.init:
  %maximum.start = add i64 %minimum.position, 1
  store i64 %maximum.start, ptr %position.addr
  store i64 0, ptr %digits.addr
  store i64 0, ptr %value.addr
  br label %maximum.loop
maximum.loop:
  %maximum.position = load i64, ptr %position.addr
  %maximum.in.range = icmp ult i64 %maximum.position, %plen
  br i1 %maximum.in.range, label %maximum.character, label %return
maximum.character:
  %maximum.pointer = getelementptr i8, ptr %pattern, i64 %maximum.position
  %maximum.character.value = load i8, ptr %maximum.pointer
  %maximum.is.close = icmp eq i8 %maximum.character.value, 125
  br i1 %maximum.is.close, label %maximum.finish, label %maximum.digit.check
maximum.digit.check:
  %maximum.digit.low = icmp uge i8 %maximum.character.value, 48
  %maximum.digit.high = icmp ule i8 %maximum.character.value, 57
  %maximum.is.digit = and i1 %maximum.digit.low, %maximum.digit.high
  br i1 %maximum.is.digit, label %maximum.digit, label %return
maximum.digit:
  %maximum.value = load i64, ptr %value.addr
  %maximum.times.ten = mul i64 %maximum.value, 10
  %maximum.raw = zext i8 %maximum.character.value to i64
  %maximum.decimal = sub i64 %maximum.raw, 48
  %maximum.next.value = add i64 %maximum.times.ten, %maximum.decimal
  %maximum.digits = load i64, ptr %digits.addr
  %maximum.next.digits = add i64 %maximum.digits, 1
  %maximum.next.position = add i64 %maximum.position, 1
  store i64 %maximum.next.value, ptr %value.addr
  store i64 %maximum.next.digits, ptr %digits.addr
  store i64 %maximum.next.position, ptr %position.addr
  br label %maximum.loop
maximum.finish:
  %maximum.digit.count = load i64, ptr %digits.addr
  %has.maximum = icmp ugt i64 %maximum.digit.count, 0
  %parsed.maximum = load i64, ptr %value.addr
  %maximum = select i1 %has.maximum, i64 %parsed.maximum, i64 -1
  %minimum.for.range = load i64, ptr %minimum.addr
  %unbounded = icmp slt i64 %maximum, 0
  %ordered = icmp uge i64 %maximum, %minimum.for.range
  %range.valid = or i1 %unbounded, %ordered
  br i1 %range.valid, label %maximum.store, label %return
maximum.store:
  store i64 %maximum, ptr %maximum.addr
  %range.rest = add i64 %maximum.position, 1
  store i64 %range.rest, ptr %rest.addr
  store i1 true, ptr %valid.addr
  br label %lazy.check
lazy.check:
  %rest = load i64, ptr %rest.addr
  %has.lazy = icmp ult i64 %rest, %plen
  br i1 %has.lazy, label %lazy.load, label %return
lazy.load:
  %lazy.pointer = getelementptr i8, ptr %pattern, i64 %rest
  %lazy.character = load i8, ptr %lazy.pointer
  %lazy = icmp eq i8 %lazy.character, 63
  br i1 %lazy, label %lazy.store, label %return
lazy.store:
  %lazy.rest = add i64 %rest, 1
  store i64 %lazy.rest, ptr %rest.addr
  store i1 true, ptr %lazy.addr
  br label %return
return:
  %minimum.result = load i64, ptr %minimum.addr
  %maximum.result = load i64, ptr %maximum.addr
  %rest.result = load i64, ptr %rest.addr
  %lazy.result = load i1, ptr %lazy.addr
  %valid.result = load i1, ptr %valid.addr
  %result.0 = insertvalue { i64, i64, i64, i1, i1 } undef, i64 %minimum.result, 0
  %result.1 = insertvalue { i64, i64, i64, i1, i1 } %result.0, i64 %maximum.result, 1
  %result.2 = insertvalue { i64, i64, i64, i1, i1 } %result.1, i64 %rest.result, 2
  %result.3 = insertvalue { i64, i64, i64, i1, i1 } %result.2, i1 %lazy.result, 3
  %result = insertvalue { i64, i64, i64, i1, i1 } %result.3, i1 %valid.result, 4
  ret { i64, i64, i64, i1, i1 } %result
}
define i64 @regexCaptureIndex(ptr %pattern, i64 %limit, i8 %marker) {
entry:
  br label %loop
loop:
  %position = phi i64 [ 0, %entry ], [ %next, %step ]
  %count = phi i64 [ 0, %entry ], [ %next.count, %step ]
  %done = icmp uge i64 %position, %limit
  br i1 %done, label %return, label %body
body:
  %pointer = getelementptr i8, ptr %pattern, i64 %position
  %character = load i8, ptr %pointer
  %matches = icmp eq i8 %character, %marker
  %increment = zext i1 %matches to i64
  %next.count = add i64 %count, %increment
  br label %step
step:
  %next = add i64 %position, 1
  br label %loop
return:
  ret i64 %count
}
define i1 @regexIsWordAt(ptr %subject, i64 %length, i64 %index) {
entry:
  %nonnegative = icmp sge i64 %index, 0
  %in.range = icmp ult i64 %index, %length
  %valid = and i1 %nonnegative, %in.range
  br i1 %valid, label %load, label %not.word
load:
  %pointer = getelementptr i8, ptr %subject, i64 %index
  %character = load i8, ptr %pointer
  %upper.low = icmp uge i8 %character, 65
  %upper.high = icmp ule i8 %character, 90
  %upper = and i1 %upper.low, %upper.high
  %lower.low = icmp uge i8 %character, 97
  %lower.high = icmp ule i8 %character, 122
  %lower = and i1 %lower.low, %lower.high
  %digit.low = icmp uge i8 %character, 48
  %digit.high = icmp ule i8 %character, 57
  %digit = and i1 %digit.low, %digit.high
  %alpha = or i1 %upper, %lower
  %alphanumeric = or i1 %alpha, %digit
  %underscore = icmp eq i8 %character, 95
  %word = or i1 %alphanumeric, %underscore
  ret i1 %word
not.word:
  ret i1 false
}
define i64 @regexGroupEnd(ptr %pattern, i64 %plen, i64 %open) {
entry:
  %position.addr = alloca i64
  %depth.addr = alloca i64
  %class.addr = alloca i1
  %escape.addr = alloca i1
  %first = add i64 %open, 1
  store i64 %first, ptr %position.addr
  store i64 1, ptr %depth.addr
  store i1 false, ptr %class.addr
  store i1 false, ptr %escape.addr
  br label %scan
scan:
  %position = load i64, ptr %position.addr
  %done = icmp uge i64 %position, %plen
  br i1 %done, label %failure, label %character
character:
  %pointer = getelementptr i8, ptr %pattern, i64 %position
  %value = load i8, ptr %pointer
  %escaped = load i1, ptr %escape.addr
  br i1 %escaped, label %clear.escape, label %escape.check
clear.escape:
  store i1 false, ptr %escape.addr
  br label %step
escape.check:
  %is.escape = icmp eq i8 %value, 92
  br i1 %is.escape, label %set.escape, label %class.start.check
set.escape:
  store i1 true, ptr %escape.addr
  br label %step
class.start.check:
  %in.class = load i1, ptr %class.addr
  %is.class.start = icmp eq i8 %value, 91
  %outside.class = xor i1 %in.class, true
  %starts.class = and i1 %is.class.start, %outside.class
  br i1 %starts.class, label %set.class, label %class.end.check
set.class:
  store i1 true, ptr %class.addr
  br label %step
class.end.check:
  %is.class.end = icmp eq i8 %value, 93
  %ends.class = and i1 %is.class.end, %in.class
  br i1 %ends.class, label %clear.class, label %group.check
clear.class:
  store i1 false, ptr %class.addr
  br label %step
group.check:
  br i1 %in.class, label %step, label %group.syntax
group.syntax:
  %is.open = icmp eq i8 %value, 40
  %is.close = icmp eq i8 %value, 41
  br i1 %is.open, label %open.group, label %close.check
open.group:
  %depth = load i64, ptr %depth.addr
  %deeper = add i64 %depth, 1
  store i64 %deeper, ptr %depth.addr
  br label %step
close.check:
  br i1 %is.close, label %close.group, label %step
close.group:
  %close.depth = load i64, ptr %depth.addr
  %outer = icmp eq i64 %close.depth, 1
  br i1 %outer, label %success, label %close.nested
close.nested:
  %shallower = sub i64 %close.depth, 1
  store i64 %shallower, ptr %depth.addr
  br label %step
step:
  %next = add i64 %position, 1
  store i64 %next, ptr %position.addr
  br label %scan
success:
  ret i64 %position
failure:
  ret i64 -1
}
define i64 @regexMatchHere(ptr %pattern, i64 %plen, i64 %pi, ptr %subject, i64 %slen, i64 %si, i64 %flag.bits) {
entry:
  %pattern.done = icmp uge i64 %pi, %plen
  br i1 %pattern.done, label %success, label %anchor.start.check
anchor.start.check:
  %p = getelementptr i8, ptr %pattern, i64 %pi
  %ch = load i8, ptr %p
  %is.anchor.start = icmp eq i8 %ch, 94
  br i1 %is.anchor.start, label %anchor.start, label %anchor.end.check
anchor.start:
  %at.start = icmp eq i64 %si, 0
  %multiline.mask = and i64 %flag.bits, 2
  %multiline = icmp ne i64 %multiline.mask, 0
  %has.previous = icmp ugt i64 %si, 0
  %check.previous = and i1 %multiline, %has.previous
  br i1 %at.start, label %anchor.start.next, label %anchor.start.multiline
anchor.start.multiline:
  br i1 %check.previous, label %anchor.start.previous, label %failure
anchor.start.previous:
  %previous.i = sub i64 %si, 1
  %previous.p = getelementptr i8, ptr %subject, i64 %previous.i
  %previous.ch = load i8, ptr %previous.p
  %after.newline = icmp eq i8 %previous.ch, 10
  br i1 %after.newline, label %anchor.start.next, label %failure
anchor.start.next:
  %pi.after.start = add i64 %pi, 1
  %start.result = call i64 @regexMatchHere(ptr %pattern, i64 %plen, i64 %pi.after.start, ptr %subject, i64 %slen, i64 %si, i64 %flag.bits)
  ret i64 %start.result
anchor.end.check:
  %is.anchor.end = icmp eq i8 %ch, 36
  %last.pi = add i64 %pi, 1
  %anchor.is.last = icmp eq i64 %last.pi, %plen
  %use.end = and i1 %is.anchor.end, %anchor.is.last
  br i1 %use.end, label %anchor.end, label %group.check
anchor.end:
  %at.end = icmp eq i64 %si, %slen
  %end.multiline.mask = and i64 %flag.bits, 2
  %end.multiline = icmp ne i64 %end.multiline.mask, 0
  %before.subject.end = icmp ult i64 %si, %slen
  %can.check.newline = and i1 %end.multiline, %before.subject.end
  br i1 %at.end, label %success, label %anchor.end.multiline
anchor.end.multiline:
  br i1 %can.check.newline, label %anchor.end.current, label %failure
anchor.end.current:
  %current.p = getelementptr i8, ptr %subject, i64 %si
  %current.ch = load i8, ptr %current.p
  %before.newline = icmp eq i8 %current.ch, 10
  br i1 %before.newline, label %success, label %failure
group.check:
  %is.group.start = icmp eq i8 %ch, 40
  %is.group.end = icmp eq i8 %ch, 41
  br i1 %is.group.start, label %group.start, label %group.end.check
group.start:
  %group.close = call i64 @regexGroupEnd(ptr %pattern, i64 %plen, i64 %pi)
  %group.closed = icmp sge i64 %group.close, 0
  br i1 %group.closed, label %group.describe, label %failure
group.describe:
  %group.after.open = add i64 %pi, 1
  %group.prefix.remaining = sub i64 %plen, %group.after.open
  %group.has.prefix = icmp uge i64 %group.prefix.remaining, 2
  br i1 %group.has.prefix, label %group.prefix, label %group.capturing
group.prefix:
  %group.prefix.pointer = getelementptr i8, ptr %pattern, i64 %group.after.open
  %group.prefix.first = load i8, ptr %group.prefix.pointer
  %group.prefix.second.index = add i64 %group.after.open, 1
  %group.prefix.second.pointer = getelementptr i8, ptr %pattern, i64 %group.prefix.second.index
  %group.prefix.second = load i8, ptr %group.prefix.second.pointer
  %group.prefix.question = icmp eq i8 %group.prefix.first, 63
  %group.prefix.colon = icmp eq i8 %group.prefix.second, 58
  %group.non.capturing = and i1 %group.prefix.question, %group.prefix.colon
  br i1 %group.non.capturing, label %group.non.capturing.setup, label %group.capturing
group.non.capturing.setup:
  %group.non.capturing.start = add i64 %group.after.open, 2
  br label %group.ready
group.capturing:
  %prior.starts = call i64 @regexCaptureIndex(ptr %pattern, i64 %pi, i8 40)
  %group.number = add i64 %prior.starts, 1
  %group.in.range = icmp ult i64 %group.number, 10
  br i1 %group.in.range, label %group.capturing.setup, label %failure
group.capturing.setup:
  %group.start.slot = getelementptr [10 x i64], ptr @regex.capture.starts, i64 0, i64 %group.number
  %group.end.slot = getelementptr [10 x i64], ptr @regex.capture.ends, i64 0, i64 %group.number
  br label %group.ready
group.ready:
  %group.content.start = phi i64 [ %group.non.capturing.start, %group.non.capturing.setup ], [ %group.after.open, %group.capturing.setup ]
  %group.capture.start.slot = phi ptr [ null, %group.non.capturing.setup ], [ %group.start.slot, %group.capturing.setup ]
  %group.capture.end.slot = phi ptr [ null, %group.non.capturing.setup ], [ %group.end.slot, %group.capturing.setup ]
  %group.is.capturing = phi i1 [ false, %group.non.capturing.setup ], [ true, %group.capturing.setup ]
  %group.length = sub i64 %group.close, %group.content.start
  %group.pointer = getelementptr i8, ptr %pattern, i64 %group.content.start
  %group.atom.end = add i64 %group.close, 1
  %group.quant.info = call { i64, i64, i64, i1, i1 } @regexQuantifierInfo(ptr %pattern, i64 %plen, i64 %group.atom.end)
  %group.minimum = extractvalue { i64, i64, i64, i1, i1 } %group.quant.info, 0
  %group.maximum = extractvalue { i64, i64, i64, i1, i1 } %group.quant.info, 1
  %group.rest = extractvalue { i64, i64, i64, i1, i1 } %group.quant.info, 2
  %group.lazy = extractvalue { i64, i64, i64, i1, i1 } %group.quant.info, 3
  %group.quantified = extractvalue { i64, i64, i64, i1, i1 } %group.quant.info, 4
  br i1 %group.quantified, label %group.quant.init, label %group.once
group.once:
  br i1 %group.is.capturing, label %group.once.capture.start, label %group.once.match
group.once.capture.start:
  store i64 %si, ptr %group.capture.start.slot
  br label %group.once.match
group.once.match:
  %group.once.end = call i64 @regexMatchAlternatives(ptr %group.pointer, i64 %group.length, ptr %subject, i64 %slen, i64 %si, i64 %flag.bits)
  %group.once.matched = icmp sge i64 %group.once.end, 0
  br i1 %group.once.matched, label %group.once.finish, label %failure
group.once.finish:
  br i1 %group.is.capturing, label %group.once.capture.end, label %group.once.rest
group.once.capture.end:
  store i64 %group.once.end, ptr %group.capture.end.slot
  br label %group.once.rest
group.once.rest:
  %group.once.result = call i64 @regexMatchHere(ptr %pattern, i64 %plen, i64 %group.atom.end, ptr %subject, i64 %slen, i64 %group.once.end, i64 %flag.bits)
  ret i64 %group.once.result
group.quant.init:
  %group.positions.capacity = add i64 %slen, 2
  %group.positions = alloca i64, i64 %group.positions.capacity
  %group.position.addr = alloca i64
  %group.count.addr = alloca i64
  %group.initial.slot = getelementptr i64, ptr %group.positions, i64 0
  store i64 %si, ptr %group.initial.slot
  store i64 %si, ptr %group.position.addr
  store i64 0, ptr %group.count.addr
  br label %group.consume
group.consume:
  %group.position = load i64, ptr %group.position.addr
  %group.count = load i64, ptr %group.count.addr
  %group.bounded = icmp sge i64 %group.maximum, 0
  %group.at.maximum = icmp uge i64 %group.count, %group.maximum
  %group.maximum.reached = and i1 %group.bounded, %group.at.maximum
  br i1 %group.maximum.reached, label %group.choose, label %group.consume.capture
group.consume.capture:
  br i1 %group.is.capturing, label %group.consume.capture.start, label %group.consume.match
group.consume.capture.start:
  store i64 %group.position, ptr %group.capture.start.slot
  br label %group.consume.match
group.consume.match:
  %group.next.end = call i64 @regexMatchAlternatives(ptr %group.pointer, i64 %group.length, ptr %subject, i64 %slen, i64 %group.position, i64 %flag.bits)
  %group.next.matched = icmp sge i64 %group.next.end, 0
  %group.made.progress = icmp ugt i64 %group.next.end, %group.position
  %group.can.consume = and i1 %group.next.matched, %group.made.progress
  br i1 %group.can.consume, label %group.consume.store, label %group.choose
group.consume.store:
  %group.next.count = add i64 %group.count, 1
  %group.next.slot = getelementptr i64, ptr %group.positions, i64 %group.next.count
  store i64 %group.next.end, ptr %group.next.slot
  store i64 %group.next.end, ptr %group.position.addr
  store i64 %group.next.count, ptr %group.count.addr
  br i1 %group.is.capturing, label %group.consume.capture.end, label %group.consume
group.consume.capture.end:
  store i64 %group.next.end, ptr %group.capture.end.slot
  br label %group.consume
group.choose:
  %group.consumed = load i64, ptr %group.count.addr
  %group.minimum.met = icmp uge i64 %group.consumed, %group.minimum
  br i1 %group.minimum.met, label %group.choose.order, label %failure
group.choose.order:
  br i1 %group.lazy, label %group.lazy.init, label %group.greedy.init
group.greedy.init:
  %group.candidate.count.addr = alloca i64
  store i64 %group.consumed, ptr %group.candidate.count.addr
  br label %group.greedy
group.greedy:
  %group.candidate.count = load i64, ptr %group.candidate.count.addr
  %group.candidate.slot = getelementptr i64, ptr %group.positions, i64 %group.candidate.count
  %group.candidate.position = load i64, ptr %group.candidate.slot
  %group.candidate.result = call i64 @regexMatchHere(ptr %pattern, i64 %plen, i64 %group.rest, ptr %subject, i64 %slen, i64 %group.candidate.position, i64 %flag.bits)
  %group.candidate.ok = icmp sge i64 %group.candidate.result, 0
  br i1 %group.candidate.ok, label %group.return.greedy, label %group.greedy.more
group.greedy.more:
  %group.can.decrease = icmp ugt i64 %group.candidate.count, %group.minimum
  br i1 %group.can.decrease, label %group.greedy.step, label %failure
group.greedy.step:
  %group.previous.count = sub i64 %group.candidate.count, 1
  store i64 %group.previous.count, ptr %group.candidate.count.addr
  br label %group.greedy
group.lazy.init:
  %group.lazy.count.addr = alloca i64
  store i64 %group.minimum, ptr %group.lazy.count.addr
  br label %group.lazy.try
group.lazy.try:
  %group.lazy.count = load i64, ptr %group.lazy.count.addr
  %group.lazy.slot = getelementptr i64, ptr %group.positions, i64 %group.lazy.count
  %group.lazy.position = load i64, ptr %group.lazy.slot
  %group.lazy.result = call i64 @regexMatchHere(ptr %pattern, i64 %plen, i64 %group.rest, ptr %subject, i64 %slen, i64 %group.lazy.position, i64 %flag.bits)
  %group.lazy.ok = icmp sge i64 %group.lazy.result, 0
  br i1 %group.lazy.ok, label %group.return.lazy, label %group.lazy.more
group.lazy.more:
  %group.can.increase = icmp ult i64 %group.lazy.count, %group.consumed
  br i1 %group.can.increase, label %group.lazy.step, label %failure
group.lazy.step:
  %group.following.count = add i64 %group.lazy.count, 1
  store i64 %group.following.count, ptr %group.lazy.count.addr
  br label %group.lazy.try
group.return.greedy:
  ret i64 %group.candidate.result
group.return.lazy:
  ret i64 %group.lazy.result
group.end.check:
  br i1 %is.group.end, label %failure, label %backref.escape.check
backref.escape.check:
  %is.escape = icmp eq i8 %ch, 92
  %backref.next.pi = add i64 %pi, 1
  %backref.has.next = icmp ult i64 %backref.next.pi, %plen
  %can.be.backref = and i1 %is.escape, %backref.has.next
  br i1 %can.be.backref, label %backref.digit.check, label %atom
backref.digit.check:
  %backref.next.ptr = getelementptr i8, ptr %pattern, i64 %backref.next.pi
  %backref.next.ch = load i8, ptr %backref.next.ptr
  %boundary.positive = icmp eq i8 %backref.next.ch, 98
  %boundary.negative = icmp eq i8 %backref.next.ch, 66
  %is.boundary.escape = or i1 %boundary.positive, %boundary.negative
  br i1 %is.boundary.escape, label %boundary, label %backref.number.check
boundary:
  %previous.index = sub i64 %si, 1
  %previous.word = call i1 @regexIsWordAt(ptr %subject, i64 %slen, i64 %previous.index)
  %current.word = call i1 @regexIsWordAt(ptr %subject, i64 %slen, i64 %si)
  %at.boundary = xor i1 %previous.word, %current.word
  %boundary.accepted = icmp eq i1 %at.boundary, %boundary.positive
  br i1 %boundary.accepted, label %boundary.next, label %failure
boundary.next:
  %after.boundary = add i64 %pi, 2
  %boundary.result = call i64 @regexMatchHere(ptr %pattern, i64 %plen, i64 %after.boundary, ptr %subject, i64 %slen, i64 %si, i64 %flag.bits)
  ret i64 %boundary.result
backref.number.check:
  %backref.digit.low = icmp uge i8 %backref.next.ch, 49
  %backref.digit.high = icmp ule i8 %backref.next.ch, 57
  %is.backref = and i1 %backref.digit.low, %backref.digit.high
  br i1 %is.backref, label %backref, label %atom
backref:
  %backref.raw = zext i8 %backref.next.ch to i64
  %backref.number = sub i64 %backref.raw, 48
  %backref.start.slot = getelementptr [10 x i64], ptr @regex.capture.starts, i64 0, i64 %backref.number
  %backref.end.slot = getelementptr [10 x i64], ptr @regex.capture.ends, i64 0, i64 %backref.number
  %backref.start = load i64, ptr %backref.start.slot
  %backref.end = load i64, ptr %backref.end.slot
  %backref.captured = icmp sge i64 %backref.start, 0
  %backref.length = sub i64 %backref.end, %backref.start
  %backref.subject.end = add i64 %si, %backref.length
  %backref.in.range = icmp ule i64 %backref.subject.end, %slen
  %backref.can.compare = and i1 %backref.captured, %backref.in.range
  br i1 %backref.can.compare, label %backref.compare, label %failure
backref.compare:
  %backref.expected = getelementptr i8, ptr %subject, i64 %backref.start
  %backref.actual = getelementptr i8, ptr %subject, i64 %si
  %backref.comparison = call i32 @memcmp(ptr %backref.expected, ptr %backref.actual, i64 %backref.length)
  %backref.matches = icmp eq i32 %backref.comparison, 0
  br i1 %backref.matches, label %backref.next, label %failure
backref.next:
  %after.backref = add i64 %pi, 2
  %backref.result = call i64 @regexMatchHere(ptr %pattern, i64 %plen, i64 %after.backref, ptr %subject, i64 %slen, i64 %backref.subject.end, i64 %flag.bits)
  ret i64 %backref.result
atom:
  %atom.end = call i64 @regexAtomEnd(ptr %pattern, i64 %plen, i64 %pi)
  %has.quant = icmp ult i64 %atom.end, %plen
  br i1 %has.quant, label %quant.load, label %single
quant.load:
  %quant.info = call { i64, i64, i64, i1, i1 } @regexQuantifierInfo(ptr %pattern, i64 %plen, i64 %atom.end)
  %minimum = extractvalue { i64, i64, i64, i1, i1 } %quant.info, 0
  %maximum = extractvalue { i64, i64, i64, i1, i1 } %quant.info, 1
  %rest.pi = extractvalue { i64, i64, i64, i1, i1 } %quant.info, 2
  %lazy = extractvalue { i64, i64, i64, i1, i1 } %quant.info, 3
  %quantified = extractvalue { i64, i64, i64, i1, i1 } %quant.info, 4
  br i1 %quantified, label %quant.init, label %single
single:
  %subject.done = icmp uge i64 %si, %slen
  br i1 %subject.done, label %failure, label %single.match
single.match:
  %sp = getelementptr i8, ptr %subject, i64 %si
  %sc = load i8, ptr %sp
  %matches = call i1 @regexAtomMatches(ptr %pattern, i64 %plen, i64 %pi, ptr %subject, i64 %si, i64 %flag.bits)
  br i1 %matches, label %single.next, label %failure
single.next:
  %single.step = call i64 @regexAtomStep(ptr %pattern, i64 %pi, ptr %subject, i64 %si, i64 %flag.bits)
  %next.si = add i64 %si, %single.step
  %single.result = call i64 @regexMatchHere(ptr %pattern, i64 %plen, i64 %atom.end, ptr %subject, i64 %slen, i64 %next.si, i64 %flag.bits)
  ret i64 %single.result
quant.init:
  %quant.position.addr = alloca i64
  %quant.count.addr = alloca i64
  store i64 %si, ptr %quant.position.addr
  store i64 0, ptr %quant.count.addr
  br label %consume
consume:
  %position = load i64, ptr %quant.position.addr
  %count = load i64, ptr %quant.count.addr
  %bounded = icmp sge i64 %maximum, 0
  %at.maximum = icmp uge i64 %count, %maximum
  %maximum.reached = and i1 %bounded, %at.maximum
  br i1 %maximum.reached, label %backtrack.init, label %consume.range
consume.range:
  %position.in = icmp ult i64 %position, %slen
  br i1 %position.in, label %consume.match, label %backtrack.init
consume.match:
  %consume.p = getelementptr i8, ptr %subject, i64 %position
  %consume.ch = load i8, ptr %consume.p
  %consume.matches = call i1 @regexAtomMatches(ptr %pattern, i64 %plen, i64 %pi, ptr %subject, i64 %position, i64 %flag.bits)
  br i1 %consume.matches, label %consume.step, label %backtrack.init
consume.step:
  %consume.step.size = call i64 @regexAtomStep(ptr %pattern, i64 %pi, ptr %subject, i64 %position, i64 %flag.bits)
  %position.next = add i64 %position, %consume.step.size
  %count.next = add i64 %count, 1
  store i64 %position.next, ptr %quant.position.addr
  store i64 %count.next, ptr %quant.count.addr
  br label %consume
backtrack.init:
  %consumed.count = load i64, ptr %quant.count.addr
  %minimum.met = icmp uge i64 %consumed.count, %minimum
  br i1 %minimum.met, label %backtrack.choose, label %failure
backtrack.choose:
  %max.position = load i64, ptr %quant.position.addr
  %minimum.position = add i64 %si, %minimum
  br i1 %lazy, label %lazy.init, label %greedy.init
greedy.init:
  %greedy.candidate.addr = alloca i64
  store i64 %max.position, ptr %greedy.candidate.addr
  br label %greedy.backtrack
greedy.backtrack:
  %candidate = load i64, ptr %greedy.candidate.addr
  %candidate.result = call i64 @regexMatchHere(ptr %pattern, i64 %plen, i64 %rest.pi, ptr %subject, i64 %slen, i64 %candidate, i64 %flag.bits)
  %candidate.ok = icmp sge i64 %candidate.result, 0
  br i1 %candidate.ok, label %return.candidate, label %greedy.check
greedy.check:
  %can.backtrack = icmp ugt i64 %candidate, %minimum.position
  br i1 %can.backtrack, label %greedy.step, label %failure
greedy.step:
  %candidate.prev = sub i64 %candidate, 1
  store i64 %candidate.prev, ptr %greedy.candidate.addr
  br label %greedy.backtrack
lazy.init:
  %lazy.candidate.addr = alloca i64
  store i64 %minimum.position, ptr %lazy.candidate.addr
  br label %lazy.backtrack
lazy.backtrack:
  %lazy.candidate = load i64, ptr %lazy.candidate.addr
  %lazy.candidate.result = call i64 @regexMatchHere(ptr %pattern, i64 %plen, i64 %rest.pi, ptr %subject, i64 %slen, i64 %lazy.candidate, i64 %flag.bits)
  %lazy.candidate.ok = icmp sge i64 %lazy.candidate.result, 0
  br i1 %lazy.candidate.ok, label %return.lazy.candidate, label %lazy.check.more
lazy.check.more:
  %lazy.can.advance = icmp ult i64 %lazy.candidate, %max.position
  br i1 %lazy.can.advance, label %lazy.step, label %failure
lazy.step:
  %lazy.candidate.next = add i64 %lazy.candidate, 1
  store i64 %lazy.candidate.next, ptr %lazy.candidate.addr
  br label %lazy.backtrack
return.candidate:
  ret i64 %candidate.result
return.lazy.candidate:
  ret i64 %lazy.candidate.result
success:
  ret i64 %si
failure:
  ret i64 -1
}
define i64 @regexMatchAlternatives(ptr %pattern, i64 %plen, ptr %subject, i64 %slen, i64 %si, i64 %flag.bits) {
entry:
  %start.addr = alloca i64
  %position.addr = alloca i64
  %class.addr = alloca i1
  %escape.addr = alloca i1
  %depth.addr = alloca i64
  store i64 0, ptr %start.addr
  store i64 0, ptr %position.addr
  store i1 false, ptr %class.addr
  store i1 false, ptr %escape.addr
  store i64 0, ptr %depth.addr
  br label %scan
scan:
  %position = load i64, ptr %position.addr
  %at.end = icmp uge i64 %position, %plen
  br i1 %at.end, label %attempt, label %character
character:
  %pointer = getelementptr i8, ptr %pattern, i64 %position
  %character.value = load i8, ptr %pointer
  %escaped = load i1, ptr %escape.addr
  br i1 %escaped, label %clear.escape, label %syntax
clear.escape:
  store i1 false, ptr %escape.addr
  br label %step
syntax:
  %is.escape = icmp eq i8 %character.value, 92
  br i1 %is.escape, label %set.escape, label %class.start.check
set.escape:
  store i1 true, ptr %escape.addr
  br label %step
class.start.check:
  %is.class.start = icmp eq i8 %character.value, 91
  br i1 %is.class.start, label %set.class, label %class.end.check
set.class:
  store i1 true, ptr %class.addr
  br label %step
class.end.check:
  %is.class.end = icmp eq i8 %character.value, 93
  br i1 %is.class.end, label %clear.class, label %group.check
clear.class:
  store i1 false, ptr %class.addr
  br label %step
group.check:
  %group.in.class = load i1, ptr %class.addr
  br i1 %group.in.class, label %step, label %group.syntax
group.syntax:
  %is.group.open = icmp eq i8 %character.value, 40
  %is.group.close = icmp eq i8 %character.value, 41
  br i1 %is.group.open, label %group.open, label %group.close.check
group.open:
  %group.depth = load i64, ptr %depth.addr
  %group.deeper = add i64 %group.depth, 1
  store i64 %group.deeper, ptr %depth.addr
  br label %step
group.close.check:
  br i1 %is.group.close, label %group.close, label %alternative.check
group.close:
  %group.close.depth = load i64, ptr %depth.addr
  %group.has.parent = icmp ugt i64 %group.close.depth, 0
  br i1 %group.has.parent, label %group.close.valid, label %step
group.close.valid:
  %group.shallower = sub i64 %group.close.depth, 1
  store i64 %group.shallower, ptr %depth.addr
  br label %step
alternative.check:
  %in.class = load i1, ptr %class.addr
  %alternative.depth = load i64, ptr %depth.addr
  %is.bar = icmp eq i8 %character.value, 124
  %outside.class = xor i1 %in.class, true
  %outside.group = icmp eq i64 %alternative.depth, 0
  %bar.outside.class = and i1 %is.bar, %outside.class
  %is.alternative = and i1 %bar.outside.class, %outside.group
  br i1 %is.alternative, label %attempt, label %step
step:
  %next.position = add i64 %position, 1
  store i64 %next.position, ptr %position.addr
  br label %scan
attempt:
  %start = load i64, ptr %start.addr
  %segment.len = sub i64 %position, %start
  %segment.ptr = getelementptr i8, ptr %pattern, i64 %start
  %result = call i64 @regexMatchHere(ptr %segment.ptr, i64 %segment.len, i64 0, ptr %subject, i64 %slen, i64 %si, i64 %flag.bits)
  %matched = icmp sge i64 %result, 0
  br i1 %matched, label %return, label %next.alternative
next.alternative:
  br i1 %at.end, label %failure, label %advance.alternative
advance.alternative:
  %next.start = add i64 %position, 1
  store i64 %next.start, ptr %start.addr
  store i64 %next.start, ptr %position.addr
  br label %scan
return:
  ret i64 %result
failure:
  ret i64 -1
}
define i64 @regexUtf16Index(ptr %bytes, i64 %byte.offset) {
entry:
  br label %loop
loop:
  %position = phi i64 [ 0, %entry ], [ %next.position, %step ]
  %units = phi i64 [ 0, %entry ], [ %next.units, %step ]
  %done = icmp uge i64 %position, %byte.offset
  br i1 %done, label %return, label %decode
decode:
  %pointer = getelementptr i8, ptr %bytes, i64 %position
  %byte = load i8, ptr %pointer
  %wide = zext i8 %byte to i64
  %ascii.bits = and i64 %wide, 128
  %ascii = icmp eq i64 %ascii.bits, 0
  %four.bits = and i64 %wide, 240
  %four = icmp eq i64 %four.bits, 240
  %three.bits = and i64 %wide, 224
  %three = icmp eq i64 %three.bits, 224
  %non.ascii.step = select i1 %three, i64 3, i64 2
  %encoded.step = select i1 %four, i64 4, i64 %non.ascii.step
  %byte.step = select i1 %ascii, i64 1, i64 %encoded.step
  %unit.step = select i1 %four, i64 2, i64 1
  br label %step
step:
  %next.position = add i64 %position, %byte.step
  %next.units = add i64 %units, %unit.step
  br label %loop
return:
  ret i64 %units
}
define i64 @regexByteOffset(ptr %bytes, i64 %byte.length, i64 %unit.offset) {
entry:
  br label %loop
loop:
  %position = phi i64 [ 0, %entry ], [ %next.position, %step ]
  %units = phi i64 [ 0, %entry ], [ %next.units, %step ]
  %unit.done = icmp uge i64 %units, %unit.offset
  %byte.done = icmp uge i64 %position, %byte.length
  %done = or i1 %unit.done, %byte.done
  br i1 %done, label %return, label %decode
decode:
  %pointer = getelementptr i8, ptr %bytes, i64 %position
  %byte = load i8, ptr %pointer
  %wide = zext i8 %byte to i64
  %ascii.bits = and i64 %wide, 128
  %ascii = icmp eq i64 %ascii.bits, 0
  %four.bits = and i64 %wide, 240
  %four = icmp eq i64 %four.bits, 240
  %three.bits = and i64 %wide, 224
  %three = icmp eq i64 %three.bits, 224
  %non.ascii.step = select i1 %three, i64 3, i64 2
  %encoded.step = select i1 %four, i64 4, i64 %non.ascii.step
  %byte.step = select i1 %ascii, i64 1, i64 %encoded.step
  %unit.step = select i1 %four, i64 2, i64 1
  br label %step
step:
  %next.position = add i64 %position, %byte.step
  %next.units = add i64 %units, %unit.step
  br label %loop
return:
  ret i64 %position
}
define i64 @regexFind(i64 %regex, i64 %input) {
entry:
  %object = call ptr @valueObjectPtr(i64 %regex)
  %source.value = call i64 @objectGet(ptr %object, i64 6, ptr @.regex.source)
  %flags.value = call i64 @objectGet(ptr %object, i64 5, ptr @.regex.flags)
  %last.value = call i64 @objectGet(ptr %object, i64 9, ptr @.regex.last.index)
  %global.value = call i64 @objectGet(ptr %object, i64 6, ptr @.regex.global)
  %sticky.value = call i64 @objectGet(ptr %object, i64 6, ptr @.regex.sticky)
  %ignore.value = call i64 @objectGet(ptr %object, i64 10, ptr @.regex.ignore.case)
  %multiline.value = call i64 @objectGet(ptr %object, i64 9, ptr @.regex.multiline)
  %source.ptr = call ptr @valueStringPtr(i64 %source.value)
  %source.len = call i64 @valueStringLength(i64 %source.value)
  %input.ptr = call ptr @valueStringPtr(i64 %input)
  %input.len = call i64 @valueStringLength(i64 %input)
  %last.number = call double @valueNumber(i64 %last.value)
  %last.index = fptoui double %last.number to i64
  %is.global = icmp eq i64 %global.value, 9222246136947933186
  %is.sticky = icmp eq i64 %sticky.value, 9222246136947933186
  %uses.last = or i1 %is.global, %is.sticky
  %last.byte = call i64 @regexByteOffset(ptr %input.ptr, i64 %input.len, i64 %last.index)
  %start = select i1 %uses.last, i64 %last.byte, i64 0
  %ignore = icmp eq i64 %ignore.value, 9222246136947933186
  %multiline = icmp eq i64 %multiline.value, 9222246136947933186
  %ignore.bit = zext i1 %ignore to i64
  %multiline.raw = zext i1 %multiline to i64
  %multiline.bit = shl i64 %multiline.raw, 1
  %flag.bits.0 = or i64 %ignore.bit, %multiline.bit
  %flags.ptr = call ptr @valueStringPtr(i64 %flags.value)
  %flags.len = call i64 @valueStringLength(i64 %flags.value)
  %flag.scan.addr = alloca i64
  %unicode.addr = alloca i1
  store i64 0, ptr %flag.scan.addr
  store i1 false, ptr %unicode.addr
  br label %flag.scan
flag.scan:
  %flag.scan.index = load i64, ptr %flag.scan.addr
  %flag.scan.done = icmp uge i64 %flag.scan.index, %flags.len
  br i1 %flag.scan.done, label %flag.scanned, label %flag.scan.body
flag.scan.body:
  %flag.scan.ptr = getelementptr i8, ptr %flags.ptr, i64 %flag.scan.index
  %flag.scan.ch = load i8, ptr %flag.scan.ptr
  %flag.scan.is.u = icmp eq i8 %flag.scan.ch, 117
  br i1 %flag.scan.is.u, label %flag.scan.found, label %flag.scan.step
flag.scan.found:
  store i1 true, ptr %unicode.addr
  br label %flag.scanned
flag.scan.step:
  %flag.scan.next = add i64 %flag.scan.index, 1
  store i64 %flag.scan.next, ptr %flag.scan.addr
  br label %flag.scan
flag.scanned:
  ; The u flag is derived from the stored flags string rather than a RegExp
  ; property so that .unicode is not JS-observable; the matcher still needs
  ; the bit for astral-plane stepping until Unicode semantics land in #31.
  %unicode = load i1, ptr %unicode.addr
  %unicode.raw = zext i1 %unicode to i64
  %unicode.bit = shl i64 %unicode.raw, 2
  %flag.bits = or i64 %flag.bits.0, %unicode.bit
  br label %search
search:
  %position = phi i64 [ %start, %flag.scanned ], [ %next.position, %advance ]
  %in.range = icmp ule i64 %position, %input.len
  br i1 %in.range, label %attempt, label %not.found
attempt:
  br label %capture.clear
capture.clear:
  %capture.index = phi i64 [ 0, %attempt ], [ %capture.next, %capture.clear.step ]
  %captures.done = icmp uge i64 %capture.index, 10
  br i1 %captures.done, label %attempt.match, label %capture.clear.body
capture.clear.body:
  %capture.start.slot = getelementptr [10 x i64], ptr @regex.capture.starts, i64 0, i64 %capture.index
  %capture.end.slot = getelementptr [10 x i64], ptr @regex.capture.ends, i64 0, i64 %capture.index
  store i64 -1, ptr %capture.start.slot
  store i64 -1, ptr %capture.end.slot
  br label %capture.clear.step
capture.clear.step:
  %capture.next = add i64 %capture.index, 1
  br label %capture.clear
attempt.match:
  %end = call i64 @regexMatchAlternatives(ptr %source.ptr, i64 %source.len, ptr %input.ptr, i64 %input.len, i64 %position, i64 %flag.bits)
  %matched = icmp sge i64 %end, 0
  br i1 %matched, label %found, label %sticky.check
sticky.check:
  br i1 %is.sticky, label %not.found, label %advance
advance:
  %next.position = add i64 %position, 1
  br label %search
found:
  br i1 %uses.last, label %update.success, label %pack
update.success:
  %end.units = call i64 @regexUtf16Index(ptr %input.ptr, i64 %end)
  %end.number = uitofp i64 %end.units to double
  %end.value = call i64 @valueBoxNumber(double %end.number)
  call void @objectSet(ptr %object, i64 9, ptr @.regex.last.index, i64 %end.value)
  br label %pack
pack:
  %start.low = and i64 %position, 4294967295
  %start.high = shl i64 %start.low, 32
  %end.low = and i64 %end, 4294967295
  %packed = or i64 %start.high, %end.low
  ret i64 %packed
not.found:
  br i1 %uses.last, label %reset, label %return.missing
reset:
  %zero = call i64 @valueBoxNumber(double 0.0)
  call void @objectSet(ptr %object, i64 9, ptr @.regex.last.index, i64 %zero)
  br label %return.missing
return.missing:
  ret i64 -1
}
define i64 @regexSlice(i64 %input, i64 %start, i64 %end) {
entry:
  %input.ptr = call ptr @valueStringPtr(i64 %input)
  %len = sub i64 %end, %start
  %alloc.len = add i64 %len, 1
  %out = call ptr @malloc(i64 %alloc.len)
  %source = getelementptr i8, ptr %input.ptr, i64 %start
  call ptr @memcpy(ptr %out, ptr %source, i64 %len)
  %nul = getelementptr i8, ptr %out, i64 %len
  store i8 0, ptr %nul
  %boxed = call i64 @valueBoxString(ptr %out, i64 %len)
  ret i64 %boxed
}
define { i64, i1 } @regexTest(i64 %regex, i64 %input) {
entry:
  %match = call i64 @regexFind(i64 %regex, i64 %input)
  %found = icmp sge i64 %match, 0
  %value = select i1 %found, i64 9222246136947933186, i64 9222246136947933185
  %result.0 = insertvalue { i64, i1 } undef, i64 %value, 0
  %result = insertvalue { i64, i1 } %result.0, i1 false, 1
  ret { i64, i1 } %result
}
define { i64, i1 } @regexExec(i64 %regex, i64 %input) {
entry:
  %match = call i64 @regexFind(i64 %regex, i64 %input)
  %found = icmp sge i64 %match, 0
  br i1 %found, label %build, label %missing
build:
  %start = lshr i64 %match, 32
  %end = and i64 %match, 4294967295
  %text = call i64 @regexSlice(i64 %input, i64 %start, i64 %end)
  %regex.object = call ptr @valueObjectPtr(i64 %regex)
  %source.value = call i64 @objectGet(ptr %regex.object, i64 6, ptr @.regex.source)
  %source.ptr = call ptr @valueStringPtr(i64 %source.value)
  %source.len = call i64 @valueStringLength(i64 %source.value)
  %capture.count = call i64 @regexCaptureIndex(ptr %source.ptr, i64 %source.len, i8 40)
  %result.length = add i64 %capture.count, 1
  %array = call ptr @arrayNew(i64 %result.length)
  call void @arraySet(ptr %array, i64 0, i64 %text)
  br label %captures
captures:
  %capture.number = phi i64 [ 1, %build ], [ %next.capture, %capture.store ]
  %captures.complete = icmp ugt i64 %capture.number, %capture.count
  br i1 %captures.complete, label %properties, label %capture.load
capture.load:
  %capture.start.slot = getelementptr [10 x i64], ptr @regex.capture.starts, i64 0, i64 %capture.number
  %capture.end.slot = getelementptr [10 x i64], ptr @regex.capture.ends, i64 0, i64 %capture.number
  %capture.start = load i64, ptr %capture.start.slot
  %capture.end = load i64, ptr %capture.end.slot
  %capture.matched = icmp sge i64 %capture.start, 0
  br i1 %capture.matched, label %capture.slice, label %capture.missing
capture.slice:
  %capture.text = call i64 @regexSlice(i64 %input, i64 %capture.start, i64 %capture.end)
  br label %capture.store
capture.missing:
  br label %capture.store
capture.store:
  %capture.value = phi i64 [ %capture.text, %capture.slice ], [ 9222246136947933184, %capture.missing ]
  call void @arraySet(ptr %array, i64 %capture.number, i64 %capture.value)
  %next.capture = add i64 %capture.number, 1
  br label %captures
properties:
  %input.ptr = call ptr @valueStringPtr(i64 %input)
  %start.units = call i64 @regexUtf16Index(ptr %input.ptr, i64 %start)
  %start.number = uitofp i64 %start.units to double
  %start.value = call i64 @valueBoxNumber(double %start.number)
  call void @arraySetNamed(ptr %array, i64 5, ptr @.regex.index, i64 %start.value)
  call void @arraySetNamed(ptr %array, i64 5, ptr @.regex.input, i64 %input)
  %boxed = call i64 @valueBoxArray(ptr %array)
  br label %return
missing:
  br label %return
return:
  %value = phi i64 [ %boxed, %properties ], [ 9222246136947933187, %missing ]
  %result.0 = insertvalue { i64, i1 } undef, i64 %value, 0
  %result = insertvalue { i64, i1 } %result.0, i1 false, 1
  ret { i64, i1 } %result
}
define { i64, i1 } @regexMatch(i64 %regex, i64 %input) {
entry:
  %object = call ptr @valueObjectPtr(i64 %regex)
  %global.value = call i64 @objectGet(ptr %object, i64 6, ptr @.regex.global)
  %is.global = icmp eq i64 %global.value, 9222246136947933186
  br i1 %is.global, label %global, label %single
single:
  %single.result = call { i64, i1 } @regexExec(i64 %regex, i64 %input)
  ret { i64, i1 } %single.result
global:
  %zero = call i64 @valueBoxNumber(double 0.0)
  call void @objectSet(ptr %object, i64 9, ptr @.regex.last.index, i64 %zero)
  %input.ptr = call ptr @valueStringPtr(i64 %input)
  %input.len = call i64 @valueStringLength(i64 %input)
  %array = call ptr @arrayNew(i64 0)
  br label %loop
loop:
  %match = call i64 @regexFind(i64 %regex, i64 %input)
  %found = icmp sge i64 %match, 0
  br i1 %found, label %append, label %complete
append:
  %start = lshr i64 %match, 32
  %end = and i64 %match, 4294967295
  %text = call i64 @regexSlice(i64 %input, i64 %start, i64 %end)
  call i64 @arrayPush(ptr %array, i64 %text)
  %empty = icmp eq i64 %start, %end
  br i1 %empty, label %advance.empty, label %loop
advance.empty:
  %empty.at.input.end = icmp uge i64 %end, %input.len
  br i1 %empty.at.input.end, label %empty.complete, label %empty.update
empty.update:
  %end.units = call i64 @regexUtf16Index(ptr %input.ptr, i64 %end)
  %next.units = add i64 %end.units, 1
  %next.number = uitofp i64 %next.units to double
  %next.value = call i64 @valueBoxNumber(double %next.number)
  call void @objectSet(ptr %object, i64 9, ptr @.regex.last.index, i64 %next.value)
  br label %loop
empty.complete:
  call void @objectSet(ptr %object, i64 9, ptr @.regex.last.index, i64 %zero)
  br label %complete
complete:
  %length = call i64 @arrayLength(ptr %array)
  %has.matches = icmp ugt i64 %length, 0
  br i1 %has.matches, label %box.array, label %return.null
box.array:
  %boxed = call i64 @valueBoxArray(ptr %array)
  br label %return
return.null:
  br label %return
return:
  %value = phi i64 [ %boxed, %box.array ], [ 9222246136947933187, %return.null ]
  %result.0 = insertvalue { i64, i1 } undef, i64 %value, 0
  %result = insertvalue { i64, i1 } %result.0, i1 false, 1
  ret { i64, i1 } %result
}
define { i64, i1 } @regexSearch(i64 %regex, i64 %input) {
entry:
  %object = call ptr @valueObjectPtr(i64 %regex)
  %saved.last.index = call i64 @objectGet(ptr %object, i64 9, ptr @.regex.last.index)
  %zero = call i64 @valueBoxNumber(double 0.0)
  call void @objectSet(ptr %object, i64 9, ptr @.regex.last.index, i64 %zero)
  %match = call i64 @regexFind(i64 %regex, i64 %input)
  call void @objectSet(ptr %object, i64 9, ptr @.regex.last.index, i64 %saved.last.index)
  %found = icmp sge i64 %match, 0
  br i1 %found, label %matched, label %missing
matched:
  %start = lshr i64 %match, 32
  %input.ptr = call ptr @valueStringPtr(i64 %input)
  %start.units = call i64 @regexUtf16Index(ptr %input.ptr, i64 %start)
  %start.number = uitofp i64 %start.units to double
  br label %box
missing:
  br label %box
box:
  %number = phi double [ %start.number, %matched ], [ -1.0, %missing ]
  %value = call i64 @valueBoxNumber(double %number)
  %result.0 = insertvalue { i64, i1 } undef, i64 %value, 0
  %result = insertvalue { i64, i1 } %result.0, i1 false, 1
  ret { i64, i1 } %result
}
define ptr @regexSplit(i64 %regex, i64 %input, i64 %limit) {
entry:
  %object = call ptr @valueObjectPtr(i64 %regex)
  %saved.last.index = call i64 @objectGet(ptr %object, i64 9, ptr @.regex.last.index)
  %saved.global = call i64 @objectGet(ptr %object, i64 6, ptr @.regex.global)
  call void @objectSet(ptr %object, i64 6, ptr @.regex.global, i64 9222246136947933186)
  %input.ptr = call ptr @valueStringPtr(i64 %input)
  %input.len = call i64 @valueStringLength(i64 %input)
  %source.value = call i64 @objectGet(ptr %object, i64 6, ptr @.regex.source)
  %source.ptr = call ptr @valueStringPtr(i64 %source.value)
  %source.len = call i64 @valueStringLength(i64 %source.value)
  %capture.count = call i64 @regexCaptureIndex(ptr %source.ptr, i64 %source.len, i8 40)
  %array = call ptr @arrayNew(i64 0)
  %cursor.addr = alloca i64
  %search.addr = alloca i64
  %capture.addr = alloca i64
  store i64 0, ptr %cursor.addr
  store i64 0, ptr %search.addr
  br label %loop
loop:
  %search = load i64, ptr %search.addr
  %search.in.range = icmp ule i64 %search, %input.len
  br i1 %search.in.range, label %limit.check, label %restore
limit.check:
  %length = call i64 @arrayLength(ptr %array)
  %unlimited = icmp slt i64 %limit, 0
  %below.limit = icmp ult i64 %length, %limit
  %can.push = or i1 %unlimited, %below.limit
  br i1 %can.push, label %find, label %restore
find:
  %search.units = call i64 @regexUtf16Index(ptr %input.ptr, i64 %search)
  %search.number = uitofp i64 %search.units to double
  %search.value = call i64 @valueBoxNumber(double %search.number)
  call void @objectSet(ptr %object, i64 9, ptr @.regex.last.index, i64 %search.value)
  %match = call i64 @regexFind(i64 %regex, i64 %input)
  %found = icmp sge i64 %match, 0
  br i1 %found, label %matched, label %missing
matched:
  %start = lshr i64 %match, 32
  %end = and i64 %match, 4294967295
  %cursor = load i64, ptr %cursor.addr
  %prefix = call i64 @regexSlice(i64 %input, i64 %cursor, i64 %start)
  call i64 @arrayPush(ptr %array, i64 %prefix)
  store i64 1, ptr %capture.addr
  br label %captures
captures:
  %capture.number = load i64, ptr %capture.addr
  %captures.done = icmp ugt i64 %capture.number, %capture.count
  br i1 %captures.done, label %advance, label %capture.limit
capture.limit:
  %capture.array.length = call i64 @arrayLength(ptr %array)
  %capture.below.limit = icmp ult i64 %capture.array.length, %limit
  %capture.can.push = or i1 %unlimited, %capture.below.limit
  br i1 %capture.can.push, label %capture.load, label %restore
capture.load:
  %capture.start.slot = getelementptr [10 x i64], ptr @regex.capture.starts, i64 0, i64 %capture.number
  %capture.end.slot = getelementptr [10 x i64], ptr @regex.capture.ends, i64 0, i64 %capture.number
  %capture.start = load i64, ptr %capture.start.slot
  %capture.end = load i64, ptr %capture.end.slot
  %capture.matched = icmp sge i64 %capture.start, 0
  br i1 %capture.matched, label %capture.slice, label %capture.missing
capture.slice:
  %capture.text = call i64 @regexSlice(i64 %input, i64 %capture.start, i64 %capture.end)
  br label %capture.push
capture.missing:
  br label %capture.push
capture.push:
  %capture.value = phi i64 [ %capture.text, %capture.slice ], [ 9222246136947933184, %capture.missing ]
  call i64 @arrayPush(ptr %array, i64 %capture.value)
  %next.capture = add i64 %capture.number, 1
  store i64 %next.capture, ptr %capture.addr
  br label %captures
advance:
  store i64 %end, ptr %cursor.addr
  %empty = icmp eq i64 %start, %end
  %before.end = icmp ult i64 %end, %input.len
  %empty.can.advance = and i1 %empty, %before.end
  %advanced = add i64 %end, 1
  %next.search = select i1 %empty.can.advance, i64 %advanced, i64 %end
  store i64 %next.search, ptr %search.addr
  %not.before.end = xor i1 %before.end, true
  %empty.at.end = and i1 %empty, %not.before.end
  br i1 %empty.at.end, label %restore, label %loop
missing:
  %suffix.cursor = load i64, ptr %cursor.addr
  %suffix = call i64 @regexSlice(i64 %input, i64 %suffix.cursor, i64 %input.len)
  call i64 @arrayPush(ptr %array, i64 %suffix)
  br label %restore
restore:
  call void @objectSet(ptr %object, i64 6, ptr @.regex.global, i64 %saved.global)
  call void @objectSet(ptr %object, i64 9, ptr @.regex.last.index, i64 %saved.last.index)
  ret ptr %array
}
define i64 @regexExpandReplacement(i64 %input, i64 %replacement, i64 %start, i64 %end) {
entry:
  %input.ptr = call ptr @valueStringPtr(i64 %input)
  %input.len = call i64 @valueStringLength(i64 %input)
  %replacement.ptr = call ptr @valueStringPtr(i64 %replacement)
  %replacement.len = call i64 @valueStringLength(i64 %replacement)
  %empty = call ptr @malloc(i64 1)
  store i8 0, ptr %empty
  %acc.ptr.addr = alloca ptr
  %acc.len.addr = alloca i64
  %position.addr = alloca i64
  %chunk.ptr.addr = alloca ptr
  %chunk.len.addr = alloca i64
  %next.addr = alloca i64
  store ptr %empty, ptr %acc.ptr.addr
  store i64 0, ptr %acc.len.addr
  store i64 0, ptr %position.addr
  br label %loop
loop:
  %position = load i64, ptr %position.addr
  %done = icmp uge i64 %position, %replacement.len
  br i1 %done, label %finish, label %character
character:
  %character.ptr = getelementptr i8, ptr %replacement.ptr, i64 %position
  %character.value = load i8, ptr %character.ptr
  %is.dollar = icmp eq i8 %character.value, 36
  %after.position = add i64 %position, 1
  %has.next = icmp ult i64 %after.position, %replacement.len
  %has.token = and i1 %is.dollar, %has.next
  br i1 %has.token, label %token, label %literal
literal:
  store ptr %character.ptr, ptr %chunk.ptr.addr
  store i64 1, ptr %chunk.len.addr
  store i64 %after.position, ptr %next.addr
  br label %append
token:
  %token.ptr = getelementptr i8, ptr %replacement.ptr, i64 %after.position
  %token.value = load i8, ptr %token.ptr
  %token.dollar = icmp eq i8 %token.value, 36
  %token.match = icmp eq i8 %token.value, 38
  %token.prefix = icmp eq i8 %token.value, 96
  %token.suffix = icmp eq i8 %token.value, 39
  %token.digit.low = icmp uge i8 %token.value, 49
  %token.digit.high = icmp ule i8 %token.value, 57
  %token.digit = and i1 %token.digit.low, %token.digit.high
  br i1 %token.dollar, label %sub.dollar, label %token.match.check
token.match.check:
  br i1 %token.match, label %sub.match, label %token.prefix.check
token.prefix.check:
  br i1 %token.prefix, label %sub.prefix, label %token.suffix.check
token.suffix.check:
  br i1 %token.suffix, label %sub.suffix, label %token.capture.check
token.capture.check:
  br i1 %token.digit, label %sub.capture, label %literal
sub.dollar:
  store ptr %token.ptr, ptr %chunk.ptr.addr
  store i64 1, ptr %chunk.len.addr
  br label %sub.advance
sub.match:
  %match.ptr = getelementptr i8, ptr %input.ptr, i64 %start
  %match.len = sub i64 %end, %start
  store ptr %match.ptr, ptr %chunk.ptr.addr
  store i64 %match.len, ptr %chunk.len.addr
  br label %sub.advance
sub.prefix:
  store ptr %input.ptr, ptr %chunk.ptr.addr
  store i64 %start, ptr %chunk.len.addr
  br label %sub.advance
sub.suffix:
  %suffix.ptr = getelementptr i8, ptr %input.ptr, i64 %end
  %suffix.len = sub i64 %input.len, %end
  store ptr %suffix.ptr, ptr %chunk.ptr.addr
  store i64 %suffix.len, ptr %chunk.len.addr
  br label %sub.advance
sub.capture:
  %capture.raw = zext i8 %token.value to i64
  %capture.number = sub i64 %capture.raw, 48
  %capture.start.slot = getelementptr [10 x i64], ptr @regex.capture.starts, i64 0, i64 %capture.number
  %capture.end.slot = getelementptr [10 x i64], ptr @regex.capture.ends, i64 0, i64 %capture.number
  %capture.start = load i64, ptr %capture.start.slot
  %capture.end = load i64, ptr %capture.end.slot
  %capture.matched = icmp sge i64 %capture.start, 0
  br i1 %capture.matched, label %sub.capture.matched, label %sub.capture.missing
sub.capture.matched:
  %capture.ptr = getelementptr i8, ptr %input.ptr, i64 %capture.start
  %capture.len = sub i64 %capture.end, %capture.start
  store ptr %capture.ptr, ptr %chunk.ptr.addr
  store i64 %capture.len, ptr %chunk.len.addr
  br label %sub.advance
sub.capture.missing:
  store ptr %input.ptr, ptr %chunk.ptr.addr
  store i64 0, ptr %chunk.len.addr
  br label %sub.advance
sub.advance:
  %after.token = add i64 %position, 2
  store i64 %after.token, ptr %next.addr
  br label %append
append:
  %acc.ptr = load ptr, ptr %acc.ptr.addr
  %acc.len = load i64, ptr %acc.len.addr
  %chunk.ptr = load ptr, ptr %chunk.ptr.addr
  %chunk.len = load i64, ptr %chunk.len.addr
  %joined = call ptr @strConcat(i64 %acc.len, ptr %acc.ptr, i64 %chunk.len, ptr %chunk.ptr)
  %joined.len = add i64 %acc.len, %chunk.len
  %next = load i64, ptr %next.addr
  store ptr %joined, ptr %acc.ptr.addr
  store i64 %joined.len, ptr %acc.len.addr
  store i64 %next, ptr %position.addr
  br label %loop
finish:
  %result.ptr = load ptr, ptr %acc.ptr.addr
  %result.len = load i64, ptr %acc.len.addr
  %result = call i64 @valueBoxString(ptr %result.ptr, i64 %result.len)
  ret i64 %result
}
define { i64, i1 } @regexReplace(i64 %regex, i64 %input, i64 %replacement) {
entry:
  %object = call ptr @valueObjectPtr(i64 %regex)
  %global.value = call i64 @objectGet(ptr %object, i64 6, ptr @.regex.global)
  %is.global = icmp eq i64 %global.value, 9222246136947933186
  %saved.last.index = call i64 @objectGet(ptr %object, i64 9, ptr @.regex.last.index)
  %zero = call i64 @valueBoxNumber(double 0.0)
  br i1 %is.global, label %reset.global, label %initialize
reset.global:
  call void @objectSet(ptr %object, i64 9, ptr @.regex.last.index, i64 %zero)
  br label %initialize
initialize:
  %input.ptr = call ptr @valueStringPtr(i64 %input)
  %input.len = call i64 @valueStringLength(i64 %input)
  %empty.ptr = call ptr @malloc(i64 1)
  store i8 0, ptr %empty.ptr
  %acc.ptr.addr = alloca ptr
  %acc.len.addr = alloca i64
  %cursor.addr = alloca i64
  %matched.addr = alloca i1
  store ptr %empty.ptr, ptr %acc.ptr.addr
  store i64 0, ptr %acc.len.addr
  store i64 0, ptr %cursor.addr
  store i1 false, ptr %matched.addr
  br label %find
find:
  %match = call i64 @regexFind(i64 %regex, i64 %input)
  %found = icmp sge i64 %match, 0
  br i1 %found, label %replace, label %finish
replace:
  store i1 true, ptr %matched.addr
  %start = lshr i64 %match, 32
  %end = and i64 %match, 4294967295
  %cursor = load i64, ptr %cursor.addr
  %prefix.ptr = getelementptr i8, ptr %input.ptr, i64 %cursor
  %prefix.len = sub i64 %start, %cursor
  %acc.ptr.0 = load ptr, ptr %acc.ptr.addr
  %acc.len.0 = load i64, ptr %acc.len.addr
  %with.prefix = call ptr @strConcat(i64 %acc.len.0, ptr %acc.ptr.0, i64 %prefix.len, ptr %prefix.ptr)
  %with.prefix.len = add i64 %acc.len.0, %prefix.len
  %expanded = call i64 @regexExpandReplacement(i64 %input, i64 %replacement, i64 %start, i64 %end)
  %expanded.ptr = call ptr @valueStringPtr(i64 %expanded)
  %expanded.len = call i64 @valueStringLength(i64 %expanded)
  %with.replacement = call ptr @strConcat(i64 %with.prefix.len, ptr %with.prefix, i64 %expanded.len, ptr %expanded.ptr)
  %with.replacement.len = add i64 %with.prefix.len, %expanded.len
  store ptr %with.replacement, ptr %acc.ptr.addr
  store i64 %with.replacement.len, ptr %acc.len.addr
  store i64 %end, ptr %cursor.addr
  br i1 %is.global, label %global.advance, label %finish
global.advance:
  %empty.match = icmp eq i64 %start, %end
  br i1 %empty.match, label %empty.advance, label %find
empty.advance:
  %at.end = icmp uge i64 %end, %input.len
  br i1 %at.end, label %finish, label %empty.update
empty.update:
  %end.units = call i64 @regexUtf16Index(ptr %input.ptr, i64 %end)
  %next.units = add i64 %end.units, 1
  %next.number = uitofp i64 %next.units to double
  %next.value = call i64 @valueBoxNumber(double %next.number)
  call void @objectSet(ptr %object, i64 9, ptr @.regex.last.index, i64 %next.value)
  br label %find
finish:
  %cursor.final = load i64, ptr %cursor.addr
  %suffix.ptr = getelementptr i8, ptr %input.ptr, i64 %cursor.final
  %suffix.len = sub i64 %input.len, %cursor.final
  %acc.ptr.final = load ptr, ptr %acc.ptr.addr
  %acc.len.final = load i64, ptr %acc.len.addr
  %output.ptr = call ptr @strConcat(i64 %acc.len.final, ptr %acc.ptr.final, i64 %suffix.len, ptr %suffix.ptr)
  %output.len = add i64 %acc.len.final, %suffix.len
  %output = call i64 @valueBoxString(ptr %output.ptr, i64 %output.len)
  br i1 %is.global, label %restore.global, label %restore.single
restore.global:
  call void @objectSet(ptr %object, i64 9, ptr @.regex.last.index, i64 %zero)
  br label %return
restore.single:
  call void @objectSet(ptr %object, i64 9, ptr @.regex.last.index, i64 %saved.last.index)
  br label %return
return:
  %result.0 = insertvalue { i64, i1 } undef, i64 %output, 0
  %result = insertvalue { i64, i1 } %result.0, i1 false, 1
  ret { i64, i1 } %result
}
