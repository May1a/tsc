import { jsValueLayout } from "./layout.js";

const cppUnsigned = (value: bigint): string => `${value}ULL`;

export function emitInlineCppJsValueSupport(): string {
  return `static_assert(sizeof(std::uint64_t) == 8);
static_assert(sizeof(double) == 8);
static_assert(std::numeric_limits<double>::is_iec559);

namespace tscn {
inline std::uint64_t number(double value) {
  const auto bits = std::bit_cast<std::uint64_t>(value);
  // FIXME(arm64-darwin): Keep this duplicate check in sync with the LLVM
  // adapter. This recognizes one hardware NaN, not every IEEE-754 NaN.
  const auto is_arm64_nan = bits == ${cppUnsigned(jsValueLayout.arm64CanonicalNaN)};
  return is_arm64_nan ? ${cppUnsigned(jsValueLayout.canonicalNaN)} : bits;
}

inline std::uint64_t undefined() {
  return ${cppUnsigned(jsValueLayout.immediates.undefined)};
}

inline std::uint64_t false_value() {
  return ${cppUnsigned(jsValueLayout.immediates.false)};
}

inline std::uint64_t true_value() {
  return ${cppUnsigned(jsValueLayout.immediates.true)};
}

inline std::uint64_t null() {
  return ${cppUnsigned(jsValueLayout.immediates.null)};
}

inline std::uint64_t array_hole() {
  return ${cppUnsigned(jsValueLayout.internalSentinels.arrayHole)};
}

inline std::uint64_t object(std::uint64_t pointer) {
  return (pointer & ${cppUnsigned(jsValueLayout.payloadMask)}) | ${cppUnsigned(jsValueLayout.references.object)};
}

inline std::uint64_t array(std::uint64_t pointer) {
  return (pointer & ${cppUnsigned(jsValueLayout.payloadMask)}) | ${cppUnsigned(jsValueLayout.references.array)};
}

inline std::uint64_t string(std::uint64_t pointer) {
  return (pointer & ${cppUnsigned(jsValueLayout.payloadMask)}) | ${cppUnsigned(jsValueLayout.references.string)};
}

inline std::uint64_t function(std::uint64_t pointer) {
  return (pointer & ${cppUnsigned(jsValueLayout.payloadMask)}) | ${cppUnsigned(jsValueLayout.references.function)};
}

inline std::uint64_t reference_payload(std::uint64_t value) {
  return value & ${cppUnsigned(jsValueLayout.payloadMask)};
}

inline bool is_object(std::uint64_t value) {
  return (value & ${cppUnsigned(jsValueLayout.tagMask)}) == ${cppUnsigned(jsValueLayout.references.object)};
}

inline bool is_array(std::uint64_t value) {
  return (value & ${cppUnsigned(jsValueLayout.tagMask)}) == ${cppUnsigned(jsValueLayout.references.array)};
}

inline bool is_string(std::uint64_t value) {
  return (value & ${cppUnsigned(jsValueLayout.tagMask)}) == ${cppUnsigned(jsValueLayout.references.string)};
}

inline bool is_function(std::uint64_t value) {
  return (value & ${cppUnsigned(jsValueLayout.tagMask)}) == ${cppUnsigned(jsValueLayout.references.function)};
}

inline bool is_array_hole(std::uint64_t value) {
  return value == ${cppUnsigned(jsValueLayout.internalSentinels.arrayHole)};
}

inline bool is_undefined(std::uint64_t value) {
  return value == ${cppUnsigned(jsValueLayout.immediates.undefined)};
}

inline bool is_false(std::uint64_t value) {
  return value == ${cppUnsigned(jsValueLayout.immediates.false)};
}

inline bool is_true(std::uint64_t value) {
  return value == ${cppUnsigned(jsValueLayout.immediates.true)};
}

inline bool is_null(std::uint64_t value) {
  return value == ${cppUnsigned(jsValueLayout.immediates.null)};
}

inline bool is_number(std::uint64_t value) {
  const auto tag = value & ${cppUnsigned(jsValueLayout.tagMask)};
  return tag < ${cppUnsigned(jsValueLayout.references.object)} || tag > ${cppUnsigned(jsValueLayout.reservedTagMaximum)};
}
}`;
}
