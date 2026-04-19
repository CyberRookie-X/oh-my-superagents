import path from "node:path"
import { getLastKnownGoodPath } from "./config-recovery.js"

const DEFAULT_AUTHORITY_CONFIG_MODE = 0o600

function createUniqueTempPath(filePath: string) {
  return `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
}

async function resolveWritePath(
  filePath: string,
  fs: {
    lstat?: (filePath: string) => Promise<{ isSymbolicLink: () => boolean }>
    readlink?: (filePath: string) => Promise<string>
  },
) {
  if (!fs.lstat || !fs.readlink) {
    return filePath
  }

  try {
    const stats = await fs.lstat(filePath)
    if (!stats.isSymbolicLink()) {
      return filePath
    }

    const linkTarget = await fs.readlink(filePath)
    return path.isAbsolute(linkTarget) ? linkTarget : path.resolve(path.dirname(filePath), linkTarget)
  } catch {
    return filePath
  }
}

export async function writeAuthorityAtomically(
  filePath: string,
  content: string,
  fs: {
    mkdir: (filePath: string, options?: { recursive?: boolean }) => Promise<void>
    chmod?: (filePath: string, mode: number) => Promise<void>
    lstat?: (filePath: string) => Promise<{ isSymbolicLink: () => boolean }>
    readlink?: (filePath: string) => Promise<string>
    stat?: (filePath: string) => Promise<{ mode: number }>
    unlink: (filePath: string) => Promise<void>
    writeFile: (filePath: string, content: string, options?: { mode?: number }) => Promise<void>
    rename: (from: string, to: string) => Promise<void>
  },
) {
  const resolvedPath = await resolveWritePath(filePath, fs)
  const tempPath = createUniqueTempPath(resolvedPath)
  const existingMode = fs.stat
    ? await fs.stat(resolvedPath)
      .then((stats) => stats.mode & 0o777)
      .catch(() => undefined)
    : undefined
  const targetMode = existingMode ?? DEFAULT_AUTHORITY_CONFIG_MODE

  await fs.mkdir(path.dirname(resolvedPath), { recursive: true })
  await fs.writeFile(tempPath, content, { mode: targetMode })
  if (fs.chmod) {
    await fs.chmod(tempPath, targetMode)
  }
  await fs.rename(tempPath, resolvedPath)
}

export async function writeAuthorityWithRecoverySnapshotAtomically(
  filePath: string,
  content: string,
  fs: Parameters<typeof writeAuthorityAtomically>[2],
) {
  await writeAuthorityAtomically(getLastKnownGoodPath(filePath), content, fs)
  await writeAuthorityAtomically(filePath, content, fs)
}
