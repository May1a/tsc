define i1 @globalIsNaN(i64 %value) {
entry:
  %number = call double @valueToNumber(i64 %value)
  %ordered = fcmp ord double %number, %number
  %is.nan = xor i1 %ordered, true
  ret i1 %is.nan
}
define i1 @globalIsFinite(i64 %value) {
entry:
  %number = call double @valueToNumber(i64 %value)
  %not.nan = fcmp ord double %number, %number
  %lt.zero = fcmp olt double %number, 0.0
  %neg = fneg double %number
  %abs = select i1 %lt.zero, double %neg, double %number
  %finite = fcmp olt double %abs, 0x7FF0000000000000
  %result = and i1 %not.nan, %finite
  ret i1 %result
}
define i1 @numberIsNaN(i64 %value) {
entry:
  %tag = and i64 %value, -281474976710656
  %is.boxed = icmp eq i64 %tag, 9221683186994511872
  br i1 %is.boxed, label %false, label %as.number
as.number:
  %number = call double @valueNumber(i64 %value)
  %ordered = fcmp ord double %number, %number
  %is.nan = xor i1 %ordered, true
  ret i1 %is.nan
false:
  ret i1 false
}
define i1 @numberIsFinite(i64 %value) {
entry:
  %tag = and i64 %value, -281474976710656
  %is.boxed = icmp eq i64 %tag, 9221683186994511872
  br i1 %is.boxed, label %false, label %as.number
as.number:
  %number = call double @valueNumber(i64 %value)
  %not.nan = fcmp ord double %number, %number
  %lt.zero = fcmp olt double %number, 0.0
  %neg = fneg double %number
  %abs = select i1 %lt.zero, double %neg, double %number
  %finite = fcmp olt double %abs, 0x7FF0000000000000
  %result = and i1 %not.nan, %finite
  ret i1 %result
false:
  ret i1 false
}
define i1 @numberIsInteger(i64 %value) {
entry:
  %finite = call i1 @numberIsFinite(i64 %value)
  br i1 %finite, label %check, label %false
check:
  %number = call double @valueNumber(i64 %value)
  %int = fptosi double %number to i64
  %truncated = sitofp i64 %int to double
  %is.integer = fcmp oeq double %number, %truncated
  ret i1 %is.integer
false:
  ret i1 false
}
define i1 @numberIsSafeInteger(i64 %value) {
entry:
  %integer = call i1 @numberIsInteger(i64 %value)
  br i1 %integer, label %check, label %false
check:
  %number = call double @valueNumber(i64 %value)
  %abs = call double @mathAbs(double %number)
  %safe = fcmp ole double %abs, 9007199254740991.0
  ret i1 %safe
false:
  ret i1 false
}
@.number.fmt.fixed = private unnamed_addr constant [5 x i8] c"%.*f\00"

define { ptr, i64 } @numberToFixed(double %value, double %digits) {
entry:
  %buffer = call ptr @malloc(i64 128)
  %digits.i = fptosi double %digits to i32
  %written = call i32 (ptr, ptr, ...) @sprintf(ptr %buffer, ptr @.number.fmt.fixed, i32 %digits.i, double %value)
  %len = sext i32 %written to i64
  %result.0 = insertvalue { ptr, i64 } undef, ptr %buffer, 0
  %result.1 = insertvalue { ptr, i64 } %result.0, i64 %len, 1
  ret { ptr, i64 } %result.1
}
@.number.fmt.precision = private unnamed_addr constant [5 x i8] c"%.*g\00"

define { ptr, i64 } @numberToPrecision(double %value, double %precision) {
entry:
  %buffer = call ptr @malloc(i64 128)
  %precision.i = fptosi double %precision to i32
  %written = call i32 (ptr, ptr, ...) @sprintf(ptr %buffer, ptr @.number.fmt.precision, i32 %precision.i, double %value)
  %len = sext i32 %written to i64
  br label %normalize
normalize:
  %has.exp.room = icmp sgt i64 %len, 4
  br i1 %has.exp.room, label %check.sign, label %ret.original
check.sign:
  %sign.index = sub i64 %len, 3
  %zero.index = sub i64 %len, 2
  %last.index = sub i64 %len, 1
  %sign.ptr = getelementptr i8, ptr %buffer, i64 %sign.index
  %zero.ptr = getelementptr i8, ptr %buffer, i64 %zero.index
  %last.ptr = getelementptr i8, ptr %buffer, i64 %last.index
  %sign = load i8, ptr %sign.ptr
  %zero = load i8, ptr %zero.ptr
  %last = load i8, ptr %last.ptr
  %is.plus = icmp eq i8 %sign, 43
  %is.minus = icmp eq i8 %sign, 45
  %is.sign = or i1 %is.plus, %is.minus
  %is.zero = icmp eq i8 %zero, 48
  %trim = and i1 %is.sign, %is.zero
  br i1 %trim, label %ret.trimmed, label %ret.original
ret.trimmed:
  store i8 %last, ptr %zero.ptr
  store i8 0, ptr %last.ptr
  %trimmed.len = sub i64 %len, 1
  %trimmed.0 = insertvalue { ptr, i64 } undef, ptr %buffer, 0
  %trimmed.1 = insertvalue { ptr, i64 } %trimmed.0, i64 %trimmed.len, 1
  ret { ptr, i64 } %trimmed.1
ret.original:
  %result.0 = insertvalue { ptr, i64 } undef, ptr %buffer, 0
  %result.1 = insertvalue { ptr, i64 } %result.0, i64 %len, 1
  ret { ptr, i64 } %result.1
}
@.number.fmt.exponential = private unnamed_addr constant [5 x i8] c"%.*e\00"

define { ptr, i64 } @numberToExponential(double %value, double %digits) {
entry:
  %buffer = call ptr @malloc(i64 128)
  %digits.i = fptosi double %digits to i32
  %written = call i32 (ptr, ptr, ...) @sprintf(ptr %buffer, ptr @.number.fmt.exponential, i32 %digits.i, double %value)
  %len = sext i32 %written to i64
  %sign.index = sub i64 %len, 3
  %zero.index = sub i64 %len, 2
  %last.index = sub i64 %len, 1
  %sign.ptr = getelementptr i8, ptr %buffer, i64 %sign.index
  %zero.ptr = getelementptr i8, ptr %buffer, i64 %zero.index
  %last.ptr = getelementptr i8, ptr %buffer, i64 %last.index
  %sign = load i8, ptr %sign.ptr
  %zero = load i8, ptr %zero.ptr
  %last = load i8, ptr %last.ptr
  %is.plus = icmp eq i8 %sign, 43
  %is.minus = icmp eq i8 %sign, 45
  %is.sign = or i1 %is.plus, %is.minus
  %is.zero = icmp eq i8 %zero, 48
  %trim = and i1 %is.sign, %is.zero
  br i1 %trim, label %ret.trimmed, label %ret.original
ret.trimmed:
  store i8 %last, ptr %zero.ptr
  store i8 0, ptr %last.ptr
  %trimmed.len = sub i64 %len, 1
  %trimmed.0 = insertvalue { ptr, i64 } undef, ptr %buffer, 0
  %trimmed.1 = insertvalue { ptr, i64 } %trimmed.0, i64 %trimmed.len, 1
  ret { ptr, i64 } %trimmed.1
ret.original:
  %result.0 = insertvalue { ptr, i64 } undef, ptr %buffer, 0
  %result.1 = insertvalue { ptr, i64 } %result.0, i64 %len, 1
  ret { ptr, i64 } %result.1
}
@.number.shortest.format = private unnamed_addr constant [5 x i8] c"%.*e\00"
@.number.shortest.nan = private unnamed_addr constant [4 x i8] c"NaN\00"
@.number.shortest.infinity = private unnamed_addr constant [9 x i8] c"Infinity\00"
@.number.shortest.negative.infinity = private unnamed_addr constant [10 x i8] c"-Infinity\00"
@.number.shortest.zero = private unnamed_addr constant [2 x i8] c"0\00"
; ECMA-262 6.1.6.1.20 Number::toString(10): the shortest decimal string that parses
; back to the same double. The digit string is the first %.*e rendering whose strtod
; round trip is exact, and `n` is that rendering's exponent plus one, which is the
; position Number::toString lays the decimal point at.
define { ptr, i64 } @numberToShortestString(double %value) {
entry:
  ; Working storage for this call only: the %.*e rendering, and its digits without the point.
  %scratch = alloca [64 x i8]
  %digits = alloca [32 x i8]
  %nan = fcmp uno double %value, %value
  br i1 %nan, label %string.nan, label %check.infinite
string.nan:
  %nan.0 = insertvalue { ptr, i64 } undef, ptr @.number.shortest.nan, 0
  %nan.1 = insertvalue { ptr, i64 } %nan.0, i64 3, 1
  ret { ptr, i64 } %nan.1
check.infinite:
  %absolute = call double @llvm.fabs.f64(double %value)
  %infinite = fcmp oge double %absolute, 0x7FF0000000000000
  br i1 %infinite, label %string.infinite, label %check.zero
string.infinite:
  %infinite.negative = fcmp olt double %value, 0.0
  %infinite.ptr = select i1 %infinite.negative, ptr @.number.shortest.negative.infinity, ptr @.number.shortest.infinity
  %infinite.len = select i1 %infinite.negative, i64 9, i64 8
  %infinite.0 = insertvalue { ptr, i64 } undef, ptr %infinite.ptr, 0
  %infinite.1 = insertvalue { ptr, i64 } %infinite.0, i64 %infinite.len, 1
  ret { ptr, i64 } %infinite.1
check.zero:
  %zero = fcmp oeq double %value, 0.0
  br i1 %zero, label %string.zero, label %finite
string.zero:
  %zero.0 = insertvalue { ptr, i64 } undef, ptr @.number.shortest.zero, 0
  %zero.1 = insertvalue { ptr, i64 } %zero.0, i64 1, 1
  ret { ptr, i64 } %zero.1
finite:
  %out = call ptr @malloc(i64 64)
  %negative = fcmp olt double %value, 0.0
  %sign.length = select i1 %negative, i64 1, i64 0
  %sign.byte = select i1 %negative, i8 45, i8 48
  store i8 %sign.byte, ptr %out
  br label %precision.loop
precision.loop:
  %precision = phi i64 [ 1, %finite ], [ %precision.next, %precision.more ]
  %significant = sub i64 %precision, 1
  %significant.i32 = trunc i64 %significant to i32
  call i32 (ptr, ptr, ...) @sprintf(ptr %scratch, ptr @.number.shortest.format, i32 %significant.i32, double %absolute)
  %round.trip = call double @strtod(ptr %scratch, ptr null)
  %matches = fcmp oeq double %round.trip, %absolute
  br i1 %matches, label %digit.scan, label %precision.more
precision.more:
  %precision.next = add i64 %precision, 1
  %exhausted = icmp eq i64 %precision.next, 18
  br i1 %exhausted, label %digit.scan, label %precision.loop
digit.scan:
  %scan.index = phi i64 [ 0, %precision.loop ], [ 0, %precision.more ], [ %scan.next.index, %digit.step ]
  %scan.count = phi i64 [ 0, %precision.loop ], [ 0, %precision.more ], [ %scan.next.count, %digit.step ]
  %scan.ptr = getelementptr i8, ptr %scratch, i64 %scan.index
  %scan.char = load i8, ptr %scan.ptr
  %scan.marker = icmp eq i8 %scan.char, 101
  %scan.separator = icmp eq i8 %scan.char, 46
  %scan.is.digit = xor i1 %scan.marker, true
  %scan.is.digit.separated = xor i1 %scan.separator, true
  %scan.kept = and i1 %scan.is.digit, %scan.is.digit.separated
  %scan.slot = getelementptr i8, ptr %digits, i64 %scan.count
  %scan.byte = select i1 %scan.kept, i8 %scan.char, i8 48
  store i8 %scan.byte, ptr %scan.slot
  %scan.count.advanced = add i64 %scan.count, 1
  %scan.next.count = select i1 %scan.kept, i64 %scan.count.advanced, i64 %scan.count
  %scan.next.index = add i64 %scan.index, 1
  br i1 %scan.marker, label %exponent.sign, label %digit.step
digit.step:
  br label %digit.scan
exponent.sign:
  %exponent.next = add i64 %scan.index, 1
  %exponent.sign.ptr = getelementptr i8, ptr %scratch, i64 %exponent.next
  %exponent.sign.char = load i8, ptr %exponent.sign.ptr
  %exponent.negative = icmp eq i8 %exponent.sign.char, 45
  %exponent.start = add i64 %exponent.next, 1
  br label %exponent.loop
exponent.loop:
  %exponent.position = phi i64 [ %exponent.start, %exponent.sign ], [ %exponent.position.next, %exponent.body ]
  %exponent.value = phi i64 [ 0, %exponent.sign ], [ %exponent.value.next, %exponent.body ]
  %exponent.ptr = getelementptr i8, ptr %scratch, i64 %exponent.position
  %exponent.char = load i8, ptr %exponent.ptr
  %exponent.at.least = icmp uge i8 %exponent.char, 48
  %exponent.at.most = icmp ule i8 %exponent.char, 57
  %exponent.is.digit = and i1 %exponent.at.least, %exponent.at.most
  br i1 %exponent.is.digit, label %exponent.body, label %layout
exponent.body:
  %exponent.digit.code = sub i8 %exponent.char, 48
  %exponent.digit.value = zext i8 %exponent.digit.code to i64
  %exponent.scaled = mul i64 %exponent.value, 10
  %exponent.value.next = add i64 %exponent.scaled, %exponent.digit.value
  %exponent.position.next = add i64 %exponent.position, 1
  br label %exponent.loop
layout:
  %exponent.negated = sub i64 0, %exponent.value
  %exponent.signed = select i1 %exponent.negative, i64 %exponent.negated, i64 %exponent.value
  %point = add i64 %exponent.signed, 1
  br label %check.large
check.large:
  %too.large = icmp sgt i64 %point, 21
  br i1 %too.large, label %exponential, label %check.positive
check.positive:
  %positive = icmp sgt i64 %point, 0
  br i1 %positive, label %plain, label %check.small
check.small:
  %small = icmp sgt i64 %point, -6
  br i1 %small, label %leading.zeros, label %exponential
plain:
  %integral = icmp sle i64 %scan.count, %point
  %plain.fraction = xor i1 %integral, true
  %plain.fractional.length = add i64 %scan.count, 1
  %plain.length = select i1 %integral, i64 %point, i64 %plain.fractional.length
  br label %decimal.loop
leading.zeros:
  %leading.count = sub i64 0, %point
  %leading.base = add i64 %leading.count, 2
  %leading.length = add i64 %leading.base, %scan.count
  br label %decimal.loop
decimal.loop:
  %decimal.point = phi i64 [ %point, %plain ], [ 1, %leading.zeros ], [ %decimal.point, %decimal.body ]
  %decimal.pointed = phi i1 [ %plain.fraction, %plain ], [ true, %leading.zeros ], [ %decimal.pointed, %decimal.body ]
  %decimal.base = phi i64 [ 0, %plain ], [ %leading.base, %leading.zeros ], [ %decimal.base, %decimal.body ]
  %decimal.length = phi i64 [ %plain.length, %plain ], [ %leading.length, %leading.zeros ], [ %decimal.length, %decimal.body ]
  %decimal.index = phi i64 [ 0, %plain ], [ 0, %leading.zeros ], [ %decimal.next, %decimal.body ]
  %decimal.done = icmp uge i64 %decimal.index, %decimal.length
  br i1 %decimal.done, label %decimal.result, label %decimal.body
decimal.body:
  %decimal.at.point = icmp eq i64 %decimal.index, %decimal.point
  %decimal.is.point = and i1 %decimal.at.point, %decimal.pointed
  %decimal.after.point = icmp sgt i64 %decimal.index, %decimal.point
  %decimal.point.past = icmp sge i64 %decimal.point, %decimal.base
  %decimal.displaces = and i1 %decimal.after.point, %decimal.point.past
  %decimal.shifted = and i1 %decimal.displaces, %decimal.pointed
  %decimal.shift = select i1 %decimal.shifted, i64 1, i64 0
  %decimal.beyond.base = icmp uge i64 %decimal.index, %decimal.base
  %decimal.relative = sub i64 %decimal.index, %decimal.base
  %decimal.read = sub i64 %decimal.relative, %decimal.shift
  %decimal.in.range = icmp ult i64 %decimal.read, %scan.count
  %decimal.has.digit = and i1 %decimal.beyond.base, %decimal.in.range
  %decimal.load.index = select i1 %decimal.has.digit, i64 %decimal.read, i64 0
  %decimal.source = getelementptr i8, ptr %digits, i64 %decimal.load.index
  %decimal.byte = load i8, ptr %decimal.source
  %decimal.written = select i1 %decimal.has.digit, i8 %decimal.byte, i8 48
  %decimal.placed = select i1 %decimal.is.point, i8 46, i8 %decimal.written
  %decimal.offset = add i64 %sign.length, %decimal.index
  %decimal.slot = getelementptr i8, ptr %out, i64 %decimal.offset
  store i8 %decimal.placed, ptr %decimal.slot
  %decimal.next = add i64 %decimal.index, 1
  br label %decimal.loop
decimal.result:
  %decimal.total = add i64 %sign.length, %decimal.length
  %decimal.nul = getelementptr i8, ptr %out, i64 %decimal.total
  store i8 0, ptr %decimal.nul
  %decimal.result.0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %decimal.result.1 = insertvalue { ptr, i64 } %decimal.result.0, i64 %decimal.total, 1
  ret { ptr, i64 } %decimal.result.1
exponential:
  %mantissa.fraction = icmp sgt i64 %scan.count, 1
  %mantissa.point.offset = select i1 %mantissa.fraction, i64 1, i64 0
  %mantissa.length = add i64 %scan.count, %mantissa.point.offset
  br label %exponent.measure
exponent.measure:
  %measure.quotient = phi i64 [ %exponent.value, %exponential ], [ %measure.quotient.next, %exponent.measure.body ]
  %measure.power = phi i64 [ 1, %exponential ], [ %measure.power.next, %exponent.measure.body ]
  %measure.width = phi i64 [ 1, %exponential ], [ %measure.width.next, %exponent.measure.body ]
  %measure.wider = icmp uge i64 %measure.quotient, 10
  br i1 %measure.wider, label %exponent.measure.body, label %mantissa.loop
exponent.measure.body:
  %measure.quotient.next = udiv i64 %measure.quotient, 10
  %measure.power.next = mul i64 %measure.power, 10
  %measure.width.next = add i64 %measure.width, 1
  br label %exponent.measure
mantissa.loop:
  %mantissa.index = phi i64 [ 0, %exponent.measure ], [ %mantissa.next, %mantissa.body ]
  %mantissa.done = icmp uge i64 %mantissa.index, %mantissa.length
  br i1 %mantissa.done, label %mantissa.result, label %mantissa.body
mantissa.body:
  %mantissa.at.point = icmp eq i64 %mantissa.index, 1
  %mantissa.is.point = and i1 %mantissa.at.point, %mantissa.fraction
  %mantissa.after.first = icmp ugt i64 %mantissa.index, 0
  %mantissa.shift = zext i1 %mantissa.after.first to i64
  %mantissa.read = sub i64 %mantissa.index, %mantissa.shift
  %mantissa.has.digit = icmp ult i64 %mantissa.read, %scan.count
  %mantissa.load.index = select i1 %mantissa.has.digit, i64 %mantissa.read, i64 0
  %mantissa.source = getelementptr i8, ptr %digits, i64 %mantissa.load.index
  %mantissa.byte = load i8, ptr %mantissa.source
  %mantissa.written = select i1 %mantissa.has.digit, i8 %mantissa.byte, i8 48
  %mantissa.placed = select i1 %mantissa.is.point, i8 46, i8 %mantissa.written
  %mantissa.offset = add i64 %sign.length, %mantissa.index
  %mantissa.slot = getelementptr i8, ptr %out, i64 %mantissa.offset
  store i8 %mantissa.placed, ptr %mantissa.slot
  %mantissa.next = add i64 %mantissa.index, 1
  br label %mantissa.loop
mantissa.result:
  %marked.offset = add i64 %sign.length, %mantissa.length
  %marked.slot = getelementptr i8, ptr %out, i64 %marked.offset
  store i8 101, ptr %marked.slot
  %signed.offset = add i64 %marked.offset, 1
  %signed.slot = getelementptr i8, ptr %out, i64 %signed.offset
  %signed.byte = select i1 %exponent.negative, i8 45, i8 43
  store i8 %signed.byte, ptr %signed.slot
  %write.start = add i64 %signed.offset, 1
  %write.end = add i64 %write.start, %measure.width
  br label %write.loop
write.loop:
  %write.position = phi i64 [ %write.start, %mantissa.result ], [ %write.position.next, %write.body ]
  %write.remaining = phi i64 [ %exponent.value, %mantissa.result ], [ %write.rest, %write.body ]
  %write.divisor = phi i64 [ %measure.power, %mantissa.result ], [ %write.divisor.next, %write.body ]
  %write.done = icmp uge i64 %write.position, %write.end
  br i1 %write.done, label %exponential.result, label %write.body
write.body:
  %write.position.next = add i64 %write.position, 1
  %write.digit = udiv i64 %write.remaining, %write.divisor
  %write.taken = mul i64 %write.digit, %write.divisor
  %write.rest = sub i64 %write.remaining, %write.taken
  %write.code = add i64 %write.digit, 48
  %write.byte = trunc i64 %write.code to i8
  %write.slot = getelementptr i8, ptr %out, i64 %write.position
  store i8 %write.byte, ptr %write.slot
  %write.divisor.next = udiv i64 %write.divisor, 10
  br label %write.loop
exponential.result:
  %exponential.total = add i64 %sign.length, %write.end
  %exponential.nul = getelementptr i8, ptr %out, i64 %exponential.total
  store i8 0, ptr %exponential.nul
  %exponential.0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %exponential.1 = insertvalue { ptr, i64 } %exponential.0, i64 %exponential.total, 1
  ret { ptr, i64 } %exponential.1
}
@.number.radix.digits = private unnamed_addr constant [37 x i8] c"0123456789abcdefghijklmnopqrstuvwxyz\00"
@.number.radix.nan = private unnamed_addr constant [4 x i8] c"NaN\00"
@.number.radix.inf = private unnamed_addr constant [9 x i8] c"Infinity\00"
@.number.radix.ninf = private unnamed_addr constant [10 x i8] c"-Infinity\00"

define { ptr, i64 } @numberToStringRadix(double %value, double %radix.value) {
entry:
  %radix.trunc = call double @llvm.trunc.f64(double %radix.value)
  %radix = fptosi double %radix.trunc to i64
  %is.decimal = icmp eq i64 %radix, 10
  br i1 %is.decimal, label %decimal, label %check.special
decimal:
  %radix.decimal = call { ptr, i64 } @numberToShortestString(double %value)
  ret { ptr, i64 } %radix.decimal
check.special:
  %is.nan = fcmp uno double %value, %value
  br i1 %is.nan, label %ret.nan, label %check.inf
ret.nan:
  %nan.buf = call ptr @malloc(i64 4)
  call ptr @memcpy(ptr %nan.buf, ptr @.number.radix.nan, i64 4)
  %nan.0 = insertvalue { ptr, i64 } undef, ptr %nan.buf, 0
  %nan.1 = insertvalue { ptr, i64 } %nan.0, i64 3, 1
  ret { ptr, i64 } %nan.1
check.inf:
  %abs.val = call double @llvm.fabs.f64(double %value)
  %is.inf = fcmp oeq double %abs.val, 0x7FF0000000000000
  br i1 %is.inf, label %ret.inf, label %check.zero
ret.inf:
  %inf.neg = fcmp olt double %value, 0.0
  br i1 %inf.neg, label %ret.ninf, label %ret.pinf
ret.pinf:
  %pinf.buf = call ptr @malloc(i64 9)
  call ptr @memcpy(ptr %pinf.buf, ptr @.number.radix.inf, i64 9)
  %pinf.0 = insertvalue { ptr, i64 } undef, ptr %pinf.buf, 0
  %pinf.1 = insertvalue { ptr, i64 } %pinf.0, i64 8, 1
  ret { ptr, i64 } %pinf.1
ret.ninf:
  %ninf.buf = call ptr @malloc(i64 10)
  call ptr @memcpy(ptr %ninf.buf, ptr @.number.radix.ninf, i64 10)
  %ninf.0 = insertvalue { ptr, i64 } undef, ptr %ninf.buf, 0
  %ninf.1 = insertvalue { ptr, i64 } %ninf.0, i64 9, 1
  ret { ptr, i64 } %ninf.1
check.zero:
  %is.zero = fcmp oeq double %abs.val, 0.0
  br i1 %is.zero, label %zero, label %convert
zero:
  %zout = call ptr @malloc(i64 2)
  store i8 48, ptr %zout
  %zero.end = getelementptr i8, ptr %zout, i64 1
  store i8 0, ptr %zero.end
  %zero.0 = insertvalue { ptr, i64 } undef, ptr %zout, 0
  %zero.1 = insertvalue { ptr, i64 } %zero.0, i64 1, 1
  ret { ptr, i64 } %zero.1
convert:
  %negative = fcmp olt double %value, 0.0
  %radix.d = sitofp i64 %radix to double
  %int.part = call double @llvm.floor.f64(double %abs.val)
  %frac.init = fsub double %abs.val, %int.part
  %scratch = call ptr @malloc(i64 1200)
  %out = call ptr @malloc(i64 1280)
  %int.zero = fcmp oeq double %int.part, 0.0
  br i1 %int.zero, label %int.zero.digit, label %digits.loop
int.zero.digit:
  store i8 48, ptr %scratch
  br label %copy.setup
digits.loop:
  %n = phi double [ %int.part, %convert ], [ %next.n, %digits.more ]
  %count.loop = phi i64 [ 0, %convert ], [ %next.count, %digits.more ]
  %done = fcmp ole double %n, 0.0
  br i1 %done, label %copy.setup, label %digits.more
digits.more:
  %rem.d = frem double %n, %radix.d
  %rem.i = fptosi double %rem.d to i64
  %digit.ptr = getelementptr [37 x i8], ptr @.number.radix.digits, i64 0, i64 %rem.i
  %digit = load i8, ptr %digit.ptr
  %scratch.slot = getelementptr i8, ptr %scratch, i64 %count.loop
  store i8 %digit, ptr %scratch.slot
  %div.d = fdiv double %n, %radix.d
  %next.n = call double @llvm.floor.f64(double %div.d)
  %next.count = add i64 %count.loop, 1
  br label %digits.loop
copy.setup:
  %count = phi i64 [ 1, %int.zero.digit ], [ %count.loop, %digits.loop ]
  br i1 %negative, label %copy.sign, label %copy.loop
copy.sign:
  store i8 45, ptr %out
  br label %copy.loop
copy.loop:
  %copy.i = phi i64 [ 0, %copy.setup ], [ 0, %copy.sign ], [ %copy.next, %copy.body ]
  %prefix = phi i64 [ 0, %copy.setup ], [ 1, %copy.sign ], [ %prefix, %copy.body ]
  %copy.done = icmp eq i64 %copy.i, %count
  br i1 %copy.done, label %frac.check, label %copy.body
copy.body:
  %rev.offset = sub i64 %count, %copy.i
  %src.index = sub i64 %rev.offset, 1
  %src = getelementptr i8, ptr %scratch, i64 %src.index
  %char = load i8, ptr %src
  %dst.index = add i64 %prefix, %copy.i
  %dst = getelementptr i8, ptr %out, i64 %dst.index
  store i8 %char, ptr %dst
  %copy.next = add i64 %copy.i, 1
  br label %copy.loop
frac.check:
  %int.len = add i64 %prefix, %count
  call void @free(ptr %scratch)
  %has.frac = fcmp ogt double %frac.init, 0.0
  br i1 %has.frac, label %frac.start, label %finish
frac.start:
  %dot.slot = getelementptr i8, ptr %out, i64 %int.len
  store i8 46, ptr %dot.slot
  %frac.pos0 = add i64 %int.len, 1
  %ulp.raw = fmul double %abs.val, 1.1102230246251565e-16
  %ulp.tiny = fcmp olt double %ulp.raw, 2.2250738585072014e-308
  %delta0 = select i1 %ulp.tiny, double 2.2250738585072014e-308, double %ulp.raw
  br label %frac.loop
frac.loop:
  %fpos = phi i64 [ %frac.pos0, %frac.start ], [ %fpos.next, %frac.step ]
  %fcur = phi double [ %frac.init, %frac.start ], [ %fnext, %frac.step ]
  %fdelta = phi double [ %delta0, %frac.start ], [ %fdelta.next, %frac.step ]
  %fdigits = phi i64 [ 0, %frac.start ], [ %fdigits.next, %frac.step ]
  %fgt = fcmp ogt double %fcur, %fdelta
  %flimit = icmp ult i64 %fdigits, 60
  %fkeep = and i1 %fgt, %flimit
  br i1 %fkeep, label %frac.step, label %finish
frac.step:
  %fscaled = fmul double %fcur, %radix.d
  %fdelta.next = fmul double %fdelta, %radix.d
  %fdigit.d = call double @llvm.floor.f64(double %fscaled)
  %frem = fsub double %fscaled, %fdigit.d
  %fround.lo = fcmp ogt double %frem, 5.000000e-01
  %frem.plus = fadd double %frem, %fdelta.next
  %fround.hi = fcmp oge double %frem.plus, 1.0
  %fround = and i1 %fround.lo, %fround.hi
  %fdigit.i0 = fptosi double %fdigit.d to i64
  %fdigit.inc = add i64 %fdigit.i0, 1
  %fmax.digit = sub i64 %radix, 1
  %fcan.inc = icmp slt i64 %fdigit.i0, %fmax.digit
  %fdo.round = and i1 %fround, %fcan.inc
  %fdigit.i = select i1 %fdo.round, i64 %fdigit.inc, i64 %fdigit.i0
  %fdigit.ptr = getelementptr [37 x i8], ptr @.number.radix.digits, i64 0, i64 %fdigit.i
  %fdigit.ch = load i8, ptr %fdigit.ptr
  %fslot = getelementptr i8, ptr %out, i64 %fpos
  store i8 %fdigit.ch, ptr %fslot
  %fpos.next = add i64 %fpos, 1
  %fdigits.next = add i64 %fdigits, 1
  %fnext = select i1 %fdo.round, double 0.0, double %frem
  br label %frac.loop
finish:
  %final.len = phi i64 [ %int.len, %frac.check ], [ %fpos, %frac.loop ]
  %nul = getelementptr i8, ptr %out, i64 %final.len
  store i8 0, ptr %nul
  %result.0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %result.1 = insertvalue { ptr, i64 } %result.0, i64 %final.len, 1
  ret { ptr, i64 } %result.1
}
define double @parseInt(i64 %value.len, ptr %value.ptr) {
entry:
  %parsed = call double @strtod(ptr %value.ptr, ptr null)
  %int = fptosi double %parsed to i64
  %truncated = sitofp i64 %int to double
  ret double %truncated
}
define double @parseFloat(i64 %value.len, ptr %value.ptr) {
entry:
  %parsed = call double @strtod(ptr %value.ptr, ptr null)
  ret double %parsed
}
define double @mathAbs(double %value) {
entry:
  %lt = fcmp olt double %value, 0.0
  %neg = fneg double %value
  %result = select i1 %lt, double %neg, double %value
  ret double %result
}
define double @mathFloor(double %value) {
entry:
  %result = call double @llvm.floor.f64(double %value)
  ret double %result
}
define double @mathCeil(double %value) {
entry:
  %result = call double @llvm.ceil.f64(double %value)
  ret double %result
}
define double @mathTrunc(double %value) {
entry:
  %result = call double @llvm.trunc.f64(double %value)
  ret double %result
}
define double @mathRound(double %value) {
entry:
  %biased = fadd double %value, 5.000000e-01
  %result = call double @llvm.floor.f64(double %biased)
  ret double %result
}
define double @mathSqrt(double %value) {
entry:
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %next.i, %loop ]
  %guess = phi double [ %value, %entry ], [ %next.guess, %loop ]
  %div = fdiv double %value, %guess
  %sum = fadd double %guess, %div
  %next.guess = fmul double %sum, 5.000000e-01
  %next.i = add i64 %i, 1
  %done = icmp eq i64 %next.i, 8
  br i1 %done, label %end, label %loop
end:
  ret double %next.guess
}
define double @mathPow(double %base, double %exponent) {
entry:
  %result = call double @llvm.pow.f64(double %base, double %exponent)
  ret double %result
}
define double @mathCbrt(double %value) {
entry:
  %negative = fcmp olt double %value, 0.0
  %abs = call double @mathAbs(double %value)
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %next.i, %loop ]
  %guess = phi double [ %abs, %entry ], [ %next.guess, %loop ]
  %guess.sq = fmul double %guess, %guess
  %div = fdiv double %abs, %guess.sq
  %double.guess = fmul double %guess, 2.0
  %sum = fadd double %double.guess, %div
  %next.guess = fdiv double %sum, 3.0
  %next.i = add i64 %i, 1
  %done = icmp eq i64 %next.i, 12
  br i1 %done, label %end, label %loop
end:
  %negated = fneg double %next.guess
  %result = select i1 %negative, double %negated, double %next.guess
  ret double %result
}
define double @mathExp(double %value) {
entry:
  %result = call double @llvm.exp.f64(double %value)
  ret double %result
}
define double @mathLog(double %value) {
entry:
  %result = call double @llvm.log.f64(double %value)
  ret double %result
}
define double @mathLog2(double %value) {
entry:
  %result = call double @llvm.log2.f64(double %value)
  ret double %result
}
define double @mathLog10(double %value) {
entry:
  %result = call double @llvm.log10.f64(double %value)
  ret double %result
}
define double @mathHypot2(double %left, double %right) {
entry:
  %left.sq = fmul double %left, %left
  %right.sq = fmul double %right, %right
  %sum = fadd double %left.sq, %right.sq
  %result = call double @mathSqrt(double %sum)
  ret double %result
}
define double @mathMin2(double %left, double %right) {
entry:
  %cmp = fcmp olt double %left, %right
  %result = select i1 %cmp, double %left, double %right
  ret double %result
}
define double @mathMax2(double %left, double %right) {
entry:
  %cmp = fcmp ogt double %left, %right
  %result = select i1 %cmp, double %left, double %right
  ret double %result
}
define double @mathSign(double %value) {
entry:
  %lt = fcmp olt double %value, 0.0
  %gt = fcmp ogt double %value, 0.0
  %positive = select i1 %gt, double 1.0, double 0.0
  %result = select i1 %lt, double -1.0, double %positive
  ret double %result
}
@math.random.state = internal global i64 88172645463393265
@math.random.seeded = internal global i1 false

define double @mathRandom() {
entry:
  %seeded = load i1, ptr @math.random.seeded
  br i1 %seeded, label %step, label %seed
seed:
  %tv = alloca [2 x i64]
  store i64 0, ptr %tv
  %tv.usec.slot = getelementptr [2 x i64], ptr %tv, i64 0, i64 1
  store i64 0, ptr %tv.usec.slot
  call i32 @gettimeofday(ptr %tv, ptr null)
  %sec = load i64, ptr %tv
  %usec32 = load i32, ptr %tv.usec.slot
  %usec = sext i32 %usec32 to i64
  %sec.us = mul i64 %sec, 1000000
  %now.us = add i64 %sec.us, %usec
  %addr.entropy = ptrtoint ptr %tv to i64
  %mix0 = xor i64 %now.us, %addr.entropy
  %mix1 = add i64 %mix0, -7046029254386353131
  %s1 = lshr i64 %mix1, 30
  %x1 = xor i64 %mix1, %s1
  %m1 = mul i64 %x1, -4658895280553007687
  %s2 = lshr i64 %m1, 27
  %x2 = xor i64 %m1, %s2
  %m2 = mul i64 %x2, -7723592293110705685
  %s3 = lshr i64 %m2, 31
  %init.state = xor i64 %m2, %s3
  store i64 %init.state, ptr @math.random.state
  store i1 true, ptr @math.random.seeded
  br label %step
step:
  %state = load i64, ptr @math.random.state
  %next = add i64 %state, -7046029254386353131
  store i64 %next, ptr @math.random.state
  %z1.s = lshr i64 %next, 30
  %z1.x = xor i64 %next, %z1.s
  %z1 = mul i64 %z1.x, -4658895280553007687
  %z2.s = lshr i64 %z1, 27
  %z2.x = xor i64 %z1, %z2.s
  %z2 = mul i64 %z2.x, -7723592293110705685
  %z3.s = lshr i64 %z2, 31
  %z = xor i64 %z2, %z3.s
  %mantissa = lshr i64 %z, 11
  %as.double = uitofp i64 %mantissa to double
  %result = fdiv double %as.double, 9.007199254740992e+15
  ret double %result
}
define double @mathFround(double %value) {
entry:
  %float = fptrunc double %value to float
  %result = fpext float %float to double
  ret double %result
}
define double @mathClz32(double %value) {
entry:
  %int = fptoui double %value to i32
  %count = call i32 @llvm.ctlz.i32(i32 %int, i1 false)
  %result = uitofp i32 %count to double
  ret double %result
}
define double @mathImul(double %left, double %right) {
entry:
  %left.i = fptosi double %left to i32
  %right.i = fptosi double %right to i32
  %product = mul i32 %left.i, %right.i
  %result = sitofp i32 %product to double
  ret double %result
}
define double @mathSin(double %value) {
entry:
  %result = call double @llvm.sin.f64(double %value)
  ret double %result
}
define double @mathCos(double %value) {
entry:
  %result = call double @llvm.cos.f64(double %value)
  ret double %result
}
define double @mathTan(double %value) {
entry:
  %sin = call double @llvm.sin.f64(double %value)
  %cos = call double @llvm.cos.f64(double %value)
  %result = fdiv double %sin, %cos
  ret double %result
}
define double @mathAsin(double %value) {
entry:
  %result = call double @asin(double %value)
  ret double %result
}
define double @mathAcos(double %value) {
entry:
  %result = call double @acos(double %value)
  ret double %result
}
define double @mathAtan(double %value) {
entry:
  %result = call double @atan(double %value)
  ret double %result
}
define double @mathAtan2(double %y, double %x) {
entry:
  %result = call double @atan2(double %y, double %x)
  ret double %result
}

define double @dateNow() {
entry:
  %tv = alloca [2 x i64]
  store i64 0, ptr %tv
  %usec.slot = getelementptr [2 x i64], ptr %tv, i64 0, i64 1
  store i64 0, ptr %usec.slot
  call i32 @gettimeofday(ptr %tv, ptr null)
  %sec = load i64, ptr %tv
  %usec32 = load i32, ptr %usec.slot
  %usec = sext i32 %usec32 to i64
  %sec.ms = mul i64 %sec, 1000
  %usec.ms = sdiv i64 %usec, 1000
  %total.ms = add i64 %sec.ms, %usec.ms
  %as.double = sitofp i64 %total.ms to double
  ret double %as.double
}

@.date.ms.key = private unnamed_addr constant [12 x i8] c"__date_ms__\00"
@.date.key.getTime = private unnamed_addr constant [8 x i8] c"getTime\00"
@.date.key.valueOf = private unnamed_addr constant [8 x i8] c"valueOf\00"
@.date.key.toISOString = private unnamed_addr constant [12 x i8] c"toISOString\00"
@.date.key.toString = private unnamed_addr constant [9 x i8] c"toString\00"
@.date.not.date = private unnamed_addr constant [41 x i8] c"Date.prototype method called on non-Date\00"
@.date.range.err = private unnamed_addr constant [11 x i8] c"RangeError\00"
@.date.invalid.time = private unnamed_addr constant [19 x i8] c"Invalid time value\00"
@.date.invalid.str = private unnamed_addr constant [13 x i8] c"Invalid Date\00"
@.date.iso.fmt = private unnamed_addr constant [50 x i8] c"%04lld-%02lld-%02lldT%02lld:%02lld:%02lld.%03lldZ\00"

@datePrototypeValue = private global i64 0

define { i64, i1 } @dateReadTimestamp(i64 %this.value) {
entry:
  %is.obj = call i1 @valueIsObject(i64 %this.value)
  br i1 %is.obj, label %check.priv, label %not.date
check.priv:
  %obj = call ptr @valueObjectPtr(i64 %this.value)
  %priv.slot = getelementptr i8, ptr %obj, i64 56
  %priv = load ptr, ptr %priv.slot
  %has.priv = icmp ne ptr %priv, null
  br i1 %has.priv, label %read, label %not.date
read:
  %has.key = call i1 @objectHasOwn(ptr %priv, i64 11, ptr @.date.ms.key)
  br i1 %has.key, label %ok, label %not.date
ok:
  %ms = call i64 @objectGet(ptr %priv, i64 11, ptr @.date.ms.key)
  %r0 = insertvalue { i64, i1 } undef, i64 %ms, 0
  %r1 = insertvalue { i64, i1 } %r0, i1 false, 1
  ret { i64, i1 } %r1
not.date:
  %msg = call i64 @valueBoxString(ptr @.date.not.date, i64 40)
  %err = call { i64, i1 } @iteratorTypeError(i64 %msg)
  ret { i64, i1 } %err
}

define { ptr, i64 } @dateFormatIso(double %ms.val) {
entry:
  %total.ms = fptosi double %ms.val to i64
  %q = sdiv i64 %total.ms, 86400000
  %r = srem i64 %total.ms, 86400000
  %r.neg = icmp slt i64 %r, 0
  %days = select i1 %r.neg, i64 -1, i64 0
  %days.adj = add i64 %q, %days
  %rem.adj = add i64 %r, 86400000
  %rem.ms = select i1 %r.neg, i64 %rem.adj, i64 %r
  %hour = sdiv i64 %rem.ms, 3600000
  %rem1 = srem i64 %rem.ms, 3600000
  %minute = sdiv i64 %rem1, 60000
  %rem2 = srem i64 %rem1, 60000
  %second = sdiv i64 %rem2, 1000
  %msec = srem i64 %rem2, 1000
  %z = add i64 %days.adj, 719468
  %z.neg = icmp slt i64 %z, 0
  %z.sub = sub i64 %z, 146096
  %z.num = select i1 %z.neg, i64 %z.sub, i64 %z
  %era = sdiv i64 %z.num, 146097
  %era.days = mul i64 %era, 146097
  %doe = sub i64 %z, %era.days
  %doe.4 = sdiv i64 %doe, 1460
  %doe.100 = sdiv i64 %doe, 36524
  %doe.400 = sdiv i64 %doe, 146096
  %t1 = sub i64 %doe, %doe.4
  %t2 = add i64 %t1, %doe.100
  %t3 = sub i64 %t2, %doe.400
  %yoe = sdiv i64 %t3, 365
  %era.years = mul i64 %era, 400
  %y = add i64 %yoe, %era.years
  %yoe.365 = mul i64 %yoe, 365
  %yoe.4 = sdiv i64 %yoe, 4
  %yoe.100 = sdiv i64 %yoe, 100
  %y.days1 = add i64 %yoe.365, %yoe.4
  %y.days = sub i64 %y.days1, %yoe.100
  %doy = sub i64 %doe, %y.days
  %doy.5 = mul i64 %doy, 5
  %doy.5p2 = add i64 %doy.5, 2
  %mp = sdiv i64 %doy.5p2, 153
  %mp.153 = mul i64 %mp, 153
  %mp.p2 = add i64 %mp.153, 2
  %mp.div5 = sdiv i64 %mp.p2, 5
  %d0 = sub i64 %doy, %mp.div5
  %day = add i64 %d0, 1
  %mp.lt10 = icmp slt i64 %mp, 10
  %m.a = add i64 %mp, 3
  %m.b = sub i64 %mp, 9
  %month = select i1 %mp.lt10, i64 %m.a, i64 %m.b
  %m.le2 = icmp sle i64 %month, 2
  %y.inc = add i64 %y, 1
  %year = select i1 %m.le2, i64 %y.inc, i64 %y
  %buf = call ptr @malloc(i64 64)
  %written = call i32 (ptr, ptr, ...) @sprintf(ptr %buf, ptr @.date.iso.fmt, i64 %year, i64 %month, i64 %day, i64 %hour, i64 %minute, i64 %second, i64 %msec)
  %len = sext i32 %written to i64
  %r0 = insertvalue { ptr, i64 } undef, ptr %buf, 0
  %r1 = insertvalue { ptr, i64 } %r0, i64 %len, 1
  ret { ptr, i64 } %r1
}

define { i64, i1 } @dateGetTimeMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %res = call { i64, i1 } @dateReadTimestamp(i64 %this.value)
  ret { i64, i1 } %res
}

define { i64, i1 } @dateToIsoStringMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %this.value)
  %ts = call { i64, i1 } @dateReadTimestamp(i64 %this.value)
  %threw = extractvalue { i64, i1 } %ts, 1
  br i1 %threw, label %fail, label %check
fail:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %ts
check:
  %ms.boxed = extractvalue { i64, i1 } %ts, 0
  %ms.num = call double @valueToNumber(i64 %ms.boxed)
  %ordered = fcmp ord double %ms.num, %ms.num
  %abs.ms = call double @llvm.fabs.f64(double %ms.num)
  %in.range = fcmp ole double %abs.ms, 8.640000e+15
  %valid = and i1 %ordered, %in.range
  br i1 %valid, label %format, label %invalid
invalid:
  %msg = call i64 @valueBoxString(ptr @.date.invalid.time, i64 18)
  %err.obj = call ptr @errorNew(i64 3, i64 10, ptr @.date.range.err, i64 %msg)
  %err.val = call i64 @valueBoxObject(ptr %err.obj)
  %e0 = insertvalue { i64, i1 } undef, i64 %err.val, 0
  %e1 = insertvalue { i64, i1 } %e0, i1 true, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %e1
format:
  %formatted = call { ptr, i64 } @dateFormatIso(double %ms.num)
  %ptr = extractvalue { ptr, i64 } %formatted, 0
  %len = extractvalue { ptr, i64 } %formatted, 1
  %str = call i64 @valueBoxString(ptr %ptr, i64 %len)
  %o0 = insertvalue { i64, i1 } undef, i64 %str, 0
  %o1 = insertvalue { i64, i1 } %o0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %o1
}

define { i64, i1 } @dateToStringMethod(i64 %argc, ptr %argv, ptr %env, i64 %this.value) {
entry:
  %frame = call i64 @gcRootSave()
  call void @gcRootPush(i64 %this.value)
  %ts = call { i64, i1 } @dateReadTimestamp(i64 %this.value)
  %threw = extractvalue { i64, i1 } %ts, 1
  br i1 %threw, label %fail, label %check
fail:
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %ts
check:
  %ms.boxed = extractvalue { i64, i1 } %ts, 0
  %ms.num = call double @valueToNumber(i64 %ms.boxed)
  %ordered = fcmp ord double %ms.num, %ms.num
  %abs.ms = call double @llvm.fabs.f64(double %ms.num)
  %in.range = fcmp ole double %abs.ms, 8.640000e+15
  %valid = and i1 %ordered, %in.range
  br i1 %valid, label %format, label %invalid
invalid:
  %inv = call i64 @valueBoxString(ptr @.date.invalid.str, i64 12)
  %i0 = insertvalue { i64, i1 } undef, i64 %inv, 0
  %i1 = insertvalue { i64, i1 } %i0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %i1
format:
  %formatted = call { ptr, i64 } @dateFormatIso(double %ms.num)
  %ptr = extractvalue { ptr, i64 } %formatted, 0
  %len = extractvalue { ptr, i64 } %formatted, 1
  %str = call i64 @valueBoxString(ptr %ptr, i64 %len)
  %o0 = insertvalue { i64, i1 } undef, i64 %str, 0
  %o1 = insertvalue { i64, i1 } %o0, i1 false, 1
  call void @gcRootRestore(i64 %frame)
  ret { i64, i1 } %o1
}

define ptr @datePrototype() {
entry:
  %cached = load i64, ptr @datePrototypeValue
  %ready = icmp ne i64 %cached, 0
  br i1 %ready, label %reuse, label %create
reuse:
  %ptr = call ptr @valueObjectPtr(i64 %cached)
  ret ptr %ptr
create:
  %frame = call i64 @gcRootSave()
  %proto = call ptr @objectNew(i64 4)
  %boxed = call i64 @valueBoxObject(ptr %proto)
  call void @gcRootPush(i64 %boxed)
  %gt.name = call i64 @valueBoxString(ptr @.date.key.getTime, i64 7)
  call void @gcRootPush(i64 %gt.name)
  %gt.fn = call i64 @functionObjectNew(ptr @dateGetTimeMethod, ptr null, i64 9222246136947933184, i64 %gt.name, i64 0)
  call void @gcRootPush(i64 %gt.fn)
  call void @objectDefineDataProperty(ptr %proto, i64 7, ptr @.date.key.getTime, i64 %gt.fn, i64 5)
  %vo.name = call i64 @valueBoxString(ptr @.date.key.valueOf, i64 7)
  call void @gcRootPush(i64 %vo.name)
  %vo.fn = call i64 @functionObjectNew(ptr @dateGetTimeMethod, ptr null, i64 9222246136947933184, i64 %vo.name, i64 0)
  call void @gcRootPush(i64 %vo.fn)
  call void @objectDefineDataProperty(ptr %proto, i64 7, ptr @.date.key.valueOf, i64 %vo.fn, i64 5)
  %iso.name = call i64 @valueBoxString(ptr @.date.key.toISOString, i64 11)
  call void @gcRootPush(i64 %iso.name)
  %iso.fn = call i64 @functionObjectNew(ptr @dateToIsoStringMethod, ptr null, i64 9222246136947933184, i64 %iso.name, i64 0)
  call void @gcRootPush(i64 %iso.fn)
  call void @objectDefineDataProperty(ptr %proto, i64 11, ptr @.date.key.toISOString, i64 %iso.fn, i64 5)
  %ts.name = call i64 @valueBoxString(ptr @.date.key.toString, i64 8)
  call void @gcRootPush(i64 %ts.name)
  %ts.fn = call i64 @functionObjectNew(ptr @dateToStringMethod, ptr null, i64 9222246136947933184, i64 %ts.name, i64 0)
  call void @gcRootPush(i64 %ts.fn)
  call void @objectDefineDataProperty(ptr %proto, i64 8, ptr @.date.key.toString, i64 %ts.fn, i64 5)
  store i64 %boxed, ptr @datePrototypeValue
  call void @gcRegisterGlobalRoot(ptr @datePrototypeValue)
  call void @gcRootRestore(i64 %frame)
  ret ptr %proto
}

define i64 @dateNew(double %ms) {
entry:
  %frame = call i64 @gcRootSave()
  %abs.ms = call double @llvm.fabs.f64(double %ms)
  %ordered = fcmp ord double %ms, %ms
  %in.range = fcmp ole double %abs.ms, 8.640000e+15
  %valid = and i1 %ordered, %in.range
  %trunc.ms = call double @llvm.trunc.f64(double %ms)
  %is.neg.zero = fcmp oeq double %trunc.ms, 0.0
  %clean.ms = select i1 %is.neg.zero, double 0.0, double %trunc.ms
  %final.ms = select i1 %valid, double %clean.ms, double 0x7FF8000000000000
  %proto = call ptr @datePrototype()
  %proto.boxed = call i64 @valueBoxObject(ptr %proto)
  call void @gcRootPush(i64 %proto.boxed)
  %obj = call ptr @objectNew(i64 0)
  %obj.boxed = call i64 @valueBoxObject(ptr %obj)
  call void @gcRootPush(i64 %obj.boxed)
  call void @objectSetPrototype(ptr %obj, ptr %proto)
  %priv = call ptr @objectNew(i64 1)
  %priv.boxed = call i64 @valueBoxObject(ptr %priv)
  call void @gcRootPush(i64 %priv.boxed)
  %ms.boxed = call i64 @valueBoxNumber(double %final.ms)
  call void @objectSet(ptr %priv, i64 11, ptr @.date.ms.key, i64 %ms.boxed)
  %priv.slot = getelementptr i8, ptr %obj, i64 56
  store ptr %priv, ptr %priv.slot
  call void @gcRootRestore(i64 %frame)
  ret i64 %obj.boxed
}

define i32 @numberToInt32(double %value) {
entry:
  %magnitude = call double @llvm.fabs.f64(double %value)
  %finite = fcmp olt double %magnitude, 0x7FF0000000000000
  br i1 %finite, label %convert, label %zero
zero:
  ret i32 0
convert:
  %integer = call double @llvm.trunc.f64(double %value)
  %remainder = frem double %integer, 4294967296.0
  %negative = fcmp olt double %remainder, 0.0
  %wrapped = fadd double %remainder, 4294967296.0
  %unsigned = select i1 %negative, double %wrapped, double %remainder
  %result = fptoui double %unsigned to i32
  ret i32 %result
}

define i64 @numberToIndex(double %value) {
entry:
  %nan = fcmp uno double %value, %value
  br i1 %nan, label %zero, label %lower.check
zero:
  ret i64 0
lower.check:
  %too.low = fcmp ole double %value, -9223372036854775808.0
  br i1 %too.low, label %minimum, label %upper.check
minimum:
  ret i64 -9223372036854775808
upper.check:
  %too.high = fcmp oge double %value, 9223372036854775808.0
  br i1 %too.high, label %maximum, label %convert
maximum:
  ret i64 9223372036854775807
convert:
  %result = fptosi double %value to i64
  ret i64 %result
}
