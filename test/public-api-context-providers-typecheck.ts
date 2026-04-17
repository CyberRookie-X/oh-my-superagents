import type {
  ControlPlaneCliContextProviderConfig,
  ControlPlaneConfig,
  ControlPlaneFileContextProviderConfig,
  ControlPlaneContextProviderCapability,
  ControlPlaneMcpContextProviderConfig,
  ResolvedContextProvider,
  RunCliContextProviderInput,
} from "../src/index.js"

type Assert<T extends true> = T
type IsExactlyReadonlyStringArray<T> =
  [T] extends [readonly string[] | undefined]
    ? [readonly string[] | undefined] extends [T]
      ? true
      : false
    : false
type IsExactlyReadonlyCapabilityArray<T> =
  [T] extends [readonly ControlPlaneContextProviderCapability[]]
    ? [readonly ControlPlaneContextProviderCapability[]] extends [T]
      ? true
      : false
    : false

type _FileCapabilitiesAreReadonly = Assert<
  IsExactlyReadonlyCapabilityArray<ControlPlaneFileContextProviderConfig["capabilities"]>
>
type _CliArgsAreReadonly = Assert<
  IsExactlyReadonlyStringArray<ControlPlaneCliContextProviderConfig["args"]>
>
type _CliCapabilitiesAreReadonly = Assert<
  IsExactlyReadonlyCapabilityArray<ControlPlaneCliContextProviderConfig["capabilities"]>
>
type _McpArgsAreReadonly = Assert<
  IsExactlyReadonlyStringArray<ControlPlaneMcpContextProviderConfig["args"]>
>
type _McpCapabilitiesAreReadonly = Assert<
  IsExactlyReadonlyCapabilityArray<ControlPlaneMcpContextProviderConfig["capabilities"]>
>

const readonlyContextProviders = {
  memoryBank: {
    kind: "file",
    enabled: true,
    root: ".memorybank",
    capabilities: ["recall", "search", "status"] as const,
  },
  repomix: {
    kind: "cli",
    enabled: true,
    command: "repomix",
    args: ["--stdout", "--json"] as const,
    capabilities: ["pack", "status"] as const,
  },
} satisfies NonNullable<ControlPlaneConfig["contextProviders"]>

const configWithReadonlyProviders: ControlPlaneConfig = {
  workflow: { kind: "superpowers" },
  settings: {
    enabled: true,
    activePreset: "default",
    laneSelection: { mode: "suggest" },
    subagentExecution: { mode: "suggest" },
    commandPrefix: "oms",
    commands: {
      status: { name: "status", aliases: ["st"] },
      use: { name: "use", aliases: ["u"] },
      disable: { name: "off", aliases: ["o"] },
      sync: { name: "sync", aliases: ["sy"] },
      doctor: { name: "doctor", aliases: ["dr"] },
    },
    superpowersCompatibility: { mode: "warn" },
  },
  sourcePresets: {},
  contextProviders: readonlyContextProviders,
  profiles: {},
  lanes: {},
  presets: {
    default: {
      label: "Default",
      short: "def",
      profiles: {
        build: { model: "openai/gpt-5" },
      },
      routes: {},
      defaultRoute: "build",
    },
  },
}

const resolvedCliProvider = {
  id: "repomix",
  kind: "cli",
  command: "repomix",
  args: ["--stdout", "--json"] as const,
  capabilities: ["pack", "status"] as const,
  available: true,
  baseDir: "/workspace/project",
} satisfies ResolvedContextProvider

const runInputFromResolvedProvider = {
  providerId: resolvedCliProvider.id,
  command: resolvedCliProvider.command,
  args: resolvedCliProvider.args,
  baseDir: resolvedCliProvider.baseDir,
} satisfies RunCliContextProviderInput

void readonlyContextProviders
void configWithReadonlyProviders
void resolvedCliProvider
void runInputFromResolvedProvider
