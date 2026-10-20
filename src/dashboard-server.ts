import { createServer, type Server, type ServerResponse } from 'node:http'
import { createReadStream, existsSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { ActivityStore } from './activity-store.js'
import { dashboardCss, dashboardHtml, dashboardJs } from './dashboard-ui.js'

export interface DashboardOptions {
  host: string
  port: number
  capturesDirectory: string
  getMinecraftStatus: () => unknown
}

export class DashboardServer {
  private server: Server | null = null
  private actualPort: number | null = null
  private readonly streams = new Set<ServerResponse>()
  private unsubscribe: (() => void) | null = null
  private heartbeat: NodeJS.Timeout | null = null

  constructor(private readonly store: ActivityStore, private readonly options: DashboardOptions) {}

  get url() {
    return this.actualPort === null ? null : `http://${displayHost(this.options.host)}:${this.actualPort}`
  }

  async start() {
    if (this.server && this.url) return this.url
    let port = this.options.port
    for (let attempt = 0; attempt < 11; attempt++) {
      const server = createServer((request, response) => this.handle(request.url ?? '/', response))
      try {
        await listen(server, this.options.host, port)
        this.server = server
        const address = server.address()
        this.actualPort = typeof address === 'object' && address ? address.port : port
        break
      } catch (error) {
        server.close()
        if (!isAddressInUse(error) || port === 0 || attempt === 10) throw error
        port++
      }
    }
    this.unsubscribe = this.store.subscribe((entry) => this.broadcast(entry))
    this.heartbeat = setInterval(() => {
      for (const response of this.streams) response.write(': heartbeat\n\n')
    }, 15_000)
    return this.url as string
  }

  open() {
    if (!this.url) throw new Error('Dashboard has not started')
    const command = process.platform === 'win32' ? 'cmd.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open'
    const args = process.platform === 'win32' ? ['/c', 'start', '', this.url] : [this.url]
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true })
    child.unref()
    return this.url
  }

  async stop() {
    this.unsubscribe?.()
    this.unsubscribe = null
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = null
    for (const response of this.streams) response.end()
    this.streams.clear()
    const server = this.server
    this.server = null
    this.actualPort = null
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  private handle(rawUrl: string, response: ServerResponse) {
    const url = new URL(rawUrl, 'http://localhost')
    this.securityHeaders(response)
    if (url.pathname === '/') return send(response, 200, 'text/html; charset=utf-8', dashboardHtml)
    if (url.pathname === '/dashboard.css') return send(response, 200, 'text/css; charset=utf-8', dashboardCss)
    if (url.pathname === '/dashboard.js') return send(response, 200, 'text/javascript; charset=utf-8', dashboardJs)
    if (url.pathname === '/api/state') {
      return send(response, 200, 'application/json; charset=utf-8', JSON.stringify({
        now: new Date().toISOString(),
        minecraft: this.options.getMinecraftStatus(),
        dashboardUrl: this.url,
        ...this.store.snapshot()
      }))
    }
    if (url.pathname === '/api/stream') {
      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive'
      })
      response.write('data: {"type":"ready"}\n\n')
      this.streams.add(response)
      response.on('close', () => this.streams.delete(response))
      return
    }
    if (url.pathname.startsWith('/captures/')) {
      const filename = path.basename(decodeURIComponent(url.pathname.slice('/captures/'.length)))
      const target = path.join(this.options.capturesDirectory, filename)
      if (!filename.endsWith('.png') || !existsSync(target)) return send(response, 404, 'text/plain; charset=utf-8', 'Not found')
      response.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=31536000, immutable' })
      createReadStream(target).pipe(response)
      return
    }
    send(response, 404, 'text/plain; charset=utf-8', 'Not found')
  }

  private broadcast(entry: unknown) {
    const payload = `data: ${JSON.stringify(entry)}\n\n`
    for (const response of this.streams) response.write(payload)
  }

  private securityHeaders(response: ServerResponse) {
    response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'")
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Referrer-Policy', 'no-referrer')
  }
}

function send(response: ServerResponse, status: number, contentType: string, body: string) {
  response.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' })
  response.end(body)
}

function listen(server: Server, host: string, port: number) {
  return new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error)
    server.once('error', onError)
    server.listen(port, host, () => {
      server.removeListener('error', onError)
      resolve()
    })
  })
}

function isAddressInUse(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EADDRINUSE'
}

function displayHost(host: string) {
  return host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host
}
