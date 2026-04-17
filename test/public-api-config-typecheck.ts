import type { ControlPlaneConfig } from "../src/index.js"

const additiveConfig: ControlPlaneConfig = {
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

void additiveConfig
