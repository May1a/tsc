const thirtyTwoBitWord = 32;
const sixtyFourBitWord = 64;
const jsValuePointerAddressBits = 48;
const darwinArm64PointerAddressBits = 47;

export type TargetArchitecture = "x86_64" | "aarch64" | "x86" | "arm" | "unknown";

export interface TargetFacts {
  readonly triple: string;
  readonly architecture: TargetArchitecture;
  readonly pointerWidthBits: number | undefined;
  readonly doubleFormat: "ieee754-binary64" | "other" | "unknown";
  readonly pointerAddressBits: number | undefined;
}

interface HostArchitectureFacts {
  readonly architecture: TargetArchitecture;
  readonly pointerWidthBits: number | undefined;
  readonly pointerAddressBits: Partial<Readonly<Record<NodeJS.Platform, number>>>;
}

// These are default-allocation guarantees of the host ABI, not the CPU's maximum
// address width. The runtime never requests high address mappings.
const hostArchitectures: Partial<Readonly<Record<NodeJS.Architecture, HostArchitectureFacts>>> = {
  x64: {
    architecture: "x86_64",
    pointerWidthBits: sixtyFourBitWord,
    pointerAddressBits: {
      linux: jsValuePointerAddressBits,
      darwin: jsValuePointerAddressBits,
      win32: jsValuePointerAddressBits
    }
  },
  arm64: {
    architecture: "aarch64",
    pointerWidthBits: sixtyFourBitWord,
    // Replace this Darwin host allowlist with target capabilities before adding
    // cross-compilation or arm64e support.
    pointerAddressBits: { darwin: darwinArm64PointerAddressBits }
  },
  ia32: { architecture: "x86", pointerWidthBits: thirtyTwoBitWord, pointerAddressBits: {} },
  arm: { architecture: "arm", pointerWidthBits: thirtyTwoBitWord, pointerAddressBits: {} }
};

const unknownArchitecture: HostArchitectureFacts = {
  architecture: "unknown",
  pointerWidthBits: undefined,
  pointerAddressBits: {}
};

export function normalizeHostTargetFacts(
  architecture: NodeJS.Architecture,
  platform: NodeJS.Platform
): TargetFacts {
  const host = hostArchitectures[architecture] ?? unknownArchitecture;
  return {
    triple: `${host.architecture}-${platform}`,
    architecture: host.architecture,
    pointerWidthBits: host.pointerWidthBits,
    doubleFormat: "ieee754-binary64",
    pointerAddressBits: host.pointerAddressBits[platform]
  };
}
