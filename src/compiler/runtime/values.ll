@.typeof.undefined = private unnamed_addr constant [10 x i8] c"undefined\00"
@.typeof.object = private unnamed_addr constant [7 x i8] c"object\00"
@.typeof.boolean = private unnamed_addr constant [8 x i8] c"boolean\00"
@.typeof.number = private unnamed_addr constant [7 x i8] c"number\00"
@.typeof.string = private unnamed_addr constant [7 x i8] c"string\00"
@.typeof.function = private unnamed_addr constant [9 x i8] c"function\00"
@.typeof.symbol = private unnamed_addr constant [7 x i8] c"symbol\00"
@.typeof.bigint = private unnamed_addr constant [7 x i8] c"bigint\00"

; The type of a boxed value after its binding read has checked lexical initialization.
define { ptr, i64 } @valueTypeOf(i64 %value) {
entry:
  %undefined = icmp eq i64 %value, 9222246136947933184
  %true = icmp eq i64 %value, 9222246136947933186
  %false = icmp eq i64 %value, 9222246136947933185
  %boolean = or i1 %true, %false
  %symbol = call i1 @valueIsSymbol(i64 %value)
  %bigint = call i1 @valueIsBigInt(i64 %value)
  %number = call i1 @valueIsNumberForSameValueZero(i64 %value)
  %string = call i1 @valueIsString(i64 %value)
  %function = call i1 @valueIsFunction(i64 %value)
  %number.ptr = select i1 %number, ptr @.typeof.number, ptr @.typeof.object
  %bigint.ptr = select i1 %bigint, ptr @.typeof.bigint, ptr %number.ptr
  %symbol.ptr = select i1 %symbol, ptr @.typeof.symbol, ptr %bigint.ptr
  %function.ptr = select i1 %function, ptr @.typeof.function, ptr %symbol.ptr
  %function.len = select i1 %function, i64 8, i64 6
  %string.ptr = select i1 %string, ptr @.typeof.string, ptr %function.ptr
  %string.len = select i1 %string, i64 6, i64 %function.len
  %boolean.ptr = select i1 %boolean, ptr @.typeof.boolean, ptr %string.ptr
  %boolean.len = select i1 %boolean, i64 7, i64 %string.len
  %pointer = select i1 %undefined, ptr @.typeof.undefined, ptr %boolean.ptr
  %length = select i1 %undefined, i64 9, i64 %boolean.len
  %result.0 = insertvalue { ptr, i64 } undef, ptr %pointer, 0
  %result = insertvalue { ptr, i64 } %result.0, i64 %length, 1
  ret { ptr, i64 } %result
}

define i1 @valueStrictEquals(i64 %left, i64 %right) {
entry:
  %left.number = call i1 @valueIsNumberForSameValueZero(i64 %left)
  %right.number = call i1 @valueIsNumberForSameValueZero(i64 %right)
  %both.number = and i1 %left.number, %right.number
  br i1 %both.number, label %number.compare, label %check.same
number.compare:
  %left.d = call double @valueNumber(i64 %left)
  %right.d = call double @valueNumber(i64 %right)
  %numeric.equal = fcmp oeq double %left.d, %right.d
  br i1 %numeric.equal, label %equal, label %not.equal
check.same:
  %same = icmp eq i64 %left, %right
  br i1 %same, label %equal, label %check.strings
check.strings:
  %left.tag = and i64 %left, -281474976710656
  %right.tag = and i64 %right, -281474976710656
  %left.string = icmp eq i64 %left.tag, 9221683186994511872
  %right.string = icmp eq i64 %right.tag, 9221683186994511872
  %both.strings = and i1 %left.string, %right.string
  br i1 %both.strings, label %string.compare, label %check.bigints
check.bigints:
  %left.bi = icmp eq i64 %left.tag, 9222809086901354496
  %right.bi = icmp eq i64 %right.tag, 9222809086901354496
  %both.bi = and i1 %left.bi, %right.bi
  br i1 %both.bi, label %bigint.compare, label %not.equal
bigint.compare:
  %left.bi.v = call i64 @bigIntToI64(i64 %left)
  %right.bi.v = call i64 @bigIntToI64(i64 %right)
  %bi.eq = icmp eq i64 %left.bi.v, %right.bi.v
  br i1 %bi.eq, label %equal, label %not.equal
string.compare:
  %left.len = call i64 @valueStringLength(i64 %left)
  %right.len = call i64 @valueStringLength(i64 %right)
  %same.len = icmp eq i64 %left.len, %right.len
  br i1 %same.len, label %string.bytes, label %not.equal
string.bytes:
  %left.ptr = call ptr @valueStringPtr(i64 %left)
  %right.ptr = call ptr @valueStringPtr(i64 %right)
  %cmp = call i32 @memcmp(ptr %left.ptr, ptr %right.ptr, i64 %left.len)
  %same.bytes = icmp eq i32 %cmp, 0
  br i1 %same.bytes, label %equal, label %not.equal
equal:
  ret i1 true
not.equal:
  ret i1 false
}
define i1 @valueIsNumberForSameValueZero(i64 %value) {
entry:
  %is.undefined = icmp eq i64 %value, 9222246136947933184
  br i1 %is.undefined, label %false, label %check.false
check.false:
  %is.false = icmp eq i64 %value, 9222246136947933185
  br i1 %is.false, label %false, label %check.true
check.true:
  %is.true = icmp eq i64 %value, 9222246136947933186
  br i1 %is.true, label %false, label %check.null
check.null:
  %is.null = icmp eq i64 %value, 9222246136947933187
  br i1 %is.null, label %false, label %check.hole
check.hole:
  %is.hole = icmp eq i64 %value, 9222246136947933191
  br i1 %is.hole, label %false, label %check.tag
check.tag:
  %tag = and i64 %value, -281474976710656
  %is.object = icmp eq i64 %tag, 9221120237041090560
  %is.array = icmp eq i64 %tag, 9221401712017801216
  %is.string = icmp eq i64 %tag, 9221683186994511872
  %is.function = icmp eq i64 %tag, 9221964661971222528
  %is.symbol = icmp eq i64 %tag, 9222527611924643840
  %is.bigint = icmp eq i64 %tag, 9222809086901354496
  %is.object.or.array = or i1 %is.object, %is.array
  %is.aggregate.or.string = or i1 %is.object.or.array, %is.string
  %is.fn.or.sym = or i1 %is.function, %is.symbol
  %is.fn.sym.bi = or i1 %is.fn.or.sym, %is.bigint
  %is.boxed = or i1 %is.aggregate.or.string, %is.fn.sym.bi
  br i1 %is.boxed, label %false, label %true
true:
  ret i1 true
false:
  ret i1 false
}
define i1 @valueSameValueZero(i64 %left, i64 %right) {
entry:
  %strict = call i1 @valueStrictEquals(i64 %left, i64 %right)
  br i1 %strict, label %true, label %number.guard
number.guard:
  %left.number = call i1 @valueIsNumberForSameValueZero(i64 %left)
  %right.number = call i1 @valueIsNumberForSameValueZero(i64 %right)
  %both.number = and i1 %left.number, %right.number
  br i1 %both.number, label %number.compare, label %false
number.compare:
  %left.d = call double @valueNumber(i64 %left)
  %right.d = call double @valueNumber(i64 %right)
  %numeric.equal = fcmp oeq double %left.d, %right.d
  br i1 %numeric.equal, label %true, label %nan.compare
nan.compare:
  %left.nan = fcmp uno double %left.d, %left.d
  %right.nan = fcmp uno double %right.d, %right.d
  %both.nan = and i1 %left.nan, %right.nan
  br i1 %both.nan, label %true, label %false
true:
  ret i1 true
false:
  ret i1 false
}
@.value.infinity = private unnamed_addr constant [9 x i8] c"Infinity\00"

define double @valueToNumber(i64 %value) {
entry:
  %end.slot = alloca ptr
  %is.undefined = icmp eq i64 %value, 9222246136947933184
  br i1 %is.undefined, label %nan, label %check.null
check.null:
  %is.null = icmp eq i64 %value, 9222246136947933187
  br i1 %is.null, label %zero, label %check.false
check.false:
  %is.false = icmp eq i64 %value, 9222246136947933185
  br i1 %is.false, label %zero, label %check.true
check.true:
  %is.true = icmp eq i64 %value, 9222246136947933186
  br i1 %is.true, label %one, label %check.string
check.string:
  %tag = and i64 %value, -281474976710656
  %is.string = icmp eq i64 %tag, 9221683186994511872
  br i1 %is.string, label %string, label %check.aggregate
check.aggregate:
  %is.object = icmp eq i64 %tag, 9221120237041090560
  %is.array = icmp eq i64 %tag, 9221401712017801216
  %is.symbol = icmp eq i64 %tag, 9222527611924643840
  %is.obj.arr = or i1 %is.object, %is.array
  %is.aggregate = or i1 %is.obj.arr, %is.symbol
  br i1 %is.aggregate, label %nan, label %check.bigint.num
check.bigint.num:
  %is.bi.num = icmp eq i64 %tag, 9222809086901354496
  br i1 %is.bi.num, label %as.bigint, label %as.number
as.bigint:
  %bi.raw = call i64 @bigIntToI64(i64 %value)
  %bi.f = sitofp i64 %bi.raw to double
  ret double %bi.f
string:
  %ptr = call ptr @valueStringPtr(i64 %value)
  br label %string.skip.ws
string.skip.ws:
  %scan.i = phi i64 [ 0, %string ], [ %scan.next, %scan_ws ]
  %scan.ptr = getelementptr i8, ptr %ptr, i64 %scan.i
  %scan.byte = load i8, ptr %scan.ptr
  %scan.is.space = icmp eq i8 %scan.byte, 32
  %scan.ctl.off = sub i8 %scan.byte, 9
  %scan.is.ctl = icmp ule i8 %scan.ctl.off, 4
  %scan.is.ws = or i1 %scan.is.space, %scan.is.ctl
  br i1 %scan.is.ws, label %scan_ws, label %string.validate
scan_ws:
  %scan.next = add i64 %scan.i, 1
  br label %string.skip.ws
string.validate:
  %is.empty = icmp eq i8 %scan.byte, 0
  br i1 %is.empty, label %zero, label %string.check.radix
string.check.radix:
  %start.ptr = getelementptr i8, ptr %ptr, i64 %scan.i
  %starts.zero = icmp eq i8 %scan.byte, 48
  br i1 %starts.zero, label %radix.prefix, label %string.check.sign
radix.prefix:
  %radix.ch.ptr = getelementptr i8, ptr %start.ptr, i64 1
  %radix.ch = load i8, ptr %radix.ch.ptr
  %is.hex.lo = icmp eq i8 %radix.ch, 120
  %is.hex.hi = icmp eq i8 %radix.ch, 88
  %is.hex = or i1 %is.hex.lo, %is.hex.hi
  br i1 %is.hex, label %radix.hex, label %radix.check.bin
radix.check.bin:
  %is.bin.lo = icmp eq i8 %radix.ch, 98
  %is.bin.hi = icmp eq i8 %radix.ch, 66
  %is.bin = or i1 %is.bin.lo, %is.bin.hi
  br i1 %is.bin, label %radix.bin, label %radix.check.oct
radix.check.oct:
  %is.oct.lo = icmp eq i8 %radix.ch, 111
  %is.oct.hi = icmp eq i8 %radix.ch, 79
  %is.oct = or i1 %is.oct.lo, %is.oct.hi
  br i1 %is.oct, label %radix.oct, label %string.check.sign
radix.hex:
  br label %radix.start
radix.bin:
  br label %radix.start
radix.oct:
  br label %radix.start
radix.start:
  %radix.base = phi i8 [ 16, %radix.hex ], [ 2, %radix.bin ], [ 8, %radix.oct ]
  %radix.base.f = phi double [ 16.0, %radix.hex ], [ 2.0, %radix.bin ], [ 8.0, %radix.oct ]
  %radix.digits = getelementptr i8, ptr %start.ptr, i64 2
  br label %radix.loop
radix.loop:
  %radix.ptr = phi ptr [ %radix.digits, %radix.start ], [ %radix.next.ptr, %radix.step ]
  %radix.acc = phi double [ 0.0, %radix.start ], [ %radix.next.acc, %radix.step ]
  %radix.count = phi i64 [ 0, %radix.start ], [ %radix.next.count, %radix.step ]
  %radix.byte = load i8, ptr %radix.ptr
  %r.dec = sub i8 %radix.byte, 48
  %r.is.dec = icmp ule i8 %r.dec, 9
  br i1 %r.is.dec, label %radix.check.bound, label %radix.check.lower
radix.check.lower:
  %r.lo = sub i8 %radix.byte, 97
  %r.is.lo = icmp ule i8 %r.lo, 5
  %r.lo.val = add i8 %r.lo, 10
  br i1 %r.is.lo, label %radix.check.bound, label %radix.check.upper
radix.check.upper:
  %r.hi = sub i8 %radix.byte, 65
  %r.is.hi = icmp ule i8 %r.hi, 5
  %r.hi.val = add i8 %r.hi, 10
  br i1 %r.is.hi, label %radix.check.bound, label %radix.done
radix.check.bound:
  %radix.digit = phi i8 [ %r.dec, %radix.loop ], [ %r.lo.val, %radix.check.lower ], [ %r.hi.val, %radix.check.upper ]
  %radix.in.range = icmp ult i8 %radix.digit, %radix.base
  br i1 %radix.in.range, label %radix.step, label %radix.done
radix.step:
  %radix.digit.f = uitofp i8 %radix.digit to double
  %radix.scaled = fmul double %radix.acc, %radix.base.f
  %radix.next.acc = fadd double %radix.scaled, %radix.digit.f
  %radix.next.count = add i64 %radix.count, 1
  %radix.next.ptr = getelementptr i8, ptr %radix.ptr, i64 1
  br label %radix.loop
radix.done:
  %radix.empty = icmp eq i64 %radix.count, 0
  br i1 %radix.empty, label %nan, label %string.tail
string.check.sign:
  %is.plus = icmp eq i8 %scan.byte, 43
  %is.minus = icmp eq i8 %scan.byte, 45
  %has.sign = or i1 %is.plus, %is.minus
  %sign.off = zext i1 %has.sign to i64
  %num.ptr = getelementptr i8, ptr %start.ptr, i64 %sign.off
  %first.byte = load i8, ptr %num.ptr
  %starts.I = icmp eq i8 %first.byte, 73
  br i1 %starts.I, label %inf.loop, label %decimal.check.dot
inf.loop:
  %inf.i = phi i64 [ 0, %string.check.sign ], [ %inf.next, %inf.match ]
  %inf.done = icmp eq i64 %inf.i, 8
  br i1 %inf.done, label %inf.matched, label %inf.cmp
inf.cmp:
  %inf.src.ptr = getelementptr i8, ptr %num.ptr, i64 %inf.i
  %inf.src.byte = load i8, ptr %inf.src.ptr
  %inf.exp.ptr = getelementptr i8, ptr @.value.infinity, i64 %inf.i
  %inf.exp.byte = load i8, ptr %inf.exp.ptr
  %inf.eq = icmp eq i8 %inf.src.byte, %inf.exp.byte
  br i1 %inf.eq, label %inf.match, label %nan
inf.match:
  %inf.next = add i64 %inf.i, 1
  br label %inf.loop
inf.matched:
  %inf.end = getelementptr i8, ptr %num.ptr, i64 8
  %inf.val = select i1 %is.minus, double 0xFFF0000000000000, double 0x7FF0000000000000
  br label %string.tail
decimal.check.dot:
  %is.dot = icmp eq i8 %first.byte, 46
  br i1 %is.dot, label %decimal.after.dot, label %decimal.check.digit
decimal.after.dot:
  %after.dot.ptr = getelementptr i8, ptr %num.ptr, i64 1
  %after.dot = load i8, ptr %after.dot.ptr
  %after.dot.off = sub i8 %after.dot, 48
  %after.dot.digit = icmp ule i8 %after.dot.off, 9
  br i1 %after.dot.digit, label %string.parse, label %nan
decimal.check.digit:
  %first.off = sub i8 %first.byte, 48
  %first.is.digit = icmp ule i8 %first.off, 9
  br i1 %first.is.digit, label %decimal.check.signed.hex, label %nan
decimal.check.signed.hex:
  %first.is.zero = icmp eq i8 %first.byte, 48
  br i1 %first.is.zero, label %decimal.check.hex.prefix, label %string.parse
decimal.check.hex.prefix:
  %second.ptr = getelementptr i8, ptr %num.ptr, i64 1
  %second.byte = load i8, ptr %second.ptr
  %signed.hex.lo = icmp eq i8 %second.byte, 120
  %signed.hex.hi = icmp eq i8 %second.byte, 88
  %signed.hex = or i1 %signed.hex.lo, %signed.hex.hi
  br i1 %signed.hex, label %nan, label %string.parse
string.parse:
  %parsed = call double @strtod(ptr %start.ptr, ptr %end.slot)
  %end.ptr = load ptr, ptr %end.slot
  %no.digits = icmp eq ptr %end.ptr, %start.ptr
  br i1 %no.digits, label %nan, label %string.tail
string.tail:
  %tail.val = phi double [ %radix.acc, %radix.done ], [ %inf.val, %inf.matched ], [ %parsed, %string.parse ], [ %tail.val, %string.tail.ws ]
  %tail.ptr = phi ptr [ %radix.ptr, %radix.done ], [ %inf.end, %inf.matched ], [ %end.ptr, %string.parse ], [ %tail.next, %string.tail.ws ]
  %tail.byte = load i8, ptr %tail.ptr
  %tail.end = icmp eq i8 %tail.byte, 0
  br i1 %tail.end, label %string.ok, label %string.tail.check
string.tail.check:
  %tail.sp = icmp eq i8 %tail.byte, 32
  %tail.ctl.off = sub i8 %tail.byte, 9
  %tail.ctl = icmp ule i8 %tail.ctl.off, 4
  %tail.ws = or i1 %tail.sp, %tail.ctl
  br i1 %tail.ws, label %string.tail.ws, label %nan
string.tail.ws:
  %tail.next = getelementptr i8, ptr %tail.ptr, i64 1
  br label %string.tail
string.ok:
  ret double %tail.val
as.number:
  %number = call double @valueNumber(i64 %value)
  ret double %number
zero:
  ret double 0.0
one:
  ret double 1.0
nan:
  ret double 0x7FF5000000000000
}

; Observable ToNumber(value): converts objects via ToPrimitive(value, NUMBER) before numeric parsing.
define { i64, i1 } @valueToNumberObservable(i64 %value) {
entry:
  %converted = call { i64, i1 } @valueToPrimitive(i64 %value, i1 true)
  %threw = extractvalue { i64, i1 } %converted, 1
  br i1 %threw, label %error, label %parse
error:
  ret { i64, i1 } %converted
parse:
  %primitive = extractvalue { i64, i1 } %converted, 0
  %number = call double @valueToNumber(i64 %primitive)
  %is.nan = fcmp uno double %number, %number
  %safe = select i1 %is.nan, double 0x7FF5000000000000, double %number
  %boxed = call i64 @valueBoxNumber(double %safe)
  %ok.0 = insertvalue { i64, i1 } undef, i64 %boxed, 0
  %ok = insertvalue { i64, i1 } %ok.0, i1 false, 1
  ret { i64, i1 } %ok
}
define i1 @valueLooseEquals(i64 %left, i64 %right) {
entry:
  %strict = call i1 @valueStrictEquals(i64 %left, i64 %right)
  br i1 %strict, label %true, label %nullish
nullish:
  %left.null = icmp eq i64 %left, 9222246136947933187
  %left.undefined = icmp eq i64 %left, 9222246136947933184
  %right.null = icmp eq i64 %right, 9222246136947933187
  %right.undefined = icmp eq i64 %right, 9222246136947933184
  %left.nullish = or i1 %left.null, %left.undefined
  %right.nullish = or i1 %right.null, %right.undefined
  %both.nullish = and i1 %left.nullish, %right.nullish
  br i1 %both.nullish, label %true, label %one.nullish
one.nullish:
  %either.nullish = or i1 %left.nullish, %right.nullish
  br i1 %either.nullish, label %false, label %numeric
numeric:
  %left.num = call double @valueToNumber(i64 %left)
  %right.num = call double @valueToNumber(i64 %right)
  %same = fcmp oeq double %left.num, %right.num
  ret i1 %same
true:
  ret i1 true
false:
  ret i1 false
}
define i1 @valueRelationalCompare(i64 %left, i64 %right, i64 %operator) {
entry:
  %left.tag = and i64 %left, -281474976710656
  %right.tag = and i64 %right, -281474976710656
  %left.string = icmp eq i64 %left.tag, 9221683186994511872
  %right.string = icmp eq i64 %right.tag, 9221683186994511872
  %both.strings = and i1 %left.string, %right.string
  br i1 %both.strings, label %strings, label %check.bi.rel
check.bi.rel:
  %left.bi.rel = icmp eq i64 %left.tag, 9222809086901354496
  %right.bi.rel = icmp eq i64 %right.tag, 9222809086901354496
  %both.bi.rel = and i1 %left.bi.rel, %right.bi.rel
  br i1 %both.bi.rel, label %bigints, label %numbers
bigints:
  %lbi = call i64 @bigIntToI64(i64 %left)
  %rbi = call i64 @bigIntToI64(i64 %right)
  %bi.lt = icmp slt i64 %lbi, %rbi
  %bi.gt = icmp sgt i64 %lbi, %rbi
  br label %select
strings:
  %left.ptr = call ptr @valueStringPtr(i64 %left)
  %right.ptr = call ptr @valueStringPtr(i64 %right)
  %left.len = call i64 @valueStringLength(i64 %left)
  %right.len = call i64 @valueStringLength(i64 %right)
  %min.cmp = icmp ult i64 %left.len, %right.len
  %min = select i1 %min.cmp, i64 %left.len, i64 %right.len
  %byte.cmp = call i32 @memcmp(ptr %left.ptr, ptr %right.ptr, i64 %min)
  %byte.lt = icmp slt i32 %byte.cmp, 0
  %byte.gt = icmp sgt i32 %byte.cmp, 0
  %len.lt = icmp ult i64 %left.len, %right.len
  %len.gt = icmp ugt i64 %left.len, %right.len
  %lt.when.prefix = and i1 %len.lt, true
  %gt.when.prefix = and i1 %len.gt, true
  %bytes.equal = icmp eq i32 %byte.cmp, 0
  %prefix.lt = and i1 %bytes.equal, %lt.when.prefix
  %prefix.gt = and i1 %bytes.equal, %gt.when.prefix
  %str.lt = or i1 %byte.lt, %prefix.lt
  %str.gt = or i1 %byte.gt, %prefix.gt
  br label %select
numbers:
  %left.num = call double @valueToNumber(i64 %left)
  %right.num = call double @valueToNumber(i64 %right)
  %num.lt = fcmp olt double %left.num, %right.num
  %num.gt = fcmp ogt double %left.num, %right.num
  br label %select
select:
  %lt = phi i1 [ %str.lt, %strings ], [ %bi.lt, %bigints ], [ %num.lt, %numbers ]
  %gt = phi i1 [ %str.gt, %strings ], [ %bi.gt, %bigints ], [ %num.gt, %numbers ]
  %not.lt = xor i1 %lt, true
  %not.gt = xor i1 %gt, true
  %eq = and i1 %not.lt, %not.gt
  %op.lt = icmp eq i64 %operator, 0
  %op.le = icmp eq i64 %operator, 1
  %op.gt = icmp eq i64 %operator, 2
  %op.ge = icmp eq i64 %operator, 3
  %le = or i1 %lt, %eq
  %ge = or i1 %gt, %eq
  %r0 = select i1 %op.lt, i1 %lt, i1 false
  %r1 = select i1 %op.le, i1 %le, i1 %r0
  %r2 = select i1 %op.gt, i1 %gt, i1 %r1
  %r3 = select i1 %op.ge, i1 %ge, i1 %r2
  ret i1 %r3
}
define { i64, i1 } @valuePlus(i64 %left, i64 %right) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %left)
  call void @gcRootPush(i64 %right)
  %left.result = call { i64, i1 } @valueToPrimitive(i64 %left, i1 true)
  %left.threw = extractvalue { i64, i1 } %left.result, 1
  br i1 %left.threw, label %left.error, label %convert.right
left.error:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %left.result
convert.right:
  %left.primitive = extractvalue { i64, i1 } %left.result, 0
  call void @gcRootPush(i64 %left.primitive)
  %right.result = call { i64, i1 } @valueToPrimitive(i64 %right, i1 true)
  %right.threw = extractvalue { i64, i1 } %right.result, 1
  br i1 %right.threw, label %right.error, label %add
right.error:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %right.result
add:
  %right.primitive = extractvalue { i64, i1 } %right.result, 0
  call void @gcRootPush(i64 %right.primitive)
  %left.primitive.tag = and i64 %left.primitive, -281474976710656
  %right.primitive.tag = and i64 %right.primitive, -281474976710656
  %left.primitive.string = icmp eq i64 %left.primitive.tag, 9221683186994511872
  %right.primitive.string = icmp eq i64 %right.primitive.tag, 9221683186994511872
  %concat = or i1 %left.primitive.string, %right.primitive.string
  br i1 %concat, label %strings, label %check.bi.add
check.bi.add:
  %left.bi.add = icmp eq i64 %left.primitive.tag, 9222809086901354496
  %right.bi.add = icmp eq i64 %right.primitive.tag, 9222809086901354496
  %both.bi.add = and i1 %left.bi.add, %right.bi.add
  br i1 %both.bi.add, label %bigints.add, label %numbers
bigints.add:
  %lba = call i64 @bigIntToI64(i64 %left.primitive)
  %rba = call i64 @bigIntToI64(i64 %right.primitive)
  %sum.bi = add i64 %lba, %rba
  %boxed.bi = call i64 @bigIntFromI64(i64 %sum.bi)
  br label %done
strings:
  %left.primitive.str = call { ptr, i64 } @valueToString(i64 %left.primitive)
  %left.primitive.ptr = extractvalue { ptr, i64 } %left.primitive.str, 0
  %left.primitive.len = extractvalue { ptr, i64 } %left.primitive.str, 1
  %right.primitive.str = call { ptr, i64 } @valueToString(i64 %right.primitive)
  %right.primitive.ptr = extractvalue { ptr, i64 } %right.primitive.str, 0
  %right.primitive.len = extractvalue { ptr, i64 } %right.primitive.str, 1
  %concat.ptr = call ptr @strConcat(i64 %left.primitive.len, ptr %left.primitive.ptr, i64 %right.primitive.len, ptr %right.primitive.ptr)
  %total = add i64 %left.primitive.len, %right.primitive.len
  %boxed = call i64 @valueBoxString(ptr %concat.ptr, i64 %total)
  br label %done
numbers:
  %left.primitive.num = call double @valueToNumber(i64 %left.primitive)
  %right.primitive.num = call double @valueToNumber(i64 %right.primitive)
  %sum = fadd double %left.primitive.num, %right.primitive.num
  %sum.is.nan = fcmp uno double %sum, %sum
  %safe.sum = select i1 %sum.is.nan, double 0x7FF5000000000000, double %sum
  %boxed.num = call i64 @valueBoxNumber(double %safe.sum)
  br label %done
done:
  %result = phi i64 [ %boxed, %strings ], [ %boxed.bi, %bigints.add ], [ %boxed.num, %numbers ]
  %ok.0 = insertvalue { i64, i1 } undef, i64 %result, 0
  %ok = insertvalue { i64, i1 } %ok.0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %ok
}
define i64 @valueBoxString(ptr %string.ptr, i64 %string.len) {
entry:
  %cell = call ptr @gcAlloc(i64 1, i64 16)
  %payload = getelementptr i8, ptr %cell, i64 8
  store ptr %string.ptr, ptr %payload
  %len.slot = getelementptr i8, ptr %payload, i64 8
  store i64 %string.len, ptr %len.slot
  %box.bits = ptrtoint ptr %cell to i64
  %payload.bits = and i64 %box.bits, 281474976710655
  %value = or i64 %payload.bits, 9221683186994511872
  ret i64 %value
}

define i64 @valueCopyString(ptr %source, i64 %length) {
entry:
  %size = add i64 %length, 1
  %copy = call ptr @malloc(i64 %size)
  %empty = icmp eq i64 %length, 0
  br i1 %empty, label %terminate, label %copy.bytes
copy.bytes:
  call ptr @memcpy(ptr %copy, ptr %source, i64 %length)
  br label %terminate
terminate:
  %end = getelementptr i8, ptr %copy, i64 %length
  store i8 0, ptr %end
  %boxed = call i64 @valueBoxString(ptr %copy, i64 %length)
  %bits = and i64 %boxed, 281474976710655
  %cell = inttoptr i64 %bits to ptr
  %owns = getelementptr i8, ptr %cell, i64 4
  store i8 1, ptr %owns
  ret i64 %boxed
}
define ptr @valueStringPtr(i64 %value) {
entry:
  %box.bits = and i64 %value, 281474976710655
  %box = inttoptr i64 %box.bits to ptr
  %payload = getelementptr i8, ptr %box, i64 8
  %ptr = load ptr, ptr %payload
  ret ptr %ptr
}
define i64 @valueStringLength(i64 %value) {
entry:
  %box.bits = and i64 %value, 281474976710655
  %box = inttoptr i64 %box.bits to ptr
  %payload = getelementptr i8, ptr %box, i64 8
  %len.slot = getelementptr i8, ptr %payload, i64 8
  %len = load i64, ptr %len.slot
  ret i64 %len
}
define i64 @valueBoxArray(ptr %array) {
entry:
  %bits = ptrtoint ptr %array to i64
  %payload = and i64 %bits, 281474976710655
  %value = or i64 %payload, 9221401712017801216
  ret i64 %value
}
define ptr @valueObjectPtr(i64 %value) {
entry:
  %bits = and i64 %value, 281474976710655
  %ptr = inttoptr i64 %bits to ptr
  ret ptr %ptr
}
define i1 @valueIsObject(i64 %value) {
entry:
  %tag = and i64 %value, -281474976710656
  %is.object = icmp eq i64 %tag, 9221120237041090560
  ret i1 %is.object
}
; Maps, sets and their weak forms carry the object tag over a different layout, so code about to read
; properties out of an object must ask for this rather than for the tag.
define i1 @valueIsPlainObject(i64 %value) {
entry:
  %is.object = call i1 @valueIsObject(i64 %value)
  br i1 %is.object, label %check.layout, label %no
check.layout:
  %is.collection = call i1 @valueIsCollection(i64 %value)
  %is.plain = xor i1 %is.collection, true
  ret i1 %is.plain
no:
  ret i1 false
}
define i1 @valueIsArray(i64 %value) {
entry:
  %tag = and i64 %value, -281474976710656
  %is.array = icmp eq i64 %tag, 9221401712017801216
  ret i1 %is.array
}
define i1 @valueIsFunction(i64 %value) {
entry:
  %tag = and i64 %value, -281474976710656
  %is.function = icmp eq i64 %tag, 9221964661971222528
  ret i1 %is.function
}
define i1 @valueIsString(i64 %value) {
entry:
  %tag = and i64 %value, -281474976710656
  %is.string = icmp eq i64 %tag, 9221683186994511872
  ret i1 %is.string
}
define i64 @valuePropertyGet(i64 %value, i64 %key.len, ptr %key.ptr) {
entry:
  %is.function = call i1 @valueIsFunction(i64 %value)
  br i1 %is.function, label %function, label %check.object
function:
  %function.result = call i64 @functionObjectGet(i64 %value, i64 %key.len, ptr %key.ptr)
  ret i64 %function.result
check.object:
  %is.object = call i1 @valueIsObject(i64 %value)
  br i1 %is.object, label %object.kind, label %check.array
object.kind:
  %is.col = call i1 @valueIsCollection(i64 %value)
  br i1 %is.col, label %collection, label %check.proxy.get
check.proxy.get:
  %is.px.get = call i1 @valueIsProxy(i64 %value)
  br i1 %is.px.get, label %proxy.get, label %object
proxy.get:
  %px.get.c = call { i64, i1 } @jsProxyGet(i64 %value, i64 %key.len, ptr %key.ptr)
  %px.get.v = extractvalue { i64, i1 } %px.get.c, 0
  ret i64 %px.get.v
collection:
  %col.result = call i64 @collectionPropertyGet(i64 %value, i64 %key.len, ptr %key.ptr)
  ret i64 %col.result
object:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %object.result = call i64 @objectGet(ptr %object.ptr, i64 %key.len, ptr %key.ptr)
  %object.missing = icmp eq i64 %object.result, 9222246136947933184
  br i1 %object.missing, label %object.inherited, label %object.found
object.found:
  ret i64 %object.result
object.inherited:
  %object.inherited.result = call i64 @errorInheritedProperty(ptr %object.ptr, i64 %key.len, ptr %key.ptr)
  ret i64 %object.inherited.result
check.array:
  %is.array = call i1 @valueIsArray(i64 %value)
  br i1 %is.array, label %array, label %check.string
array:
  %array.ptr = call ptr @valueArrayPtr(i64 %value)
  %array.key.is.length = icmp eq i64 %key.len, 6
  br i1 %array.key.is.length, label %array.length.cmp, label %array.lookup
array.length.cmp:
  %array.length.comparison = call i32 @memcmp(ptr %key.ptr, ptr @.valuelength.key, i64 6)
  %array.is.length = icmp eq i32 %array.length.comparison, 0
  br i1 %array.is.length, label %array.length, label %array.lookup
array.length:
  %array.length.raw = call i64 @arrayLength(ptr %array.ptr)
  %array.length.number = uitofp i64 %array.length.raw to double
  %array.length.value = call i64 @valueBoxNumber(double %array.length.number)
  ret i64 %array.length.value
array.lookup:
  %array.index = call i64 @propertyKeyIndex(i64 %key.len, ptr %key.ptr)
  %array.result = call i64 @arrayGetWithKey(ptr %array.ptr, i64 %array.index, i64 %key.len, ptr %key.ptr)
  %array.has = call i1 @arrayHas(ptr %array.ptr, i64 %array.index, i64 %key.len, ptr %key.ptr)
  br i1 %array.has, label %array.hit, label %array.builtin
array.hit:
  ret i64 %array.result
array.builtin:
  %array.method = call i64 @arrayPrototypeMethod(i64 %key.len, ptr %key.ptr)
  ret i64 %array.method
check.string:
  %is.string = call i1 @valueIsString(i64 %value)
  br i1 %is.string, label %string.builtin, label %check.symbol
check.symbol:
  %is.sym = call i1 @valueIsSymbol(i64 %value)
  br i1 %is.sym, label %symbol.prop, label %check.bigint.prop
symbol.prop:
  %sym.prop = call i64 @symbolPropertyGet(i64 %value, i64 %key.len, ptr %key.ptr)
  ret i64 %sym.prop
check.bigint.prop:
  %is.bi.prop = call i1 @valueIsBigInt(i64 %value)
  br i1 %is.bi.prop, label %bigint.prop, label %scalar.prop
bigint.prop:
  %bi.prop = call i64 @bigIntPropertyGet(i64 %value, i64 %key.len, ptr %key.ptr)
  ret i64 %bi.prop
scalar.prop:
  %scalar.method = call i64 @scalarPropertyGet(i64 %value, i64 %key.len, ptr %key.ptr)
  ret i64 %scalar.method
string.builtin:
  %string.is.iter = icmp eq i64 %key.len, 18
  br i1 %string.is.iter, label %string.iter.cmp, label %string.property
string.iter.cmp:
  %string.key.cmp = call i32 @memcmp(ptr %key.ptr, ptr @.symbol.iterator.key, i64 18)
  %string.key.same = icmp eq i32 %string.key.cmp, 0
  br i1 %string.key.same, label %string.iter, label %string.property
string.iter:
  %string.method = call i64 @functionObjectNew(ptr @stringIteratorMethod, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 0)
  ret i64 %string.method
string.property:
  %string.property.value = call i64 @stringPropertyGet(i64 %value, i64 %key.len, ptr %key.ptr)
  ret i64 %string.property.value
}
@.valuelength.key = private unnamed_addr constant [7 x i8] c"length\00"

define i64 @valueLength(i64 %value) {
entry:
  %tagged = and i64 %value, -281474976710656
  %is.string = icmp eq i64 %tagged, 9221683186994511872
  br i1 %is.string, label %string, label %check.array
string:
  %string.len = call i64 @valueStringLength(i64 %value)
  ret i64 %string.len
check.array:
  %is.array = icmp eq i64 %tagged, 9221401712017801216
  br i1 %is.array, label %array, label %check.object
array:
  %array.ptr = call ptr @valueArrayPtr(i64 %value)
  %array.len = call i64 @arrayLength(ptr %array.ptr)
  ret i64 %array.len
check.object:
  %is.object = icmp eq i64 %tagged, 9221120237041090560
  br i1 %is.object, label %object, label %check.function
check.function:
  %is.function = icmp eq i64 %tagged, 9221964661971222528
  br i1 %is.function, label %function, label %zero
function:
  %function.length.value = call i64 @functionObjectGet(i64 %value, i64 6, ptr @.valuelength.key)
  %function.length.number = call double @valueNumber(i64 %function.length.value)
  %function.length = fptosi double %function.length.number to i64
  ret i64 %function.length
object:
  %is.col = call i1 @valueIsCollection(i64 %value)
  br i1 %is.col, label %zero, label %object.read.len
object.read.len:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %raw = call i64 @objectGet(ptr %object.ptr, i64 6, ptr @.valuelength.key)
  %raw.tagged = and i64 %raw, -281474976710656
  %raw.object = icmp eq i64 %raw.tagged, 9221120237041090560
  %raw.array = icmp eq i64 %raw.tagged, 9221401712017801216
  %raw.string = icmp eq i64 %raw.tagged, 9221683186994511872
  %raw.function = icmp eq i64 %raw.tagged, 9221964661971222528
  %raw.ref.0 = or i1 %raw.object, %raw.array
  %raw.ref.1 = or i1 %raw.string, %raw.function
  %raw.ref = or i1 %raw.ref.0, %raw.ref.1
  %raw.undefined = icmp eq i64 %raw, 9222246136947933184
  %raw.null = icmp eq i64 %raw, 9222246136947933187
  %raw.true = icmp eq i64 %raw, 9222246136947933186
  %raw.false = icmp eq i64 %raw, 9222246136947933185
  %raw.immediate.0 = or i1 %raw.undefined, %raw.null
  %raw.immediate.1 = or i1 %raw.true, %raw.false
  %raw.immediate = or i1 %raw.immediate.0, %raw.immediate.1
  %raw.not.number = or i1 %raw.ref, %raw.immediate
  br i1 %raw.not.number, label %zero, label %object.number
object.number:
  %raw.number = call double @valueNumber(i64 %raw)
  %object.len = fptosi double %raw.number to i64
  ret i64 %object.len
zero:
  ret i64 0
}
define i1 @valueTruthy(i64 %value) {
entry:
  %is.undefined = icmp eq i64 %value, 9222246136947933184
  br i1 %is.undefined, label %false, label %check.null
check.null:
  %is.null = icmp eq i64 %value, 9222246136947933187
  br i1 %is.null, label %false, label %check.false
check.false:
  %is.false = icmp eq i64 %value, 9222246136947933185
  br i1 %is.false, label %false, label %check.true
check.true:
  %is.true = icmp eq i64 %value, 9222246136947933186
  br i1 %is.true, label %true, label %check.string
check.string:
  %tagged = and i64 %value, -281474976710656
  %is.string = icmp eq i64 %tagged, 9221683186994511872
  br i1 %is.string, label %string, label %check.aggregate
string:
  %len = call i64 @valueStringLength(i64 %value)
  %nonempty = icmp ne i64 %len, 0
  ret i1 %nonempty
check.aggregate:
  %is.object = icmp eq i64 %tagged, 9221120237041090560
  %is.array = icmp eq i64 %tagged, 9221401712017801216
  %is.aggregate = or i1 %is.object, %is.array
  br i1 %is.aggregate, label %true, label %check.function
check.function:
  %is.function = icmp eq i64 %tagged, 9221964661971222528
  %is.symbol = icmp eq i64 %tagged, 9222527611924643840
  %is.fn.or.sym = or i1 %is.function, %is.symbol
  br i1 %is.fn.or.sym, label %true, label %check.bigint.truth
check.bigint.truth:
  %is.bi.truth = icmp eq i64 %tagged, 9222809086901354496
  br i1 %is.bi.truth, label %bigint.truth, label %number.block
bigint.truth:
  %bi.tv = call i64 @bigIntToI64(i64 %value)
  %bi.nz = icmp ne i64 %bi.tv, 0
  ret i1 %bi.nz
number.block:
  %number.value = call double @valueNumber(i64 %value)
  %nonzero = fcmp one double %number.value, 0.0
  ret i1 %nonzero
true:
  ret i1 true
false:
  ret i1 false
}
@.value.true = private unnamed_addr constant [5 x i8] c"true\00"
@.value.false = private unnamed_addr constant [6 x i8] c"false\00"
@.value.undefined = private unnamed_addr constant [10 x i8] c"undefined\00"
@.value.null = private unnamed_addr constant [5 x i8] c"null\00"
@.value.object = private unnamed_addr constant [16 x i8] c"[object Object]\00"
@.value.array = private unnamed_addr constant [15 x i8] c"[object Array]\00"

define void @valuePrint(i64 %value) {
entry:
  %is.undefined = icmp eq i64 %value, 9222246136947933184
  br i1 %is.undefined, label %print.undefined, label %check.false
check.false:
  %is.false = icmp eq i64 %value, 9222246136947933185
  br i1 %is.false, label %print.false, label %check.true
check.true:
  %is.true = icmp eq i64 %value, 9222246136947933186
  br i1 %is.true, label %print.true, label %check.null
check.null:
  %is.null = icmp eq i64 %value, 9222246136947933187
  br i1 %is.null, label %print.null, label %check.object
check.object:
  %tagged.object = and i64 %value, -281474976710656
  %is.object = icmp eq i64 %tagged.object, 9221120237041090560
  br i1 %is.object, label %check.error, label %check.array
check.error:
  %vp.is.col = call i1 @valueIsCollection(i64 %value)
  br i1 %vp.is.col, label %print.collection, label %check.error.obj
print.collection:
  %vp.col = call ptr @valueObjectPtr(i64 %value)
  %vp.tag = call { ptr, i64 } @collectionToStringTag(ptr %vp.col)
  %vp.tag.ptr = extractvalue { ptr, i64 } %vp.tag, 0
  call i32 @puts(ptr %vp.tag.ptr)
  ret void
check.error.obj:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %object.class.slot = getelementptr i8, ptr %object.ptr, i64 48
  %object.class = load i64, ptr %object.class.slot
  %is.error = icmp ne i64 %object.class, 0
  br i1 %is.error, label %print.error, label %print.object
check.array:
  %tagged.array = and i64 %value, -281474976710656
  %is.array = icmp eq i64 %tagged.array, 9221401712017801216
  br i1 %is.array, label %print.array, label %check.string
check.string:
  %tagged = and i64 %value, -281474976710656
  %is.string = icmp eq i64 %tagged, 9221683186994511872
  br i1 %is.string, label %print.string, label %check.print.symbol
check.print.symbol:
  %is.sym = icmp eq i64 %tagged, 9222527611924643840
  br i1 %is.sym, label %print.symbol, label %check.print.bigint
print.symbol:
  %sym.str = call { ptr, i64 } @symbolToString(i64 %value)
  %sym.ptr = extractvalue { ptr, i64 } %sym.str, 0
  call i32 @puts(ptr %sym.ptr)
  ret void
check.print.bigint:
  %is.pbi = icmp eq i64 %tagged, 9222809086901354496
  br i1 %is.pbi, label %print.bigint, label %print.number
print.bigint:
  %pbi.str = call { ptr, i64 } @bigIntToString(i64 %value)
  %pbi.ptr = extractvalue { ptr, i64 } %pbi.str, 0
  call i32 @puts(ptr %pbi.ptr)
  ret void
print.undefined:
  call i32 @puts(ptr @.value.undefined)
  ret void
print.false:
  call i32 @puts(ptr @.value.false)
  ret void
print.true:
  call i32 @puts(ptr @.value.true)
  ret void
print.null:
  call i32 @puts(ptr @.value.null)
  ret void
print.object:
  call i32 @puts(ptr @.value.object)
  ret void
print.error:
  %error.string = call { ptr, i64 } @errorToString(ptr %object.ptr)
  %error.ptr = extractvalue { ptr, i64 } %error.string, 0
  call i32 @puts(ptr %error.ptr)
  ret void
print.array:
  call i32 @puts(ptr @.value.array)
  ret void
print.string:
  %ptr = call ptr @valueStringPtr(i64 %value)
  call i32 @puts(ptr %ptr)
  ret void
print.number:
  %number = call double @valueNumber(i64 %value)
  %number.string = call { ptr, i64 } @numberToShortestString(double %number)
  %number.ptr = extractvalue { ptr, i64 } %number.string, 0
  call i32 @puts(ptr %number.ptr)
  ret void
}
@.tostring.true = private unnamed_addr constant [5 x i8] c"true\00"
@.tostring.false = private unnamed_addr constant [6 x i8] c"false\00"
@.tostring.undefined = private unnamed_addr constant [10 x i8] c"undefined\00"
@.tostring.null = private unnamed_addr constant [5 x i8] c"null\00"
@.tostring.object = private unnamed_addr constant [16 x i8] c"[object Object]\00"
@.tostring.array = private unnamed_addr constant [15 x i8] c"[object Array]\00"
@.tostring.comma = private unnamed_addr constant [2 x i8] c",\00"

@.tostring.map = private unnamed_addr constant [13 x i8] c"[object Map]\00"
@.tostring.set = private unnamed_addr constant [13 x i8] c"[object Set]\00"
@.tostring.weakmap = private unnamed_addr constant [17 x i8] c"[object WeakMap]\00"
@.tostring.weakset = private unnamed_addr constant [17 x i8] c"[object WeakSet]\00"

define { ptr, i64 } @collectionToStringTag(ptr %col) {
entry:
  %kind = call i64 @collectionKind(ptr %col)
  %is.map = icmp eq i64 %kind, 0
  br i1 %is.map, label %map, label %check.set
map:
  ret { ptr, i64 } { ptr @.tostring.map, i64 12 }
check.set:
  %is.set = icmp eq i64 %kind, 1
  br i1 %is.set, label %set, label %check.wm
set:
  ret { ptr, i64 } { ptr @.tostring.set, i64 12 }
check.wm:
  %is.wm = icmp eq i64 %kind, 2
  br i1 %is.wm, label %wm, label %ws
wm:
  ret { ptr, i64 } { ptr @.tostring.weakmap, i64 16 }
ws:
  ret { ptr, i64 } { ptr @.tostring.weakset, i64 16 }
}

define { ptr, i64 } @valueToString(i64 %value) {
entry:
  %is.undefined = icmp eq i64 %value, 9222246136947933184
  br i1 %is.undefined, label %undefined, label %check.false
check.false:
  %is.false = icmp eq i64 %value, 9222246136947933185
  br i1 %is.false, label %false, label %check.true
check.true:
  %is.true = icmp eq i64 %value, 9222246136947933186
  br i1 %is.true, label %true, label %check.null
check.null:
  %is.null = icmp eq i64 %value, 9222246136947933187
  br i1 %is.null, label %null, label %check.object
check.object:
  %tagged.object = and i64 %value, -281474976710656
  %is.object = icmp eq i64 %tagged.object, 9221120237041090560
  br i1 %is.object, label %object, label %check.array
check.array:
  %tagged.array = and i64 %value, -281474976710656
  %is.array = icmp eq i64 %tagged.array, 9221401712017801216
  br i1 %is.array, label %array, label %check.string
check.string:
  %tagged.string = and i64 %value, -281474976710656
  %is.string = icmp eq i64 %tagged.string, 9221683186994511872
  br i1 %is.string, label %string, label %check.tostring.symbol
check.tostring.symbol:
  %is.sym = icmp eq i64 %tagged.string, 9222527611924643840
  br i1 %is.sym, label %symbol.str, label %check.tostring.bigint
symbol.str:
  %sym.s = call { ptr, i64 } @symbolToString(i64 %value)
  ret { ptr, i64 } %sym.s
check.tostring.bigint:
  %is.tsbi = icmp eq i64 %tagged.string, 9222809086901354496
  br i1 %is.tsbi, label %bigint.str, label %number
bigint.str:
  %bi.s = call { ptr, i64 } @bigIntToString(i64 %value)
  ret { ptr, i64 } %bi.s
undefined:
  %undefined.0 = insertvalue { ptr, i64 } undef, ptr @.tostring.undefined, 0
  %undefined.1 = insertvalue { ptr, i64 } %undefined.0, i64 9, 1
  ret { ptr, i64 } %undefined.1
false:
  %false.0 = insertvalue { ptr, i64 } undef, ptr @.tostring.false, 0
  %false.1 = insertvalue { ptr, i64 } %false.0, i64 5, 1
  ret { ptr, i64 } %false.1
true:
  %true.0 = insertvalue { ptr, i64 } undef, ptr @.tostring.true, 0
  %true.1 = insertvalue { ptr, i64 } %true.0, i64 4, 1
  ret { ptr, i64 } %true.1
null:
  %null.0 = insertvalue { ptr, i64 } undef, ptr @.tostring.null, 0
  %null.1 = insertvalue { ptr, i64 } %null.0, i64 4, 1
  ret { ptr, i64 } %null.1
object:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %object.is.col = call i1 @valueIsCollection(i64 %value)
  br i1 %object.is.col, label %object.collection, label %object.noncol
object.collection:
  %col.str = call { ptr, i64 } @collectionToStringTag(ptr %object.ptr)
  ret { ptr, i64 } %col.str
object.noncol:
  %object.class.slot = getelementptr i8, ptr %object.ptr, i64 48
  %object.class = load i64, ptr %object.class.slot
  %object.is.error = icmp ne i64 %object.class, 0
  br i1 %object.is.error, label %object.error, label %object.plain
object.error:
  %object.error.string = call { ptr, i64 } @errorToString(ptr %object.ptr)
  ret { ptr, i64 } %object.error.string
object.plain:
  %object.0 = insertvalue { ptr, i64 } undef, ptr @.tostring.object, 0
  %object.1 = insertvalue { ptr, i64 } %object.0, i64 15, 1
  ret { ptr, i64 } %object.1
array:
  %array.ptr = call ptr @valueArrayPtr(i64 %value)
  %joined = call ptr @arrayJoin(ptr %array.ptr, i64 1, ptr @.tostring.comma)
  br label %array.len.scan
array.len.scan:
  %array.len = phi i64 [ 0, %array ], [ %array.len.next, %array.len.more ]
  %array.char = getelementptr i8, ptr %joined, i64 %array.len
  %array.byte = load i8, ptr %array.char
  %array.done = icmp eq i8 %array.byte, 0
  br i1 %array.done, label %array.ret, label %array.len.more
array.len.more:
  %array.len.next = add i64 %array.len, 1
  br label %array.len.scan
array.ret:
  %array.0 = insertvalue { ptr, i64 } undef, ptr %joined, 0
  %array.1 = insertvalue { ptr, i64 } %array.0, i64 %array.len, 1
  ret { ptr, i64 } %array.1
string:
  %string.ptr = call ptr @valueStringPtr(i64 %value)
  %string.len = call i64 @valueStringLength(i64 %value)
  %string.0 = insertvalue { ptr, i64 } undef, ptr %string.ptr, 0
  %string.1 = insertvalue { ptr, i64 } %string.0, i64 %string.len, 1
  ret { ptr, i64 } %string.1
number:
  %number.value = call double @valueNumber(i64 %value)
  %number.text = call { ptr, i64 } @numberToShortestString(double %number.value)
  ret { ptr, i64 } %number.text
}
@.toprimitive.tostring = private unnamed_addr constant [9 x i8] c"toString\00"
@.toprimitive.valueof = private unnamed_addr constant [8 x i8] c"valueOf\00"
@.toprimitive.refused = private unnamed_addr constant [41 x i8] c"Cannot convert object to primitive value\00"

; Whether `value` is an object, array or function: a value ToPrimitive converts.
define i1 @valueIsObjectLike(i64 %value) {
entry:
  %tag = and i64 %value, -281474976710656
  %at.least.object = icmp uge i64 %tag, 9221120237041090560
  %at.most.function = icmp ule i64 %tag, 9221964661971222528
  %is.string = icmp eq i64 %tag, 9221683186994511872
  %is.reference = and i1 %at.least.object, %at.most.function
  %not.string = xor i1 %is.string, true
  %is.object = and i1 %is.reference, %not.string
  ret i1 %is.object
}

; OrdinaryToPrimitive looks up each method only when it is tried, preserving getters and throws.
define { i64, i1 } @valueOrdinaryToPrimitive(i64 %value, i1 %prefer.value) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %value)
  %argv = alloca i64, i64 0
  %first.ptr = select i1 %prefer.value, ptr @.toprimitive.valueof, ptr @.toprimitive.tostring
  %first.len = select i1 %prefer.value, i64 7, i64 8
  %second.ptr = select i1 %prefer.value, ptr @.toprimitive.tostring, ptr @.toprimitive.valueof
  %second.len = select i1 %prefer.value, i64 8, i64 7
  %first.lookup = call { i64, i1 } @valueConversionPropertyGet(i64 %value, i64 %first.len, ptr %first.ptr)
  %first.lookup.threw = extractvalue { i64, i1 } %first.lookup, 1
  br i1 %first.lookup.threw, label %first.lookup.error, label %first.check
first.lookup.error:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %first.lookup
first.check:
  %first.method = extractvalue { i64, i1 } %first.lookup, 0
  %first.callable = call i1 @valueIsFunction(i64 %first.method)
  br i1 %first.callable, label %first.call, label %second
first.call:
  %first.result = call { i64, i1 } @jsCall(i64 %first.method, i64 0, ptr %argv, i64 %value)
  %first.threw = extractvalue { i64, i1 } %first.result, 1
  %first.value = extractvalue { i64, i1 } %first.result, 0
  %first.object = call i1 @valueIsObjectLike(i64 %first.value)
  %first.final = xor i1 %first.object, true
  %first.answers = or i1 %first.threw, %first.final
  br i1 %first.answers, label %first.done, label %second
first.done:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %first.result
second:
  %second.lookup = call { i64, i1 } @valueConversionPropertyGet(i64 %value, i64 %second.len, ptr %second.ptr)
  %second.lookup.threw = extractvalue { i64, i1 } %second.lookup, 1
  br i1 %second.lookup.threw, label %second.lookup.error, label %second.check
second.lookup.error:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %second.lookup
second.check:
  %second.method = extractvalue { i64, i1 } %second.lookup, 0
  %second.callable = call i1 @valueIsFunction(i64 %second.method)
  br i1 %second.callable, label %second.call, label %no.second
second.call:
  %second.result = call { i64, i1 } @jsCall(i64 %second.method, i64 0, ptr %argv, i64 %value)
  %second.threw = extractvalue { i64, i1 } %second.result, 1
  %second.value = extractvalue { i64, i1 } %second.result, 0
  %second.object = call i1 @valueIsObjectLike(i64 %second.value)
  %second.final = xor i1 %second.object, true
  %second.answers = or i1 %second.threw, %second.final
  br i1 %second.answers, label %second.done, label %refused
second.done:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %second.result
no.second:
  br label %refused
refused:
  call void @gcRootRestore(i64 %frame)
  %message = call i64 @valueBoxString(ptr @.toprimitive.refused, i64 40)
  %error = call { i64, i1 } @iteratorTypeError(i64 %message)
  ret { i64, i1 } %error
}

; ToPrimitive(value): an object converts through `valueOrdinaryToPrimitive`, and any other value
; is already primitive. %prefer.value selects the default hint `+` uses, which tries `valueOf` first.
define { i64, i1 } @valueToPrimitive(i64 %value, i1 %prefer.value) {
entry:
  %is.object = call i1 @valueIsObjectLike(i64 %value)
  br i1 %is.object, label %convert, label %primitive
convert:
  %converted = call { i64, i1 } @valueOrdinaryToPrimitive(i64 %value, i1 %prefer.value)
  ret { i64, i1 } %converted
primitive:
  %primitive.0 = insertvalue { i64, i1 } undef, i64 %value, 0
  %primitive.1 = insertvalue { i64, i1 } %primitive.0, i1 false, 1
  ret { i64, i1 } %primitive.1
}

; ToString(value) returns a boxed string after observable conversion through inherited methods.
define { i64, i1 } @valueToStringObservable(i64 %value, i1 %prefer.value) {
entry:
  %converted = call { i64, i1 } @valueToPrimitive(i64 %value, i1 %prefer.value)
  %threw = extractvalue { i64, i1 } %converted, 1
  %primitive = extractvalue { i64, i1 } %converted, 0
  %is.string = call i1 @valueIsString(i64 %primitive)
  %answers = or i1 %threw, %is.string
  br i1 %answers, label %done, label %format
done:
  ret { i64, i1 } %converted
format:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %primitive)
  %text = call { ptr, i64 } @valueToString(i64 %primitive)
  %text.ptr = extractvalue { ptr, i64 } %text, 0
  %text.len = extractvalue { ptr, i64 } %text, 1
  %boxed = call i64 @valueBoxString(ptr %text.ptr, i64 %text.len)
  call void @gcRootRestore(i64 %frame)
  %boxed.0 = insertvalue { i64, i1 } undef, i64 %boxed, 0
  %boxed.1 = insertvalue { i64, i1 } %boxed.0, i1 false, 1
  ret { i64, i1 } %boxed.1
}
define ptr @indexToString(i64 %index) {
entry:
  br label %count.loop
count.loop:
  %count.value = phi i64 [ %index, %entry ], [ %count.next.value, %count.more ]
  %digits = phi i64 [ 1, %entry ], [ %digits.next, %count.more ]
  %count.more.check = icmp uge i64 %count.value, 10
  br i1 %count.more.check, label %count.more, label %alloc
count.more:
  %count.next.value = udiv i64 %count.value, 10
  %digits.next = add i64 %digits, 1
  br label %count.loop
alloc:
  %alloc.size = add i64 %digits, 1
  %out = call ptr @malloc(i64 %alloc.size)
  %nul = getelementptr i8, ptr %out, i64 %digits
  store i8 0, ptr %nul
  br label %fill.loop
fill.loop:
  %fill.value = phi i64 [ %index, %alloc ], [ %fill.next.value, %fill.body ]
  %pos = phi i64 [ %digits, %alloc ], [ %next.pos, %fill.body ]
  %done = icmp eq i64 %pos, 0
  br i1 %done, label %exit, label %fill.body
fill.body:
  %next.pos = sub i64 %pos, 1
  %quotient = udiv i64 %fill.value, 10
  %q10 = mul i64 %quotient, 10
  %remainder = sub i64 %fill.value, %q10
  %digit = add i64 %remainder, 48
  %byte = trunc i64 %digit to i8
  %slot = getelementptr i8, ptr %out, i64 %next.pos
  store i8 %byte, ptr %slot
  %fill.next.value = udiv i64 %fill.value, 10
  br label %fill.loop
exit:
  ret ptr %out
}
define i1 @jsInstanceOf(i64 %value, ptr %target.prototype) {
entry:
  %is.object = call i1 @valueIsObject(i64 %value)
  br i1 %is.object, label %start, label %missing
start:
  %is.col = call i1 @valueIsCollection(i64 %value)
  br i1 %is.col, label %missing, label %start.object
start.object:
  %object = call ptr @valueObjectPtr(i64 %value)
  %first = call ptr @objectGetPrototype(ptr %object)
  br label %lookup
lookup:
  %current = phi ptr [ %first, %start.object ], [ %next, %advance ]
  %is.null = icmp eq ptr %current, null
  br i1 %is.null, label %missing, label %compare
compare:
  %matches = icmp eq ptr %current, %target.prototype
  br i1 %matches, label %found, label %advance
advance:
  %next = call ptr @objectGetPrototype(ptr %current)
  br label %lookup
found:
  ret i1 true
missing:
  ret i1 false
}
define i64 @boxedValueOf(ptr %object) {
entry:
  %count = load i64, ptr %object
  %is.empty = icmp eq i64 %count, 0
  br i1 %is.empty, label %miss, label %load
load:
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  %value.slot = getelementptr i8, ptr %entries, i64 16
  %value = load i64, ptr %value.slot
  ret i64 %value
miss:
  ret i64 9222246136947933184
}
define { ptr, i64 } @boxedToString(ptr %object) {
entry:
  %count = load i64, ptr %object
  %is.empty = icmp eq i64 %count, 0
  br i1 %is.empty, label %miss, label %load
load:
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  %value.slot = getelementptr i8, ptr %entries, i64 16
  %value = load i64, ptr %value.slot
  %raw = call { ptr, i64 } @valueToString(i64 %value)
  ret { ptr, i64 } %raw
miss:
  ret { ptr, i64 } { ptr null, i64 0 }
}

@.value.coercible.error = private unnamed_addr constant [43 x i8] c"Cannot convert undefined or null to object\00"

define { i64, i1 } @requireObjectCoercible(i64 %value) {
entry:
  %is.undefined = icmp eq i64 %value, 9222246136947933184
  %is.null = icmp eq i64 %value, 9222246136947933187
  %is.nullish = or i1 %is.undefined, %is.null
  br i1 %is.nullish, label %error, label %success
error:
  %message = call i64 @valueBoxString(ptr @.value.coercible.error, i64 42)
  %error.result = call { i64, i1 } @iteratorTypeError(i64 %message)
  ret { i64, i1 } %error.result
success:
  %result.0 = insertvalue { i64, i1 } undef, i64 %value, 0
  %result.1 = insertvalue { i64, i1 } %result.0, i1 false, 1
  ret { i64, i1 } %result.1
}

define { i64, i1 } @checkedValuePropertyGet(i64 %value, i64 %key.len, ptr %key.ptr) {
entry:
  %coercible = call { i64, i1 } @requireObjectCoercible(i64 %value)
  %exception = extractvalue { i64, i1 } %coercible, 1
  br i1 %exception, label %error, label %read
error:
  ret { i64, i1 } %coercible
read:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %value)
  %object = call i1 @valueIsObject(i64 %value)
  br i1 %object, label %object.read, label %check.function
object.read:
  %read.is.col = call i1 @valueIsCollection(i64 %value)
  br i1 %read.is.col, label %collection.read, label %check.proxy.read
check.proxy.read:
  %read.is.px = call i1 @valueIsProxy(i64 %value)
  br i1 %read.is.px, label %proxy.read, label %plain.object.read
proxy.read:
  %px.read.res = call { i64, i1 } @jsProxyGet(i64 %value, i64 %key.len, ptr %key.ptr)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %px.read.res
collection.read:
  %col.prop = call i64 @collectionPropertyGet(i64 %value, i64 %key.len, ptr %key.ptr)
  %col.ok.0 = insertvalue { i64, i1 } undef, i64 %col.prop, 0
  %col.ok = insertvalue { i64, i1 } %col.ok.0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %col.ok
plain.object.read:
  %object.result = call { i64, i1 } @objectPropertyGet(i64 %value, i64 %key.len, ptr %key.ptr)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %object.result
check.function:
  %is.fn = call i1 @valueIsFunction(i64 %value)
  br i1 %is.fn, label %function.read, label %other.read
function.read:
  %fn.result = call { i64, i1 } @functionObjectPropertyGet(i64 %value, i64 %key.len, ptr %key.ptr)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %fn.result
other.read:
  %property = call i64 @valuePropertyGet(i64 %value, i64 %key.len, ptr %key.ptr)
  %result.0 = insertvalue { i64, i1 } undef, i64 %property, 0
  %result.1 = insertvalue { i64, i1 } %result.0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %result.1
}

; Parse a canonical nonnegative integer property key. Other keys return -1.
define i64 @propertyKeyIndex(i64 %length, ptr %key) {
entry:
  %empty = icmp eq i64 %length, 0
  %too.long = icmp ugt i64 %length, 16
  %invalid.length = or i1 %empty, %too.long
  br i1 %invalid.length, label %invalid, label %first
first:
  %first.byte = load i8, ptr %key
  %leading.zero = icmp eq i8 %first.byte, 48
  %multiple = icmp ugt i64 %length, 1
  %invalid.zero = and i1 %leading.zero, %multiple
  br i1 %invalid.zero, label %invalid, label %loop
loop:
  %position = phi i64 [ 0, %first ], [ %next.position, %advance ]
  %index = phi i64 [ 0, %first ], [ %next.index, %advance ]
  %done = icmp eq i64 %position, %length
  br i1 %done, label %success, label %digit
digit:
  %pointer = getelementptr i8, ptr %key, i64 %position
  %byte = load i8, ptr %pointer
  %number = sub i8 %byte, 48
  %is.digit = icmp ule i8 %number, 9
  br i1 %is.digit, label %accumulate, label %invalid
accumulate:
  %wide = zext i8 %number to i64
  %scaled = mul i64 %index, 10
  %next.index = add i64 %scaled, %wide
  %overflow = icmp ugt i64 %next.index, 9007199254740991
  br i1 %overflow, label %invalid, label %advance
advance:
  %next.position = add i64 %position, 1
  br label %loop
success:
  ret i64 %index
invalid:
  ret i64 -1
}

; The ordinary object prototype is real shared storage. Explicit null prototypes bypass it.
@objectDefaultPrototypeRoot = internal global i64 0
@.object.proto.hasOwnProperty = private unnamed_addr constant [15 x i8] c"hasOwnProperty\00"
@.object.proto.propertyIsEnumerable = private unnamed_addr constant [21 x i8] c"propertyIsEnumerable\00"
@.object.proto.isPrototypeOf = private unnamed_addr constant [14 x i8] c"isPrototypeOf\00"
@.tostring.undefined.tag = private unnamed_addr constant [19 x i8] c"[object Undefined]\00"
@.tostring.null.tag = private unnamed_addr constant [14 x i8] c"[object Null]\00"
@.tostring.boolean.tag = private unnamed_addr constant [17 x i8] c"[object Boolean]\00"
@.tostring.number.tag = private unnamed_addr constant [16 x i8] c"[object Number]\00"
@.tostring.string.tag = private unnamed_addr constant [16 x i8] c"[object String]\00"
@.tostring.function.tag = private unnamed_addr constant [18 x i8] c"[object Function]\00"
@.tostring.error.tag = private unnamed_addr constant [15 x i8] c"[object Error]\00"

define ptr @objectDefaultPrototype() {
entry:
  %cached = load i64, ptr @objectDefaultPrototypeRoot
  %missing = icmp eq i64 %cached, 0
  br i1 %missing, label %create, label %done
create:
  %object = call ptr @objectCreateWithCapacity(ptr null, i64 5)
  %boxed = call i64 @valueBoxObject(ptr %object)
  store i64 %boxed, ptr @objectDefaultPrototypeRoot
  call void @gcRegisterGlobalRoot(ptr @objectDefaultPrototypeRoot)
  %frame = call i64 @gcRootSave()
  %to.string.name = call i64 @valueBoxString(ptr @.toprimitive.tostring, i64 8)
  call void @gcRootPush(i64 %to.string.name)
  %to.string = call i64 @functionObjectNew(ptr @objectDefaultToString, ptr null, i64 9222246136947933184, i64 %to.string.name, i64 0)
  call void @objectDefineDataProperty(ptr %object, i64 8, ptr @.toprimitive.tostring, i64 %to.string, i64 5)
  %value.of.name = call i64 @valueBoxString(ptr @.toprimitive.valueof, i64 7)
  call void @gcRootPush(i64 %value.of.name)
  %value.of = call i64 @functionObjectNew(ptr @objectDefaultValueOf, ptr null, i64 9222246136947933184, i64 %value.of.name, i64 0)
  call void @objectDefineDataProperty(ptr %object, i64 7, ptr @.toprimitive.valueof, i64 %value.of, i64 5)
  %has.own.name = call i64 @valueBoxString(ptr @.object.proto.hasOwnProperty, i64 14)
  call void @gcRootPush(i64 %has.own.name)
  %has.own = call i64 @functionObjectNew(ptr @objectDefaultHasOwnProperty, ptr null, i64 9222246136947933184, i64 %has.own.name, i64 1)
  call void @objectDefineDataProperty(ptr %object, i64 14, ptr @.object.proto.hasOwnProperty, i64 %has.own, i64 5)
  %enum.name = call i64 @valueBoxString(ptr @.object.proto.propertyIsEnumerable, i64 20)
  call void @gcRootPush(i64 %enum.name)
  %enum.fn = call i64 @functionObjectNew(ptr @objectDefaultPropertyIsEnumerable, ptr null, i64 9222246136947933184, i64 %enum.name, i64 1)
  call void @objectDefineDataProperty(ptr %object, i64 20, ptr @.object.proto.propertyIsEnumerable, i64 %enum.fn, i64 5)
  %is.proto.name = call i64 @valueBoxString(ptr @.object.proto.isPrototypeOf, i64 13)
  call void @gcRootPush(i64 %is.proto.name)
  %is.proto = call i64 @functionObjectNew(ptr @objectDefaultIsPrototypeOf, ptr null, i64 9222246136947933184, i64 %is.proto.name, i64 1)
  call void @objectDefineDataProperty(ptr %object, i64 13, ptr @.object.proto.isPrototypeOf, i64 %is.proto, i64 5)
  call void @gcRootRestore(i64 %frame)
  ret ptr %object
done:
  %pointer = call ptr @valueObjectPtr(i64 %cached)
  ret ptr %pointer
}

define { i64, i1 } @objectDefaultToString(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.undefined = icmp eq i64 %this.value, 9222246136947933184
  br i1 %is.undefined, label %tag.undefined, label %check.null
check.null:
  %is.null = icmp eq i64 %this.value, 9222246136947933187
  br i1 %is.null, label %tag.null, label %check.bool
check.bool:
  %is.false = icmp eq i64 %this.value, 9222246136947933185
  %is.true = icmp eq i64 %this.value, 9222246136947933186
  %is.bool = or i1 %is.false, %is.true
  br i1 %is.bool, label %tag.bool, label %check.ref
check.ref:
  %tag = and i64 %this.value, -281474976710656
  %is.string = icmp eq i64 %tag, 9221683186994511872
  br i1 %is.string, label %tag.string, label %check.array
check.array:
  %is.array = icmp eq i64 %tag, 9221401712017801216
  br i1 %is.array, label %tag.array, label %check.function
check.function:
  %is.function = icmp eq i64 %tag, 9221964661971222528
  br i1 %is.function, label %tag.function, label %check.object
check.object:
  %is.object = icmp eq i64 %tag, 9221120237041090560
  br i1 %is.object, label %check.error, label %tag.number
check.error:
  %object = call ptr @valueObjectPtr(i64 %this.value)
  %this.is.col = call i1 @valueIsCollection(i64 %this.value)
  br i1 %this.is.col, label %tag.collection, label %check.error.obj
tag.collection:
  %col.tag = call { ptr, i64 } @collectionToStringTag(ptr %object)
  %col.tag.ptr = extractvalue { ptr, i64 } %col.tag, 0
  %col.tag.len = extractvalue { ptr, i64 } %col.tag, 1
  %s.col = call i64 @valueBoxString(ptr %col.tag.ptr, i64 %col.tag.len)
  br label %done
check.error.obj:
  %class.slot = getelementptr i8, ptr %object, i64 48
  %class.id = load i64, ptr %class.slot
  %is.error = icmp ne i64 %class.id, 0
  br i1 %is.error, label %tag.error, label %tag.object
tag.undefined:
  %s.undef = call i64 @valueBoxString(ptr @.tostring.undefined.tag, i64 18)
  br label %done
tag.null:
  %s.null = call i64 @valueBoxString(ptr @.tostring.null.tag, i64 13)
  br label %done
tag.bool:
  %s.bool = call i64 @valueBoxString(ptr @.tostring.boolean.tag, i64 16)
  br label %done
tag.number:
  %s.num = call i64 @valueBoxString(ptr @.tostring.number.tag, i64 15)
  br label %done
tag.string:
  %s.str = call i64 @valueBoxString(ptr @.tostring.string.tag, i64 15)
  br label %done
tag.array:
  %s.arr = call i64 @valueBoxString(ptr @.tostring.array, i64 14)
  br label %done
tag.function:
  %s.fn = call i64 @valueBoxString(ptr @.tostring.function.tag, i64 17)
  br label %done
tag.error:
  %s.err = call i64 @valueBoxString(ptr @.tostring.error.tag, i64 14)
  br label %done
tag.object:
  %s.obj = call i64 @valueBoxString(ptr @.tostring.object, i64 15)
  br label %done
done:
  %boxed = phi i64 [ %s.undef, %tag.undefined ], [ %s.null, %tag.null ], [ %s.bool, %tag.bool ], [ %s.num, %tag.number ], [ %s.str, %tag.string ], [ %s.arr, %tag.array ], [ %s.fn, %tag.function ], [ %s.err, %tag.error ], [ %s.obj, %tag.object ], [ %s.col, %tag.collection ]
  %ok.0 = insertvalue { i64, i1 } undef, i64 %boxed, 0
  %ok = insertvalue { i64, i1 } %ok.0, i1 false, 1
  ret { i64, i1 } %ok
}

define { i64, i1 } @objectDefaultValueOf(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %coercible = call { i64, i1 } @requireObjectCoercible(i64 %this.value)
  ret { i64, i1 } %coercible
}

define { i64, i1 } @objectDefaultHasOwnProperty(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %this.value)
  %has.arg = icmp ugt i64 %argc, 0
  br i1 %has.arg, label %load.arg, label %convert.key
load.arg:
  %arg.val = load i64, ptr %argv
  br label %convert.key
convert.key:
  %raw.key = phi i64 [ %arg.val, %load.arg ], [ 9222246136947933184, %entry ]
  %key.result = call { i64, i1 } @valueToStringObservable(i64 %raw.key, i1 false)
  %key.threw = extractvalue { i64, i1 } %key.result, 1
  br i1 %key.threw, label %key.error, label %check
key.error:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %key.result
check:
  %key.boxed = extractvalue { i64, i1 } %key.result, 0
  call void @gcRootPush(i64 %key.boxed)
  %key.ptr = call ptr @valueStringPtr(i64 %key.boxed)
  %key.len = call i64 @valueStringLength(i64 %key.boxed)
  %answer = call { i64, i1 } @valueHasOwnProperty(i64 %this.value, i64 %key.len, ptr %key.ptr)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %answer
}

define { i64, i1 } @objectDefaultPropertyIsEnumerable(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %this.value)
  %has.arg = icmp ugt i64 %argc, 0
  br i1 %has.arg, label %load.arg, label %convert.key
load.arg:
  %arg.val = load i64, ptr %argv
  br label %convert.key
convert.key:
  %raw.key = phi i64 [ %arg.val, %load.arg ], [ 9222246136947933184, %entry ]
  %key.result = call { i64, i1 } @valueToStringObservable(i64 %raw.key, i1 false)
  %key.threw = extractvalue { i64, i1 } %key.result, 1
  br i1 %key.threw, label %key.error, label %coercible
key.error:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %key.result
coercible:
  %key.boxed = extractvalue { i64, i1 } %key.result, 0
  call void @gcRootPush(i64 %key.boxed)
  %checked = call { i64, i1 } @requireObjectCoercible(i64 %this.value)
  %checked.threw = extractvalue { i64, i1 } %checked, 1
  br i1 %checked.threw, label %coercible.error, label %dispatch
coercible.error:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %checked
dispatch:
  %key.ptr = call ptr @valueStringPtr(i64 %key.boxed)
  %key.len = call i64 @valueStringLength(i64 %key.boxed)
  %is.object = call i1 @valueIsPlainObject(i64 %this.value)
  br i1 %is.object, label %object.check, label %check.array
object.check:
  %obj.ptr = call ptr @valueObjectPtr(i64 %this.value)
  %obj.enum = call i1 @objectPropertyIsEnumerable(ptr %obj.ptr, i64 %key.len, ptr %key.ptr)
  br label %answer
check.array:
  %is.array = call i1 @valueIsArray(i64 %this.value)
  br i1 %is.array, label %array.check, label %check.string
array.check:
  %arr.ptr = call ptr @valueArrayPtr(i64 %this.value)
  %arr.index = call i64 @propertyKeyIndex(i64 %key.len, ptr %key.ptr)
  %arr.is.index = icmp sge i64 %arr.index, 0
  br i1 %arr.is.index, label %array.elem, label %array.named
array.elem:
  %arr.has.elem = call i1 @arrayHasOwnIndex(ptr %arr.ptr, i64 %arr.index)
  br label %answer
array.named:
  %arr.props.slot = getelementptr i8, ptr %arr.ptr, i64 32
  %arr.props = load ptr, ptr %arr.props.slot
  %arr.named.enum = call i1 @objectPropertyIsEnumerable(ptr %arr.props, i64 %key.len, ptr %key.ptr)
  br label %answer
check.string:
  %is.string = call i1 @valueIsString(i64 %this.value)
  br i1 %is.string, label %string.check, label %answer
string.check:
  %str.index = call i64 @propertyKeyIndex(i64 %key.len, ptr %key.ptr)
  %str.nonneg = icmp sge i64 %str.index, 0
  %str.len = call i64 @valueStringLength(i64 %this.value)
  %str.in.bounds = icmp ult i64 %str.index, %str.len
  %str.enum = and i1 %str.nonneg, %str.in.bounds
  br label %answer
answer:
  %flag = phi i1 [ %obj.enum, %object.check ], [ %arr.has.elem, %array.elem ], [ %arr.named.enum, %array.named ], [ %str.enum, %string.check ], [ false, %check.string ]
  %boxed = select i1 %flag, i64 9222246136947933186, i64 9222246136947933185
  call void @gcRootRestore(i64 %frame)
  %ok.0 = insertvalue { i64, i1 } undef, i64 %boxed, 0
  %ok = insertvalue { i64, i1 } %ok.0, i1 false, 1
  ret { i64, i1 } %ok
}

define { i64, i1 } @objectDefaultIsPrototypeOf(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %has.arg = icmp ugt i64 %argc, 0
  br i1 %has.arg, label %load.arg, label %return.false
load.arg:
  %candidate = load i64, ptr %argv
  %cand.is.obj = call i1 @valueIsPlainObject(i64 %candidate)
  %cand.is.arr = call i1 @valueIsArray(i64 %candidate)
  %cand.is.fn = call i1 @valueIsFunction(i64 %candidate)
  %cand.obj.0 = or i1 %cand.is.obj, %cand.is.arr
  %cand.obj.like = or i1 %cand.obj.0, %cand.is.fn
  br i1 %cand.obj.like, label %check.this, label %return.false
check.this:
  %checked = call { i64, i1 } @requireObjectCoercible(i64 %this.value)
  %threw = extractvalue { i64, i1 } %checked, 1
  br i1 %threw, label %error, label %check.this.obj
error:
  ret { i64, i1 } %checked
check.this.obj:
  %this.is.obj = call i1 @valueIsPlainObject(i64 %this.value)
  br i1 %this.is.obj, label %target.ready, label %return.false
target.ready:
  %target.ptr = call ptr @valueObjectPtr(i64 %this.value)
  %cand.non.obj = or i1 %cand.is.arr, %cand.is.fn
  br i1 %cand.non.obj, label %array.proto, label %object.start
array.proto:
  %default.proto = call ptr @objectDefaultPrototype()
  %is.default = icmp eq ptr %target.ptr, %default.proto
  br i1 %is.default, label %return.true, label %return.false
object.start:
  %cand.ptr = call ptr @valueObjectPtr(i64 %candidate)
  %first.proto = call ptr @objectGetPrototype(ptr %cand.ptr)
  br label %walk
walk:
  %current = phi ptr [ %first.proto, %object.start ], [ %next.proto, %advance ]
  %is.null = icmp eq ptr %current, null
  br i1 %is.null, label %return.false, label %compare
compare:
  %matches = icmp eq ptr %current, %target.ptr
  br i1 %matches, label %return.true, label %advance
advance:
  %next.proto = call ptr @objectGetPrototype(ptr %current)
  br label %walk
return.true:
  ret { i64, i1 } { i64 9222246136947933186, i1 false }
return.false:
  ret { i64, i1 } { i64 9222246136947933185, i1 false }
}

@.console.fmt.space = private unnamed_addr constant [2 x i8] c" \00"
@.console.fmt.newline = private unnamed_addr constant [2 x i8] c"\0A\00"
@.console.fmt.str = private unnamed_addr constant [5 x i8] c"%.*s\00"
@.console.fmt.s = private unnamed_addr constant [3 x i8] c"%s\00"
@.console.fmt.negzero = private unnamed_addr constant [3 x i8] c"-0\00"
@.console.fmt.empty.array = private unnamed_addr constant [3 x i8] c"[]\00"
@.console.fmt.array.open = private unnamed_addr constant [3 x i8] c"[ \00"
@.console.fmt.array.close = private unnamed_addr constant [3 x i8] c" ]\00"
@.console.fmt.comma = private unnamed_addr constant [3 x i8] c", \00"
@.console.fmt.empty.object = private unnamed_addr constant [3 x i8] c"{}\00"
@.console.fmt.object.open = private unnamed_addr constant [3 x i8] c"{ \00"
@.console.fmt.object.close = private unnamed_addr constant [3 x i8] c" }\00"
@.console.fmt.colon = private unnamed_addr constant [3 x i8] c": \00"
@.console.fmt.squote = private unnamed_addr constant [2 x i8] c"'\00"
@.console.fmt.dquote = private unnamed_addr constant [2 x i8] c"\22\00"
@.console.fmt.bslash = private unnamed_addr constant [3 x i8] c"\\\\\00"
@.console.fmt.esc.squote = private unnamed_addr constant [3 x i8] c"\\'\00"
@.console.fmt.esc.dquote = private unnamed_addr constant [3 x i8] c"\\\22\00"
@.console.fmt.esc.n = private unnamed_addr constant [3 x i8] c"\\n\00"
@.console.fmt.esc.r = private unnamed_addr constant [3 x i8] c"\\r\00"
@.console.fmt.esc.t = private unnamed_addr constant [3 x i8] c"\\t\00"
@.console.fmt.char = private unnamed_addr constant [3 x i8] c"%c\00"
@.console.fmt.hole = private unnamed_addr constant [15 x i8] c"<1 empty item>\00"
@.console.fmt.fn.named = private unnamed_addr constant [17 x i8] c"[Function: %.*s]\00"
@.console.fmt.fn.anon = private unnamed_addr constant [23 x i8] c"[Function (anonymous)]\00"
@.console.fmt.array.deep = private unnamed_addr constant [8 x i8] c"[Array]\00"
@.console.fmt.object.deep = private unnamed_addr constant [9 x i8] c"[Object]\00"
@.console.key.name = private unnamed_addr constant [5 x i8] c"name\00"

define void @consolePrintQuotedString(ptr %bytes, i64 %length) {
entry:
  br label %scan.quotes
scan.quotes:
  %scan.i = phi i64 [ 0, %entry ], [ %scan.next, %scan.step ]
  %has.single = phi i1 [ false, %entry ], [ %has.single.next, %scan.step ]
  %has.double = phi i1 [ false, %entry ], [ %has.double.next, %scan.step ]
  %scan.done = icmp eq i64 %scan.i, %length
  br i1 %scan.done, label %choose.quote, label %scan.step
scan.step:
  %scan.ptr = getelementptr i8, ptr %bytes, i64 %scan.i
  %scan.ch = load i8, ptr %scan.ptr
  %is.sq = icmp eq i8 %scan.ch, 39
  %is.dq = icmp eq i8 %scan.ch, 34
  %has.single.next = or i1 %has.single, %is.sq
  %has.double.next = or i1 %has.double, %is.dq
  %scan.next = add i64 %scan.i, 1
  br label %scan.quotes
choose.quote:
  %no.double = xor i1 %has.double, true
  %use.double = and i1 %has.single, %no.double
  %quote.str = select i1 %use.double, ptr @.console.fmt.dquote, ptr @.console.fmt.squote
  %quote.byte = select i1 %use.double, i8 34, i8 39
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr %quote.str)
  br label %emit.loop
emit.loop:
  %i = phi i64 [ 0, %choose.quote ], [ %next.i, %emit.next ]
  %done = icmp eq i64 %i, %length
  br i1 %done, label %close.quote, label %emit.char
emit.char:
  %ptr = getelementptr i8, ptr %bytes, i64 %i
  %ch = load i8, ptr %ptr
  %is.bslash = icmp eq i8 %ch, 92
  br i1 %is.bslash, label %emit.bslash, label %check.quote
emit.bslash:
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr @.console.fmt.bslash)
  br label %emit.next
check.quote:
  %is.quote = icmp eq i8 %ch, %quote.byte
  br i1 %is.quote, label %emit.quote, label %check.nl
emit.quote:
  %esc.q = select i1 %use.double, ptr @.console.fmt.esc.dquote, ptr @.console.fmt.esc.squote
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr %esc.q)
  br label %emit.next
check.nl:
  %is.nl = icmp eq i8 %ch, 10
  br i1 %is.nl, label %emit.nl, label %check.cr
emit.nl:
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr @.console.fmt.esc.n)
  br label %emit.next
check.cr:
  %is.cr = icmp eq i8 %ch, 13
  br i1 %is.cr, label %emit.cr, label %check.tab
emit.cr:
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr @.console.fmt.esc.r)
  br label %emit.next
check.tab:
  %is.tab = icmp eq i8 %ch, 9
  br i1 %is.tab, label %emit.tab, label %emit.raw
emit.tab:
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr @.console.fmt.esc.t)
  br label %emit.next
emit.raw:
  %ch.i32 = zext i8 %ch to i32
  call i32 (ptr, ...) @printf(ptr @.console.fmt.char, i32 %ch.i32)
  br label %emit.next
emit.next:
  %next.i = add i64 %i, 1
  br label %emit.loop
close.quote:
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr %quote.str)
  ret void
}

define void @consolePrintArray(ptr %array, i64 %depth) {
entry:
  %too.deep = icmp uge i64 %depth, 8
  br i1 %too.deep, label %deep, label %check.empty
deep:
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr @.console.fmt.array.deep)
  ret void
check.empty:
  %length = call i64 @arrayLength(ptr %array)
  %empty = icmp eq i64 %length, 0
  br i1 %empty, label %print.empty, label %print.open
print.empty:
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr @.console.fmt.empty.array)
  ret void
print.open:
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr @.console.fmt.array.open)
  %next.depth = add i64 %depth, 1
  br label %loop
loop:
  %index = phi i64 [ 0, %print.open ], [ %next, %advance ]
  %done = icmp eq i64 %index, %length
  br i1 %done, label %print.close, label %body
body:
  %need.comma = icmp ne i64 %index, 0
  br i1 %need.comma, label %comma, label %elem
comma:
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr @.console.fmt.comma)
  br label %elem
elem:
  %has = call i1 @arrayHasOwnIndex(ptr %array, i64 %index)
  br i1 %has, label %elem.present, label %elem.hole
elem.hole:
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr @.console.fmt.hole)
  br label %advance
elem.present:
  %value = call i64 @arrayGet(ptr %array, i64 %index)
  call void @consolePrintValue(i64 %value, i1 true, i64 %next.depth)
  br label %advance
advance:
  %next = add i64 %index, 1
  br label %loop
print.close:
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr @.console.fmt.array.close)
  ret void
}

define void @consolePrintObject(ptr %object, i64 %depth) {
entry:
  %too.deep = icmp uge i64 %depth, 8
  br i1 %too.deep, label %deep, label %start
deep:
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr @.console.fmt.object.deep)
  ret void
start:
  %count = load i64, ptr %object
  %entries.slot = getelementptr i8, ptr %object, i64 16
  %entries = load ptr, ptr %entries.slot
  %next.depth = add i64 %depth, 1
  br label %loop
loop:
  %i = phi i64 [ 0, %start ], [ %next.i, %advance ]
  %printed = phi i64 [ 0, %start ], [ %next.printed, %advance ]
  %done = icmp eq i64 %i, %count
  br i1 %done, label %finish, label %check.entry
check.entry:
  %entry.bytes = mul i64 %i, 32
  %entry.ptr = getelementptr i8, ptr %entries, i64 %entry.bytes
  %stored.len = load i64, ptr %entry.ptr
  %active = icmp sge i64 %stored.len, 0
  br i1 %active, label %check.enum, label %skip
check.enum:
  %desc.slot = getelementptr i8, ptr %entry.ptr, i64 24
  %desc = load i64, ptr %desc.slot
  %enum.bit = and i64 %desc, 2
  %is.enum = icmp ne i64 %enum.bit, 0
  br i1 %is.enum, label %emit.entry, label %skip
emit.entry:
  %is.first = icmp eq i64 %printed, 0
  br i1 %is.first, label %emit.open, label %emit.comma
emit.open:
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr @.console.fmt.object.open)
  br label %emit.kv
emit.comma:
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr @.console.fmt.comma)
  br label %emit.kv
emit.kv:
  %key.slot = getelementptr i8, ptr %entry.ptr, i64 8
  %key.ptr = load ptr, ptr %key.slot
  %key.len32 = trunc i64 %stored.len to i32
  call i32 (ptr, ...) @printf(ptr @.console.fmt.str, i32 %key.len32, ptr %key.ptr)
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr @.console.fmt.colon)
  %val.slot = getelementptr i8, ptr %entry.ptr, i64 16
  %val = load i64, ptr %val.slot
  call void @consolePrintValue(i64 %val, i1 true, i64 %next.depth)
  %inc.printed = add i64 %printed, 1
  br label %advance
skip:
  br label %advance
advance:
  %next.printed = phi i64 [ %inc.printed, %emit.kv ], [ %printed, %skip ]
  %next.i = add i64 %i, 1
  br label %loop
finish:
  %none = icmp eq i64 %printed, 0
  br i1 %none, label %print.empty, label %print.close
print.empty:
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr @.console.fmt.empty.object)
  ret void
print.close:
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr @.console.fmt.object.close)
  ret void
}

define void @consolePrintValue(i64 %value, i1 %nested, i64 %depth) {
entry:
  %is.undefined = icmp eq i64 %value, 9222246136947933184
  br i1 %is.undefined, label %print.undefined, label %check.false
check.false:
  %is.false = icmp eq i64 %value, 9222246136947933185
  br i1 %is.false, label %print.false, label %check.true
check.true:
  %is.true = icmp eq i64 %value, 9222246136947933186
  br i1 %is.true, label %print.true, label %check.null
check.null:
  %is.null = icmp eq i64 %value, 9222246136947933187
  br i1 %is.null, label %print.null, label %check.tag
check.tag:
  %tag = and i64 %value, -281474976710656
  %is.string = icmp eq i64 %tag, 9221683186994511872
  br i1 %is.string, label %print.string, label %check.array
check.array:
  %is.array = icmp eq i64 %tag, 9221401712017801216
  br i1 %is.array, label %print.array, label %check.object
check.object:
  %is.object = icmp eq i64 %tag, 9221120237041090560
  br i1 %is.object, label %check.error, label %check.function
check.error:
  %object.ptr = call ptr @valueObjectPtr(i64 %value)
  %c.is.col = call i1 @valueIsCollection(i64 %value)
  br i1 %c.is.col, label %print.collection, label %check.error.obj
print.collection:
  %c.tag = call { ptr, i64 } @collectionToStringTag(ptr %object.ptr)
  %c.tag.ptr = extractvalue { ptr, i64 } %c.tag, 0
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr %c.tag.ptr)
  ret void
check.error.obj:
  %class.slot = getelementptr i8, ptr %object.ptr, i64 48
  %class.id = load i64, ptr %class.slot
  %is.error = icmp ne i64 %class.id, 0
  br i1 %is.error, label %print.error, label %print.object
check.function:
  %is.function = icmp eq i64 %tag, 9221964661971222528
  br i1 %is.function, label %print.function, label %check.console.sym
check.console.sym:
  %is.csym = icmp eq i64 %tag, 9222527611924643840
  br i1 %is.csym, label %print.csym, label %check.console.bi
print.csym:
  %csym.s = call { ptr, i64 } @symbolToString(i64 %value)
  %csym.p = extractvalue { ptr, i64 } %csym.s, 0
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr %csym.p)
  ret void
check.console.bi:
  %is.cbi = icmp eq i64 %tag, 9222809086901354496
  br i1 %is.cbi, label %print.cbi, label %print.number
print.cbi:
  %cbi.s = call { ptr, i64 } @bigIntToString(i64 %value)
  %cbi.p = extractvalue { ptr, i64 } %cbi.s, 0
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr %cbi.p)
  ret void
print.undefined:
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr @.value.undefined)
  ret void
print.false:
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr @.value.false)
  ret void
print.true:
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr @.value.true)
  ret void
print.null:
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr @.value.null)
  ret void
print.string:
  %str.ptr = call ptr @valueStringPtr(i64 %value)
  %str.len = call i64 @valueStringLength(i64 %value)
  br i1 %nested, label %print.string.quoted, label %print.string.raw
print.string.raw:
  %str.len32 = trunc i64 %str.len to i32
  call i32 (ptr, ...) @printf(ptr @.console.fmt.str, i32 %str.len32, ptr %str.ptr)
  ret void
print.string.quoted:
  call void @consolePrintQuotedString(ptr %str.ptr, i64 %str.len)
  ret void
print.array:
  %array.ptr = call ptr @valueArrayPtr(i64 %value)
  call void @consolePrintArray(ptr %array.ptr, i64 %depth)
  ret void
print.error:
  %error.str = call { ptr, i64 } @errorToString(ptr %object.ptr)
  %error.ptr = extractvalue { ptr, i64 } %error.str, 0
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr %error.ptr)
  ret void
print.object:
  call void @consolePrintObject(ptr %object.ptr, i64 %depth)
  ret void
print.function:
  %fn.name = call i64 @functionObjectGet(i64 %value, i64 4, ptr @.console.key.name)
  %fn.has.str = call i1 @valueIsString(i64 %fn.name)
  br i1 %fn.has.str, label %print.fn.check.len, label %print.fn.anon
print.fn.check.len:
  %fn.name.len = call i64 @valueStringLength(i64 %fn.name)
  %fn.nonempty = icmp ne i64 %fn.name.len, 0
  br i1 %fn.nonempty, label %print.fn.named, label %print.fn.anon
print.fn.named:
  %fn.name.ptr = call ptr @valueStringPtr(i64 %fn.name)
  %fn.name.len32 = trunc i64 %fn.name.len to i32
  call i32 (ptr, ...) @printf(ptr @.console.fmt.fn.named, i32 %fn.name.len32, ptr %fn.name.ptr)
  ret void
print.fn.anon:
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr @.console.fmt.fn.anon)
  ret void
print.number:
  %is.negzero = icmp eq i64 %value, -9223372036854775808
  br i1 %is.negzero, label %print.negzero, label %print.normal.num
print.negzero:
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr @.console.fmt.negzero)
  ret void
print.normal.num:
  %number = call double @valueNumber(i64 %value)
  %number.str = call { ptr, i64 } @numberToShortestString(double %number)
  %number.ptr = extractvalue { ptr, i64 } %number.str, 0
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr %number.ptr)
  ret void
}

@.console.fmt.circular = private unnamed_addr constant [11 x i8] c"[Circular]\00"

define void @consolePrintDouble(double %number) {
entry:
  %bits = bitcast double %number to i64
  %is.negzero = icmp eq i64 %bits, -9223372036854775808
  br i1 %is.negzero, label %print.negzero, label %print.normal
print.negzero:
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr @.console.fmt.negzero)
  ret void
print.normal:
  %number.str = call { ptr, i64 } @numberToShortestString(double %number)
  %number.ptr = extractvalue { ptr, i64 } %number.str, 0
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr %number.ptr)
  ret void
}

define void @valueConsoleLog(i64 %argc, ptr %argv) {
entry:
  %multi = icmp ugt i64 %argc, 1
  br i1 %multi, label %check.format, label %plain.start
check.format:
  %first = load i64, ptr %argv
  %first.is.str = call i1 @valueIsString(i64 %first)
  br i1 %first.is.str, label %format.init, label %plain.start
format.init:
  %fmt.frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %first)
  %fmt.len = call i64 @valueStringLength(i64 %first)
  br label %format.loop
format.loop:
  %pos = phi i64 [ 0, %format.init ], [ %pos.next, %format.advance ]
  %arg.idx = phi i64 [ 1, %format.init ], [ %arg.idx.next, %format.advance ]
  %fmt.done = icmp uge i64 %pos, %fmt.len
  br i1 %fmt.done, label %format.rest, label %format.char
format.char:
  %fmt.ptr = call ptr @valueStringPtr(i64 %first)
  %ch.ptr = getelementptr i8, ptr %fmt.ptr, i64 %pos
  %ch = load i8, ptr %ch.ptr
  %is.pct = icmp eq i8 %ch, 37
  %next.pos.1 = add i64 %pos, 1
  %has.spec = icmp ult i64 %next.pos.1, %fmt.len
  %try.spec = and i1 %is.pct, %has.spec
  br i1 %try.spec, label %format.spec, label %format.literal
format.spec:
  %spec.ptr = getelementptr i8, ptr %fmt.ptr, i64 %next.pos.1
  %spec = load i8, ptr %spec.ptr
  %is.pct.pct = icmp eq i8 %spec, 37
  br i1 %is.pct.pct, label %format.emit.pct, label %format.check.arg
format.emit.pct:
  call i32 (ptr, ...) @printf(ptr @.console.fmt.char, i32 37)
  %pos.pct = add i64 %pos, 2
  br label %format.advance
format.check.arg:
  %has.arg = icmp ult i64 %arg.idx, %argc
  br i1 %has.arg, label %format.dispatch, label %format.literal
format.dispatch:
  %arg.slot = getelementptr i64, ptr %argv, i64 %arg.idx
  %arg.val = load i64, ptr %arg.slot
  %is.s = icmp eq i8 %spec, 115
  br i1 %is.s, label %format.s, label %format.check.d
format.s:
  call void @consolePrintValue(i64 %arg.val, i1 false, i64 0)
  br label %format.consumed
format.check.d:
  %is.d = icmp eq i8 %spec, 100
  br i1 %is.d, label %format.d, label %format.check.i
format.d:
  %d.num = call double @valueToNumber(i64 %arg.val)
  call void @consolePrintDouble(double %d.num)
  br label %format.consumed
format.check.i:
  %is.i = icmp eq i8 %spec, 105
  br i1 %is.i, label %format.i, label %format.check.f
format.i:
  %i.str = call { ptr, i64 } @valueToString(i64 %arg.val)
  %i.bytes = extractvalue { ptr, i64 } %i.str, 0
  %i.len = extractvalue { ptr, i64 } %i.str, 1
  %i.num = call double @parseInt(i64 %i.len, ptr %i.bytes)
  call void @consolePrintDouble(double %i.num)
  br label %format.consumed
format.check.f:
  %is.f = icmp eq i8 %spec, 102
  br i1 %is.f, label %format.f, label %format.check.j
format.f:
  %f.is.num = call i1 @valueIsNumberForSameValueZero(i64 %arg.val)
  br i1 %f.is.num, label %format.f.num, label %format.f.parse
format.f.num:
  %f.direct = call double @valueNumber(i64 %arg.val)
  call void @consolePrintDouble(double %f.direct)
  br label %format.consumed
format.f.parse:
  %f.str = call { ptr, i64 } @valueToString(i64 %arg.val)
  %f.bytes = extractvalue { ptr, i64 } %f.str, 0
  %f.len = extractvalue { ptr, i64 } %f.str, 1
  %f.parsed = call double @parseFloat(i64 %f.len, ptr %f.bytes)
  call void @consolePrintDouble(double %f.parsed)
  br label %format.consumed
format.check.j:
  %is.j = icmp eq i8 %spec, 106
  br i1 %is.j, label %format.j, label %format.check.o
format.j:
  %j.res = call { i64, i1 } @jsonStringify(i64 %arg.val, ptr null, i64 0)
  %j.threw = extractvalue { i64, i1 } %j.res, 1
  br i1 %j.threw, label %format.j.err, label %format.j.ok
format.j.err:
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr @.console.fmt.circular)
  br label %format.consumed
format.j.ok:
  %j.val = extractvalue { i64, i1 } %j.res, 0
  call void @consolePrintValue(i64 %j.val, i1 false, i64 0)
  br label %format.consumed
format.check.o:
  %is.o.lo = icmp eq i8 %spec, 111
  %is.o.hi = icmp eq i8 %spec, 79
  %is.o = or i1 %is.o.lo, %is.o.hi
  br i1 %is.o, label %format.o, label %format.literal
format.o:
  call void @consolePrintValue(i64 %arg.val, i1 true, i64 0)
  br label %format.consumed
format.consumed:
  %pos.spec = add i64 %pos, 2
  %arg.next = add i64 %arg.idx, 1
  br label %format.advance
format.literal:
  %ch.i32 = zext i8 %ch to i32
  call i32 (ptr, ...) @printf(ptr @.console.fmt.char, i32 %ch.i32)
  br label %format.advance
format.advance:
  %pos.next = phi i64 [ %pos.pct, %format.emit.pct ], [ %pos.spec, %format.consumed ], [ %next.pos.1, %format.literal ]
  %arg.idx.next = phi i64 [ %arg.idx, %format.emit.pct ], [ %arg.next, %format.consumed ], [ %arg.idx, %format.literal ]
  br label %format.loop
format.rest:
  call void @gcRootRestore(i64 %fmt.frame)
  br label %loop
plain.start:
  br label %loop
loop:
  %i = phi i64 [ 0, %plain.start ], [ %arg.idx, %format.rest ], [ %next, %step ]
  %done = icmp uge i64 %i, %argc
  br i1 %done, label %finish, label %body
body:
  %need.space = icmp ne i64 %i, 0
  br i1 %need.space, label %space, label %step
space:
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr @.console.fmt.space)
  br label %step
step:
  %slot = getelementptr i64, ptr %argv, i64 %i
  %value = load i64, ptr %slot
  call void @consolePrintValue(i64 %value, i1 false, i64 0)
  %next = add i64 %i, 1
  br label %loop
finish:
  call i32 (ptr, ...) @printf(ptr @.console.fmt.s, ptr @.console.fmt.newline)
  ret void
}

; Arrays and functions have intrinsic conversion methods even without object-layout prototypes.
; An own property, including undefined, shadows the intrinsic method.
@.console.err.fmt.sn = private unnamed_addr constant [5 x i8] c"%.*s\00"
@.console.err.fmt.space = private unnamed_addr constant [2 x i8] c" \00"
@.console.err.fmt.newline = private unnamed_addr constant [2 x i8] c"\0A\00"

define void @valueConsoleError(i64 %argc, ptr %argv) {
entry:
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %next, %step ]
  %done = icmp uge i64 %i, %argc
  br i1 %done, label %finish, label %body
body:
  %need.space = icmp ugt i64 %i, 0
  br i1 %need.space, label %space, label %print.arg
space:
  call i32 (i32, ptr, ...) @dprintf(i32 2, ptr @.console.err.fmt.space)
  br label %print.arg
print.arg:
  %slot = getelementptr i64, ptr %argv, i64 %i
  %val = load i64, ptr %slot
  %str = call { ptr, i64 } @valueToString(i64 %val)
  %bytes = extractvalue { ptr, i64 } %str, 0
  %len = extractvalue { ptr, i64 } %str, 1
  %len32 = trunc i64 %len to i32
  call i32 (i32, ptr, ...) @dprintf(i32 2, ptr @.console.err.fmt.sn, i32 %len32, ptr %bytes)
  br label %step
step:
  %next = add i64 %i, 1
  br label %loop
finish:
  call i32 (i32, ptr, ...) @dprintf(i32 2, ptr @.console.err.fmt.newline)
  ret void
}

define { i64, i1 } @valueConversionPropertyGet(i64 %value, i64 %key.len, ptr %key.ptr) {
entry:
  %lookup = call { i64, i1 } @checkedValuePropertyGet(i64 %value, i64 %key.len, ptr %key.ptr)
  %threw = extractvalue { i64, i1 } %lookup, 1
  %method = extractvalue { i64, i1 } %lookup, 0
  %missing = icmp eq i64 %method, 9222246136947933184
  %is.object = call i1 @valueIsObject(i64 %value)
  %present = xor i1 %missing, true
  %done.0 = or i1 %threw, %present
  %done = or i1 %done.0, %is.object
  br i1 %done, label %kept, label %check.own
check.own:
  %own.result = call { i64, i1 } @valueHasOwnProperty(i64 %value, i64 %key.len, ptr %key.ptr)
  %own.value = extractvalue { i64, i1 } %own.result, 0
  %own = icmp eq i64 %own.value, 9222246136947933186
  br i1 %own, label %kept, label %intrinsic
kept:
  ret { i64, i1 } %lookup
intrinsic:
  %to.string = icmp eq i64 %key.len, 8
  %code = select i1 %to.string, ptr @conversionNativeToString, ptr @objectDefaultValueOf
  %function = call i64 @functionObjectNew(ptr %code, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 0)
  %ok.0 = insertvalue { i64, i1 } undef, i64 %function, 0
  %ok = insertvalue { i64, i1 } %ok.0, i1 false, 1
  ret { i64, i1 } %ok
}

define { i64, i1 } @conversionNativeToString(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %text = call { ptr, i64 } @valueToString(i64 %this.value)
  %bytes = extractvalue { ptr, i64 } %text, 0
  %length = extractvalue { ptr, i64 } %text, 1
  %boxed = call i64 @valueBoxString(ptr %bytes, i64 %length)
  %ok.0 = insertvalue { i64, i1 } undef, i64 %boxed, 0
  %ok = insertvalue { i64, i1 } %ok.0, i1 false, 1
  ret { i64, i1 } %ok
}

@boxedPrototypeRoot = internal global i64 0

define void @boxedInstallConversionMethods(ptr %object) {
entry:
  %frame = call i64 @gcRootSave()
  %owner = call i64 @valueBoxObject(ptr %object)
  call void @gcRootPush(i64 %owner)
  %cached = load i64, ptr @boxedPrototypeRoot
  %missing = icmp eq i64 %cached, 0
  br i1 %missing, label %create, label %cached.prototype
create:
  %prototype = call ptr @objectNew(i64 2)
  %boxed.prototype = call i64 @valueBoxObject(ptr %prototype)
  store i64 %boxed.prototype, ptr @boxedPrototypeRoot
  call void @gcRegisterGlobalRoot(ptr @boxedPrototypeRoot)
  %to.string = call i64 @functionObjectNew(ptr @boxedToStringMethod, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 0)
  call void @objectDefineDataProperty(ptr %prototype, i64 8, ptr @.toprimitive.tostring, i64 %to.string, i64 5)
  %value.of = call i64 @functionObjectNew(ptr @boxedValueOfMethod, ptr null, i64 9222246136947933184, i64 9222246136947933184, i64 0)
  call void @objectDefineDataProperty(ptr %prototype, i64 7, ptr @.toprimitive.valueof, i64 %value.of, i64 5)
  br label %install
cached.prototype:
  %cached.pointer = call ptr @valueObjectPtr(i64 %cached)
  br label %install
install:
  %target = phi ptr [ %prototype, %create ], [ %cached.pointer, %cached.prototype ]
  call void @objectSetPrototype(ptr %object, ptr %target)
  %flags.slot = getelementptr i8, ptr %object, i64 40
  %flags = load i64, ptr %flags.slot
  %branded = or i64 %flags, 2
  store i64 %branded, ptr %flags.slot
  call void @gcRootRestore(i64 %frame)
  ret void
}

define { i64, i1 } @boxedValueOfMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %is.object = call i1 @valueIsPlainObject(i64 %this.value)
  br i1 %is.object, label %check.brand, label %refused
check.brand:
  %object = call ptr @valueObjectPtr(i64 %this.value)
  %flags.slot = getelementptr i8, ptr %object, i64 40
  %flags = load i64, ptr %flags.slot
  %brand.bit = and i64 %flags, 2
  %branded = icmp ne i64 %brand.bit, 0
  br i1 %branded, label %read, label %refused
refused:
  %message = call i64 @valueBoxString(ptr @.toprimitive.refused, i64 40)
  %error = call { i64, i1 } @iteratorTypeError(i64 %message)
  ret { i64, i1 } %error
read:
  %value = call i64 @boxedValueOf(ptr %object)
  %ok.0 = insertvalue { i64, i1 } undef, i64 %value, 0
  %ok = insertvalue { i64, i1 } %ok.0, i1 false, 1
  ret { i64, i1 } %ok
}

define { i64, i1 } @boxedToStringMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %result = call { i64, i1 } @boxedValueOfMethod(i64 0, ptr null, ptr null, i64 %this.value)
  %threw = extractvalue { i64, i1 } %result, 1
  br i1 %threw, label %error, label %convert
error:
  ret { i64, i1 } %result
convert:
  %value = extractvalue { i64, i1 } %result, 0
  %string = call { i64, i1 } @valueToStringObservable(i64 %value, i1 false)
  ret { i64, i1 } %string
}

define i64 @newInstanceResult(i64 %instance, i64 %returned) {
entry:
  %is.obj = call i1 @valueIsObject(i64 %returned)
  br i1 %is.obj, label %use.returned, label %check.arr
check.arr:
  %is.arr = call i1 @valueIsArray(i64 %returned)
  br i1 %is.arr, label %use.returned, label %check.fn
check.fn:
  %is.fn = call i1 @valueIsFunction(i64 %returned)
  br i1 %is.fn, label %use.returned, label %use.instance
use.returned:
  ret i64 %returned
use.instance:
  ret i64 %instance
}

@currentNewTargetRoot = internal global i64 9222246136947933184
@currentNewTargetRegistered = internal global i1 false

define i64 @newTargetGet() {
entry:
  %val = load i64, ptr @currentNewTargetRoot
  ret i64 %val
}

define i64 @newTargetSwap(i64 %next) {
entry:
  %registered = load i1, ptr @currentNewTargetRegistered
  br i1 %registered, label %swap, label %register
register:
  store i1 true, ptr @currentNewTargetRegistered
  call void @gcRegisterGlobalRoot(ptr @currentNewTargetRoot)
  br label %swap
swap:
  %prev = load i64, ptr @currentNewTargetRoot
  store i64 %next, ptr @currentNewTargetRoot
  ret i64 %prev
}

define { i64, i1 } @jsCallWithNewTarget(i64 %fn.value, i64 %argc, ptr %argv, i64 %callThis, i64 %newTarget) {
entry:
  %frame = call i64 @gcRootSave()
  %prev = call i64 @newTargetSwap(i64 %newTarget)
  call void @gcRootPush(i64 %prev)
  %result = call { i64, i1 } @jsCall(i64 %fn.value, i64 %argc, ptr %argv, i64 %callThis)
  %discard = call i64 @newTargetSwap(i64 %prev)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %result
}

@.instanceof.key.prototype = private unnamed_addr constant [10 x i8] c"prototype\00"
@.instanceof.not.callable = private unnamed_addr constant [46 x i8] c"Right-hand side of instanceof is not callable\00"
@.instanceof.bad.proto = private unnamed_addr constant [38 x i8] c"instanceof prototype is not an object\00"

define { i64, i1 } @valueInstanceOf(i64 %left, i64 %right) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %left)
  call void @gcRootPush(i64 %right)
  %is.fn = call i1 @valueIsFunction(i64 %right)
  br i1 %is.fn, label %check.special, label %not.callable
check.special:
  %left.is.col = call i1 @valueIsCollection(i64 %left)
  br i1 %left.is.col, label %col.inst, label %check.err.ctor
col.inst:
  %col.matched = call i1 @jsCollectionInstanceOf(i64 %left, i64 %right)
  %col.boxed = select i1 %col.matched, i64 9222246136947933186, i64 9222246136947933185
  %col.ok0 = insertvalue { i64, i1 } undef, i64 %col.boxed, 0
  %col.ok1 = insertvalue { i64, i1 } %col.ok0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %col.ok1
check.err.ctor:
  %err.ctor = call i64 @errorConstructorValue(i64 1)
  %is.err.ctor = icmp eq i64 %right, %err.ctor
  br i1 %is.err.ctor, label %err.inst, label %read.proto
err.inst:
  %left.is.obj = call i1 @valueIsObject(i64 %left)
  br i1 %left.is.obj, label %err.check.cls, label %err.false
err.check.cls:
  %left.obj = call ptr @valueObjectPtr(i64 %left)
  %left.cls.slot = getelementptr i8, ptr %left.obj, i64 48
  %left.cls = load i64, ptr %left.cls.slot
  %left.is.err = icmp ne i64 %left.cls, 0
  br i1 %left.is.err, label %err.true, label %read.proto
err.true:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } { i64 9222246136947933186, i1 false }
err.false:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } { i64 9222246136947933185, i1 false }
not.callable:
  %nc.msg = call i64 @valueBoxString(ptr @.instanceof.not.callable, i64 45)
  %nc.err = call { i64, i1 } @iteratorTypeError(i64 %nc.msg)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %nc.err
read.proto:
  ; A primitive is an instance of nothing, whatever the constructor's prototype is.
  %left.object = call i1 @valueIsObject(i64 %left)
  %left.array = call i1 @valueIsArray(i64 %left)
  %left.function = call i1 @valueIsFunction(i64 %left)
  %left.heap = or i1 %left.object, %left.array
  %left.reference = or i1 %left.heap, %left.function
  br i1 %left.reference, label %load.proto, label %err.false
load.proto:
  %proto.res = call { i64, i1 } @checkedValuePropertyGet(i64 %right, i64 9, ptr @.instanceof.key.prototype)
  %proto.threw = extractvalue { i64, i1 } %proto.res, 1
  br i1 %proto.threw, label %propagate, label %check.proto
propagate:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %proto.res
check.proto:
  %proto.val = extractvalue { i64, i1 } %proto.res, 0
  %proto.is.obj = call i1 @valueIsObject(i64 %proto.val)
  br i1 %proto.is.obj, label %match.chain, label %bad.proto
bad.proto:
  %bp.msg = call i64 @valueBoxString(ptr @.instanceof.bad.proto, i64 37)
  %bp.err = call { i64, i1 } @iteratorTypeError(i64 %bp.msg)
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %bp.err
match.chain:
  %proto.ptr = call ptr @valueObjectPtr(i64 %proto.val)
  %matched = call i1 @jsInstanceOf(i64 %left, ptr %proto.ptr)
  %boxed = select i1 %matched, i64 9222246136947933186, i64 9222246136947933185
  %ok.0 = insertvalue { i64, i1 } undef, i64 %boxed, 0
  %ok = insertvalue { i64, i1 } %ok.0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %ok
}
