define i1 @globalIsNaN(i64 %value) {
entry:
  %number = call double @valueToNumber(i64 %value)
  %ordered = fcmp ord double %number, %number
  %is.nan = xor i1 %ordered, true
  ret i1 %is.nan
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
  %decimal.point = phi i64 [ %point, %plain ], [ 1, %leading.zeros ]
  %decimal.pointed = phi i1 [ %plain.fraction, %plain ], [ true, %leading.zeros ]
  %decimal.base = phi i64 [ 0, %plain ], [ %leading.base, %leading.zeros ]
  %decimal.length = phi i64 [ %plain.length, %plain ], [ %leading.length, %leading.zeros ]
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

define { ptr, i64 } @numberToStringRadix(double %value, double %radix.value) {
entry:
  %radix = fptosi double %radix.value to i64
  %is.decimal = icmp eq i64 %radix, 10
  br i1 %is.decimal, label %decimal, label %convert
decimal:
  %radix.decimal = call { ptr, i64 } @numberToShortestString(double %value)
  ret { ptr, i64 } %radix.decimal
convert:
  %raw = fptosi double %value to i64
  %negative = icmp slt i64 %raw, 0
  %negated = sub i64 0, %raw
  %abs = select i1 %negative, i64 %negated, i64 %raw
  %scratch = call ptr @malloc(i64 128)
  %out = call ptr @malloc(i64 128)
  %is.zero = icmp eq i64 %abs, 0
  br i1 %is.zero, label %zero, label %digits.loop
zero:
  store i8 48, ptr %out
  %zero.end = getelementptr i8, ptr %out, i64 1
  store i8 0, ptr %zero.end
  %zero.0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %zero.1 = insertvalue { ptr, i64 } %zero.0, i64 1, 1
  ret { ptr, i64 } %zero.1
digits.loop:
  %n = phi i64 [ %abs, %convert ], [ %next.n, %digits.more ]
  %count = phi i64 [ 0, %convert ], [ %next.count, %digits.more ]
  %done = icmp eq i64 %n, 0
  br i1 %done, label %copy.setup, label %digits.more
digits.more:
  %rem = srem i64 %n, %radix
  %digit.ptr = getelementptr [37 x i8], ptr @.number.radix.digits, i64 0, i64 %rem
  %digit = load i8, ptr %digit.ptr
  %scratch.slot = getelementptr i8, ptr %scratch, i64 %count
  store i8 %digit, ptr %scratch.slot
  %next.n = sdiv i64 %n, %radix
  %next.count = add i64 %count, 1
  br label %digits.loop
copy.setup:
  br i1 %negative, label %copy.sign, label %copy.loop
copy.sign:
  store i8 45, ptr %out
  br label %copy.loop
copy.loop:
  %copy.i = phi i64 [ 0, %copy.setup ], [ 0, %copy.sign ], [ %copy.next, %copy.body ]
  %prefix = phi i64 [ 0, %copy.setup ], [ 1, %copy.sign ], [ %prefix, %copy.body ]
  %copy.done = icmp eq i64 %copy.i, %count
  br i1 %copy.done, label %copy.end, label %copy.body
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
copy.end:
  %len = add i64 %prefix, %count
  %nul = getelementptr i8, ptr %out, i64 %len
  store i8 0, ptr %nul
  %result.0 = insertvalue { ptr, i64 } undef, ptr %out, 0
  %result.1 = insertvalue { ptr, i64 } %result.0, i64 %len, 1
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
  %int = fptosi double %value to i64
  %result = sitofp i64 %int to double
  ret double %result
}
define double @mathCeil(double %value) {
entry:
  %int = fptosi double %value to i64
  %trunc = sitofp i64 %int to double
  %has.frac = fcmp ogt double %value, %trunc
  %next = add i64 %int, 1
  %ceil.int = select i1 %has.frac, i64 %next, i64 %int
  %result = sitofp i64 %ceil.int to double
  ret double %result
}
define double @mathTrunc(double %value) {
entry:
  %int = fptosi double %value to i64
  %result = sitofp i64 %int to double
  ret double %result
}
define double @mathRound(double %value) {
entry:
  %biased = fadd double %value, 5.000000e-01
  %int = fptosi double %biased to i64
  %result = sitofp i64 %int to double
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

define double @mathRandom() {
entry:
  %state = load i64, ptr @math.random.state
  %mul = mul i64 %state, 2862933555777941757
  %next = add i64 %mul, 3037000493
  store i64 %next, ptr @math.random.state
  %mantissa = lshr i64 %next, 12
  %as.double = uitofp i64 %mantissa to double
  %result = fdiv double %as.double, 4.503599627370496e+15
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
