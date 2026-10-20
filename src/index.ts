#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.js'

const { server, client } = createServer()
const transport = new StdioServerTransport()

let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  process.stderr.write(`[minecraft-client-mcp] ${signal}; shutting down\n`)
  try { await client.close() } catch { /* best effort */ }
  try { await server.close() } catch { /* best effort */ }
  process.exit(0)
}

process.on('SIGINT', () => { void shutdown('SIGINT') })
process.on('SIGTERM', () => { void shutdown('SIGTERM') })

server.connect(transport).then(() => {
  process.stderr.write('[minecraft-client-mcp] MCP server running over stdio\n')
}).catch((error: unknown) => {
  process.stderr.write(`[minecraft-client-mcp] fatal: ${error instanceof Error ? error.stack : String(error)}\n`)
  process.exit(1)
})
