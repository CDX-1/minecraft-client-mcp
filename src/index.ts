#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.js'
import { config } from './config.js'

const { server, client, dashboard } = createServer()
const transport = new StdioServerTransport()

let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  process.stderr.write(`[minecraft-client-mcp] ${signal}; shutting down\n`)
  try { await client.close() } catch { /* best effort */ }
  try { await dashboard.stop() } catch { /* best effort */ }
  try { await server.close() } catch { /* best effort */ }
  process.exit(0)
}

process.on('SIGINT', () => { void shutdown('SIGINT') })
process.on('SIGTERM', () => { void shutdown('SIGTERM') })
process.stdin.on('end', () => { void shutdown('stdin closed') })

async function main() {
  if (config.dashboardEnabled) {
    const url = await dashboard.start()
    process.stderr.write(`[minecraft-client-mcp] Dashboard: ${url}\n`)
    if (config.dashboardOpen) dashboard.open()
  }
  await server.connect(transport)
  process.stderr.write('[minecraft-client-mcp] MCP server running over stdio\n')
}

main().catch((error: unknown) => {
  process.stderr.write(`[minecraft-client-mcp] fatal: ${error instanceof Error ? error.stack : String(error)}\n`)
  process.exit(1)
})
