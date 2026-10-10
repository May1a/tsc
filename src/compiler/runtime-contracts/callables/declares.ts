// Generated from Static Runtime IR. Run npm run runtime:contracts to regenerate.
import type { LlvmModuleBuilder } from "../../llvm-ir/index.js";
import { declaresContracts } from "../declares.js";
import { type RuntimeCalleeTable, registerRuntimeContract } from "../register.js";

export function createDeclaresCallees(module: LlvmModuleBuilder): RuntimeCalleeTable<typeof declaresContracts> {
  return {
    "malloc": registerRuntimeContract(module, declaresContracts.malloc),
    "memcpy": registerRuntimeContract(module, declaresContracts.memcpy),
    "memcmp": registerRuntimeContract(module, declaresContracts.memcmp),
    "sprintf": registerRuntimeContract(module, declaresContracts.sprintf),
    "getenv": registerRuntimeContract(module, declaresContracts.getenv),
    "strtol": registerRuntimeContract(module, declaresContracts.strtol),
    "free": registerRuntimeContract(module, declaresContracts.free),
    "llvm.fabs.f64": registerRuntimeContract(module, declaresContracts["llvm.fabs.f64"]),
    "llvm.floor.f64": registerRuntimeContract(module, declaresContracts["llvm.floor.f64"]),
    "llvm.ceil.f64": registerRuntimeContract(module, declaresContracts["llvm.ceil.f64"]),
    "llvm.trunc.f64": registerRuntimeContract(module, declaresContracts["llvm.trunc.f64"]),
    "llvm.round.f64": registerRuntimeContract(module, declaresContracts["llvm.round.f64"]),
    "llvm.sqrt.f64": registerRuntimeContract(module, declaresContracts["llvm.sqrt.f64"]),
    "llvm.pow.f64": registerRuntimeContract(module, declaresContracts["llvm.pow.f64"]),
    "llvm.exp.f64": registerRuntimeContract(module, declaresContracts["llvm.exp.f64"]),
    "llvm.log.f64": registerRuntimeContract(module, declaresContracts["llvm.log.f64"]),
    "llvm.log2.f64": registerRuntimeContract(module, declaresContracts["llvm.log2.f64"]),
    "llvm.log10.f64": registerRuntimeContract(module, declaresContracts["llvm.log10.f64"]),
    "llvm.sin.f64": registerRuntimeContract(module, declaresContracts["llvm.sin.f64"]),
    "llvm.cos.f64": registerRuntimeContract(module, declaresContracts["llvm.cos.f64"]),
    "llvm.ctlz.i32": registerRuntimeContract(module, declaresContracts["llvm.ctlz.i32"]),
    "strtod": registerRuntimeContract(module, declaresContracts.strtod),
    "strlen": registerRuntimeContract(module, declaresContracts.strlen),
  };
}
