import type { Plugin } from "@opencode-ai/plugin"
import { loadRouterConfig } from "./config.js"

export const OhMySuperpowersPlugin: Plugin = async ({ client, directory }) => {
  try {
    await loadRouterConfig({ cwd: directory })
    await client.app.log({
      body: {
        service: "oh-my-superagents",
        level: "info",
        message: "router config loaded",
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const level = message.includes("Could not find oh-my-superagents.config.jsonc") ? "warn" : "error"
    await client.app.log({
      body: {
        service: "oh-my-superagents",
        level,
        message:
          level === "warn"
            ? `Missing config. Run: oh-my-superagents sync --host opencode. ${message}`
            : `Invalid config. ${message}`,
      },
    })
  }

  return {}
}

export default OhMySuperpowersPlugin
