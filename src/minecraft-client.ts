import { createBot, type Bot, type BotOptions, type ControlState, type EquipmentDestination } from 'mineflayer'
import pathfinderModule from 'mineflayer-pathfinder'
import type { Block } from 'prismarine-block'
import type { Entity } from 'prismarine-entity'
import { Vec3 } from 'vec3'
import { ActionQueue } from './action-queue.js'
import { config } from './config.js'
import { EventBuffer, type MinecraftEventType } from './events.js'
import { block as serializeBlock, botStatus, entity as serializeEntity, item, position } from './serializers.js'
import { inspectVersion } from './version-support.js'

const { goals, Movements, pathfinder } = pathfinderModule

export interface ConnectOptions {
  host: string
  port: number
  username: string
  auth: 'offline' | 'microsoft'
  version?: string
  viewDistance?: 'tiny' | 'short' | 'normal' | 'far'
  profilesFolder?: string | false
}

export interface EntitySelector {
  id?: number
  uuid?: string
  username?: string
  name?: string
  type?: string
  maxDistance?: number
}

export class MinecraftClient {
  private botInstance: Bot | null = null
  private connectionState: 'disconnected' | 'connecting' | 'connected' = 'disconnected'
  private lastDisconnectReason: string | null = null
  private pendingMsaCode: unknown = null
  private readonly queue = new ActionQueue()
  readonly events = new EventBuffer(config.eventBufferSize)

  get bot(): Bot {
    if (!this.botInstance || this.connectionState !== 'connected') {
      throw new Error('Minecraft client is not connected. Call minecraft_connect first.')
    }
    return this.botInstance
  }

  status() {
    if (!this.botInstance || this.connectionState !== 'connected') {
      return {
        connected: false,
        state: this.connectionState,
        lastDisconnectReason: this.lastDisconnectReason,
        microsoftDeviceCode: this.pendingMsaCode,
        latestEventSequence: this.events.latestSequence()
      }
    }
    return {
      ...botStatus(this.botInstance),
      state: this.connectionState,
      lastDisconnectReason: this.lastDisconnectReason,
      microsoftDeviceCode: this.pendingMsaCode,
      latestEventSequence: this.events.latestSequence()
    }
  }

  async connect(input: ConnectOptions) {
    if (this.connectionState !== 'disconnected') throw new Error(`Client is already ${this.connectionState}`)
    if (input.version) {
      const support = inspectVersion(input.version)
      if (!support.supported) {
        throw new Error(`Minecraft ${input.version} is not supported by the installed Mineflayer stack: ${support.reason}`)
      }
    }
    this.connectionState = 'connecting'
    this.lastDisconnectReason = null
    this.pendingMsaCode = null

    const options: BotOptions = {
      host: input.host,
      port: input.port,
      username: input.username,
      auth: input.auth,
      viewDistance: input.viewDistance ?? 'short',
      hideErrors: true,
      logErrors: false,
      disableChatSigning: false,
      profilesFolder: input.auth === 'microsoft'
        ? (input.profilesFolder ?? config.authCacheDirectory)
        : false,
      onMsaCode: (data) => {
        this.pendingMsaCode = data
        this.events.push('msa_code', data)
        process.stderr.write(`[minecraft-client-mcp] Microsoft authentication required: ${JSON.stringify(data)}\n`)
      }
    }
    if (input.version) options.version = input.version

    const bot = createBot(options)
    this.botInstance = bot
    installResourcePackUuidFix(bot)
    bot.loadPlugin(pathfinder)
    this.attachListeners(bot)

    const spawned = this.waitForSpawn(bot, config.connectTimeoutMs)
    const finishConnection = async () => {
      await spawned
      const movements = new Movements(bot)
      bot.pathfinder.setMovements(movements)
      this.connectionState = 'connected'
      this.pendingMsaCode = null
      return this.status()
    }
    const failConnection = (error: unknown) => {
      const reason = errorMessage(error)
      this.connectionState = 'disconnected'
      this.lastDisconnectReason = reason
      if (this.botInstance === bot) this.botInstance = null
      try { bot.quit('Connection failed') } catch { /* already closed */ }
      return new Error(`Failed to connect: ${reason}`)
    }

    if (input.auth === 'microsoft') {
      const afterSequence = this.events.latestSequence()
      const background = finishConnection()
      const first = await Promise.race([
        background.then((status) => ({ kind: 'spawned' as const, status })),
        this.events.wait(afterSequence, ['msa_code'], 5_000, 1).then((events) => ({ kind: 'auth' as const, events }))
      ]).catch((error) => { throw failConnection(error) })
      if (first.kind === 'spawned') return first.status
      if (first.events.length > 0) {
        void background.catch((error) => {
          failConnection(error)
          this.events.push('error', { message: `Background connection failed: ${errorMessage(error)}` })
        })
        return this.status()
      }
      return background.catch((error) => { throw failConnection(error) })
    }

    return finishConnection().catch((error) => { throw failConnection(error) })
  }

  async disconnect(reason = 'Disconnected by MCP client') {
    const bot = this.botInstance
    if (!bot) return { disconnected: true, alreadyDisconnected: true }
    this.connectionState = 'disconnected'
    this.lastDisconnectReason = reason
    this.botInstance = null
    bot.pathfinder?.setGoal(null)
    bot.clearControlStates()
    bot.quit(reason)
    return { disconnected: true, reason }
  }

  runAction<T>(action: (bot: Bot) => Promise<T>): Promise<T> {
    return this.queue.run(() => action(this.bot))
  }

  findEntity(selector: EntitySelector): Entity {
    const bot = this.bot
    const origin = bot.entity.position
    const maxDistance = selector.maxDistance ?? 64
    const candidates = Object.values(bot.entities)
      .filter((candidate) => candidate !== bot.entity && candidate.isValid)
      .filter((candidate) => candidate.position.distanceTo(origin) <= maxDistance)
      .filter((candidate) => selector.id === undefined || candidate.id === selector.id)
      .filter((candidate) => selector.uuid === undefined || candidate.uuid === selector.uuid)
      .filter((candidate) => selector.username === undefined || candidate.username === selector.username)
      .filter((candidate) => selector.name === undefined || candidate.name === selector.name || candidate.mobType === selector.name)
      .filter((candidate) => selector.type === undefined || candidate.type === selector.type)
      .sort((a, b) => a.position.distanceTo(origin) - b.position.distanceTo(origin))
    const found = candidates[0]
    if (!found) throw new Error(`No matching entity within ${maxDistance} blocks`)
    return found
  }

  getInventory() {
    const bot = this.bot
    const slots = bot.inventory.slots
      .map((entry, slot) => entry ? { ...item(entry), slot } : null)
      .filter((entry) => entry !== null)
    return {
      heldItem: item(bot.heldItem),
      quickBarSlot: bot.quickBarSlot,
      inventoryStart: bot.inventory.inventoryStart,
      inventoryEnd: bot.inventory.inventoryEnd,
      slots,
      window: this.getWindow()
    }
  }

  getWindow() {
    const window = this.bot.currentWindow
    if (!window) return null
    return {
      id: window.id,
      type: window.type,
      title: window.title,
      inventoryStart: window.inventoryStart,
      inventoryEnd: window.inventoryEnd,
      slots: window.slots
        .map((entry, slot) => entry ? { ...item(entry), slot } : null)
        .filter((entry) => entry !== null)
    }
  }

  resolveInventoryItem(slot?: number, name?: string) {
    const bot = this.bot
    const found = slot === undefined
      ? bot.inventory.items().find((entry) => entry.name === name || entry.displayName === name)
      : bot.inventory.slots[slot]
    if (!found) throw new Error(slot === undefined ? `Inventory item not found: ${name}` : `Inventory slot ${slot} is empty`)
    return found
  }

  worldSnapshot(radius: number, verticalRadius: number, includeAir: boolean, blockLimit: number, entityRadius: number, entityLimit: number) {
    const bot = this.bot
    const center = bot.entity.position.floored()
    const palette: string[] = []
    const paletteIndex = new Map<string, number>()
    const blocks: Array<[number, number, number, number, number, number, number]> = []
    let truncated = false

    outer: for (let y = -verticalRadius; y <= verticalRadius; y++) {
      for (let z = -radius; z <= radius; z++) {
        for (let x = -radius; x <= radius; x++) {
          const found = bot.blockAt(center.offset(x, y, z), false)
          if (!found || (!includeAir && found.name === 'air')) continue
          let index = paletteIndex.get(found.name)
          if (index === undefined) {
            index = palette.length
            paletteIndex.set(found.name, index)
            palette.push(found.name)
          }
          blocks.push([x, y, z, index, found.stateId, found.light, found.skyLight])
          if (blocks.length >= blockLimit) {
            truncated = true
            break outer
          }
        }
      }
    }

    const entities = Object.values(bot.entities)
      .filter((candidate) => candidate !== bot.entity && candidate.isValid)
      .map((candidate) => ({ candidate, distance: candidate.position.distanceTo(bot.entity.position) }))
      .filter(({ distance }) => distance <= entityRadius)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, entityLimit)
      .map(({ candidate }) => serializeEntity(candidate, bot.entity.position))

    return {
      format: {
        blockTuple: ['dx', 'dy', 'dz', 'paletteIndex', 'stateId', 'light', 'skyLight'],
        coordinates: 'Block coordinates are offsets from center'
      },
      center: position(center),
      radius,
      verticalRadius,
      palette,
      blocks,
      blocksTruncated: truncated,
      entities,
      entitiesTruncated: entities.length >= entityLimit,
      bot: botStatus(bot)
    }
  }

  findBlocks(names: string[], maxDistance: number, count: number) {
    const bot = this.bot
    const wanted = new Set(names)
    const points = bot.findBlocks({
      matching: (candidate) => wanted.has(candidate.name),
      maxDistance,
      count
    })
    return points.map((point) => serializeBlock(bot.blockAt(point, true)))
  }

  async goto(x: number, y: number, z: number, range: number) {
    const bot = this.bot
    await bot.pathfinder.goto(range === 0 ? new goals.GoalBlock(x, y, z) : new goals.GoalNear(x, y, z, range))
    return { reached: true, position: position(bot.entity.position) }
  }

  follow(selector: EntitySelector, range: number) {
    const bot = this.bot
    const target = this.findEntity(selector)
    bot.pathfinder.setGoal(new goals.GoalFollow(target, range), true)
    return { following: serializeEntity(target, bot.entity.position), range }
  }

  stopMovement() {
    const bot = this.bot
    bot.pathfinder.setGoal(null)
    bot.clearControlStates()
    return { stopped: true, position: position(bot.entity.position) }
  }

  async setControls(states: Partial<Record<ControlState, boolean>>, durationMs: number) {
    const bot = this.bot
    bot.pathfinder.setGoal(null)
    for (const [control, enabled] of Object.entries(states)) {
      bot.setControlState(control as ControlState, enabled ?? false)
    }
    if (durationMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, durationMs))
      bot.clearControlStates()
    }
    return { controls: bot.controlState, position: position(bot.entity.position) }
  }

  async attack(selector: EntitySelector, count: number, intervalMs: number, approachRange?: number) {
    const bot = this.bot
    const target = this.findEntity(selector)
    if (approachRange !== undefined && target.position.distanceTo(bot.entity.position) > approachRange) {
      await bot.pathfinder.goto(new goals.GoalFollow(target, approachRange))
    }
    let attacks = 0
    for (let index = 0; index < count; index++) {
      if (!target.isValid) break
      await bot.lookAt(target.position.offset(0, target.height * 0.75, 0), true)
      bot.attack(target)
      attacks++
      if (index + 1 < count) await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
    return { attacks, target: serializeEntity(target, bot.entity.position), targetStillValid: target.isValid }
  }

  async equip(slot: number | undefined, name: string | undefined, destination: EquipmentDestination) {
    const bot = this.bot
    const selected = this.resolveInventoryItem(slot, name)
    await bot.equip(selected, destination)
    return { equipped: item(selected), destination, heldItem: item(bot.heldItem) }
  }

  async interactBlock(action: 'activate' | 'dig' | 'place' | 'inspect', coordinates: { x: number, y: number, z: number }, face?: { x: number, y: number, z: number }) {
    const bot = this.bot
    const point = new Vec3(coordinates.x, coordinates.y, coordinates.z)
    const target = bot.blockAt(point, true)
    if (!target) throw new Error(`Block is not loaded at ${point}`)
    if (action === 'activate') await bot.activateBlock(target)
    if (action === 'dig') await bot.dig(target)
    if (action === 'place') await bot.placeBlock(target, new Vec3(face?.x ?? 0, face?.y ?? 1, face?.z ?? 0))
    return { action, block: serializeBlock(target), currentBlock: serializeBlock(bot.blockAt(point, true)) }
  }

  async openTarget(kind: 'block' | 'entity', coordinates: { x: number, y: number, z: number } | undefined, selector: EntitySelector | undefined) {
    const bot = this.bot
    if (kind === 'block') {
      if (!coordinates) throw new Error('coordinates are required for a block target')
      const target = bot.blockAt(new Vec3(coordinates.x, coordinates.y, coordinates.z), true)
      if (!target) throw new Error('Block is not loaded')
      await bot.openBlock(target)
    } else {
      if (!selector) throw new Error('selector is required for an entity target')
      await bot.activateEntity(this.findEntity(selector))
    }
    await bot.waitForTicks(1)
    return this.getWindow()
  }

  async interactEntity(action: 'activate' | 'use_on' | 'mount' | 'inspect', selector: EntitySelector) {
    const bot = this.bot
    const target = this.findEntity(selector)
    if (action === 'activate') await bot.activateEntity(target)
    if (action === 'use_on') bot.useOn(target)
    if (action === 'mount') bot.mount(target)
    return { action, entity: serializeEntity(target, bot.entity.position) }
  }

  writeRawPacket(name: string, data: Record<string, unknown>) {
    if (!config.allowRawPackets) {
      throw new Error('Raw packets are disabled. Set MINECRAFT_ALLOW_RAW_PACKETS=true when starting the server to enable them.')
    }
    this.bot._client.write(name, data)
    return { sent: true, name }
  }

  async close() {
    await this.disconnect('MCP server shutting down')
  }

  private waitForSpawn(bot: Bot, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error(`Timed out waiting for spawn after ${timeoutMs}ms`)), timeoutMs)
      const finish = (error?: Error) => {
        clearTimeout(timer)
        bot.removeListener('spawn', onSpawn)
        bot.removeListener('error', onError)
        bot.removeListener('kicked', onKicked)
        bot.removeListener('end', onEnd)
        error ? reject(error) : resolve()
      }
      const onSpawn = () => finish()
      const onError = (error: Error) => finish(error)
      const onKicked = (reason: string) => finish(new Error(`Kicked: ${String(reason)}`))
      const onEnd = (reason: string) => finish(new Error(`Connection ended: ${reason}`))
      bot.once('spawn', onSpawn)
      bot.once('error', onError)
      bot.once('kicked', onKicked)
      bot.once('end', onEnd)
    })
  }

  private attachListeners(bot: Bot) {
    bot.on('login', () => { this.events.push('login', { username: bot.username }) })
    bot.on('spawn', () => { this.events.push('spawn', { position: position(bot.entity.position) }) })
    bot.on('chat', (username, message) => { this.events.push('chat', { username, message }) })
    bot.on('messagestr', (message, messagePosition) => { this.events.push('message', { message, position: messagePosition }) })
    bot.on('death', () => { this.events.push('death', { position: position(bot.entity.position) }) })
    bot.on('health', () => { this.events.push('health', { health: bot.health, food: bot.food, saturation: bot.foodSaturation }) })
    bot.on('entityHurt', (target, source) => { this.events.push('entity_hurt', { target: serializeEntity(target), source: serializeEntity(source) }) })
    bot.on('entityDead', (target) => { this.events.push('entity_dead', serializeEntity(target)) })
    bot.on('playerJoined', (player) => { this.events.push('player_joined', { username: player.username, uuid: player.uuid }) })
    bot.on('playerLeft', (player) => { this.events.push('player_left', { username: player.username, uuid: player.uuid }) })
    bot.on('windowOpen', (window) => { this.events.push('window_open', { id: window.id, type: window.type, title: window.title }) })
    bot.on('windowClose', (window) => { this.events.push('window_close', { id: window.id, type: window.type }) })
    bot.on('resourcePack', (url, hash, uuid) => {
      const pack = normalizeResourcePackEvent(url, hash, uuid)
      const acknowledgedBy = acknowledgeResourcePack(bot)
      this.events.push('resource_pack', {
        ...pack,
        clientState: bot._client.state,
        responses: ['accepted', 'successfully_loaded'],
        acknowledgedBy
      })
    })
    bot.on('kicked', (reason, loggedIn) => { this.events.push('kicked', { reason: String(reason), loggedIn }) })
    bot.on('error', (error) => { this.events.push('error', { message: error.message }) })
    bot.on('end', (reason) => {
      this.events.push('end', { reason })
      if (this.botInstance === bot) {
        this.connectionState = 'disconnected'
        this.lastDisconnectReason = reason
        this.botInstance = null
      }
    })
  }
}

export const eventTypes: MinecraftEventType[] = [
  'chat', 'message', 'login', 'spawn', 'end', 'kicked', 'error', 'death', 'health',
  'entity_hurt', 'entity_dead', 'player_joined', 'player_left', 'window_open', 'window_close', 'msa_code', 'resource_pack'
]

export function acknowledgeResourcePack(bot: Pick<Bot, '_client' | 'acceptResourcePack'>) {
  // Mineflayer 4.39+ acknowledges packs itself while configuration is held open.
  // Calling it again there sends duplicate ACCEPTED/LOADED packets. Requests in
  // login/play state need this MCP listener, including those received pre-spawn.
  if (bot._client.state === 'configuration') return 'mineflayer_configuration_handler' as const
  bot.acceptResourcePack()
  return 'mcp_resource_pack_handler' as const
}

export function installResourcePackUuidFix(bot: Pick<Bot, '_client'>) {
  const client = bot._client
  const originalWrite = client.write.bind(client)

  client.write = ((name: string, params: Record<string, unknown>) => {
    if (name === 'resource_pack_receive' && params?.uuid != null && typeof params.uuid !== 'string') {
      return originalWrite(name, { ...params, uuid: String(params.uuid) })
    }
    return originalWrite(name, params)
  }) as typeof client.write
}

export function normalizeResourcePackEvent(url: unknown, hash?: unknown, uuid?: unknown) {
  if (isUuidObject(hash)) {
    return { url: String(url), hash: null, uuid: String(hash) }
  }
  if (isUuidObject(url) && typeof hash === 'string') {
    return { url: hash, hash: null, uuid: String(url) }
  }
  return {
    url: String(url),
    hash: typeof hash === 'string' ? hash : null,
    uuid: uuid == null ? null : String(uuid)
  }
}

function isUuidObject(value: unknown): value is { toString(): string } {
  return typeof value === 'object' && value !== null && String(value) !== '[object Object]'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
