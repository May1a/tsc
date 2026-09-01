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
@.number.fmt.default = private unnamed_addr constant [3 x i8] c"%g\00"
@.number.radix.digits = private unnamed_addr constant [37 x i8] c"0123456789abcdefghijklmnopqrstuvwxyz\00"

define { ptr, i64 } @numberToStringRadix(double %value, double %radix.value) {
entry:
  %radix = fptosi double %radix.value to i64
  %is.decimal = icmp eq i64 %radix, 10
  br i1 %is.decimal, label %decimal, label %convert
decimal:
  %decimal.buffer = call ptr @malloc(i64 128)
  %written = call i32 (ptr, ptr, ...) @sprintf(ptr %decimal.buffer, ptr @.number.fmt.default, double %value)
  %decimal.len = sext i32 %written to i64
  %decimal.0 = insertvalue { ptr, i64 } undef, ptr %decimal.buffer, 0
  %decimal.1 = insertvalue { ptr, i64 } %decimal.0, i64 %decimal.len, 1
  ret { ptr, i64 } %decimal.1
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
