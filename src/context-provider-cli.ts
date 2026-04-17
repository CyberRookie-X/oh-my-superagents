import { spawn as spawnChildProcess } from "node:child_process"

export type CliContextProviderResult = {
  exitCode: number
  stdout: string
  stderr: string
}

export type CliContextProviderSpawn = (input: {
  providerId: string
  command: string
  args?: readonly string[]
  cwd: string
}) => Promise<CliContextProviderResult>

export type RunCliContextProviderInput = {
  providerId: string
  command: string
  args?: readonly string[]
  cwd?: string
  baseDir?: string
  spawn?: CliContextProviderSpawn
}

export async function runCliContextProvider(input: RunCliContextProviderInput): Promise<CliContextProviderResult> {
  const cwd = input.cwd ?? input.baseDir
  if (!cwd) {
    throw new Error("runCliContextProvider requires cwd or baseDir")
  }

  const spawn = input.spawn ?? defaultSpawnCliContextProvider
  return spawn({
    providerId: input.providerId,
    command: input.command,
    args: input.args,
    cwd,
  })
}

async function defaultSpawnCliContextProvider(input: {
  providerId: string
  command: string
  args?: readonly string[]
  cwd: string
}): Promise<CliContextProviderResult> {
  return new Promise((resolve, reject) => {
    const child = spawnChildProcess(input.command, input.args ? [...input.args] : [], {
      cwd: input.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString()
    })

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString()
    })

    child.on("error", reject)
    child.on("close", (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
      })
    })
  })
}
