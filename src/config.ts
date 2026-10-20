import path from 'node:path'
import os from 'node:os'

function integer(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]
  if (raw === undefined) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`)
  }
  return parsed
}

export const config = {
  allowRawPackets: process.env.MINECRAFT_ALLOW_RAW_PACKETS === 'true',
  authCacheDirectory: path.resolve(process.env.MINECRAFT_AUTH_CACHE ?? '.minecraft-auth'),
  connectTimeoutMs: integer('MINECRAFT_CONNECT_TIMEOUT_MS', 60_000, 1_000, 300_000),
  eventBufferSize: integer('MINECRAFT_EVENT_BUFFER_SIZE', 500, 50, 10_000),
  maxSnapshotBlocks: integer('MINECRAFT_MAX_SNAPSHOT_BLOCKS', 5_000, 100, 50_000),
  maxSnapshotEntities: integer('MINECRAFT_MAX_SNAPSHOT_ENTITIES', 256, 10, 2_000),
  dashboardEnabled: process.env.MINECRAFT_DASHBOARD_ENABLED !== 'false',
  dashboardHost: process.env.MINECRAFT_DASHBOARD_HOST ?? '127.0.0.1',
  dashboardPort: integer('MINECRAFT_DASHBOARD_PORT', 3210, 0, 65_535),
  dashboardOpen: process.env.MINECRAFT_DASHBOARD_OPEN === 'true',
  dashboardDataDirectory: path.resolve(process.env.MINECRAFT_DASHBOARD_DATA_DIR ?? path.join(os.homedir(), '.minecraft-client-mcp'))
} as const
