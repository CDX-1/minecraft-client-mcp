import type { Bot } from 'mineflayer'
import type { Block } from 'prismarine-block'
import type { Entity } from 'prismarine-entity'
import type { Item } from 'prismarine-item'
import type { Vec3 } from 'vec3'

export function position(value: Vec3 | undefined | null) {
  if (!value) return null
  return {
    x: round(value.x),
    y: round(value.y),
    z: round(value.z)
  }
}

export function item(value: Item | undefined | null) {
  if (!value) return null
  return {
    slot: value.slot,
    name: value.name,
    displayName: value.displayName,
    type: value.type,
    count: value.count,
    metadata: value.metadata,
    stackSize: value.stackSize,
    durabilityUsed: value.durabilityUsed,
    nbt: value.nbt ?? null
  }
}

export function block(value: Block | undefined | null) {
  if (!value) return null
  return {
    name: value.name,
    displayName: value.displayName,
    position: position(value.position),
    type: value.type,
    stateId: value.stateId,
    metadata: value.metadata,
    boundingBox: value.boundingBox,
    hardness: value.hardness,
    diggable: value.diggable,
    transparent: value.transparent,
    light: value.light,
    skyLight: value.skyLight,
    properties: safeProperties(value)
  }
}

export function entity(value: Entity, origin?: Vec3) {
  return {
    id: value.id,
    uuid: value.uuid ?? null,
    type: value.type,
    name: value.name ?? null,
    displayName: value.displayName ?? null,
    username: value.username ?? null,
    mobType: value.mobType ?? null,
    kind: value.kind ?? null,
    position: position(value.position),
    velocity: position(value.velocity),
    distance: origin ? round(value.position.distanceTo(origin)) : null,
    yaw: round(value.yaw),
    pitch: round(value.pitch),
    onGround: value.onGround,
    health: value.health ?? null,
    isValid: value.isValid,
    heldItem: item(value.heldItem)
  }
}

export function botStatus(bot: Bot) {
  return {
    connected: true,
    username: bot.username,
    version: bot.version,
    protocolVersion: bot.protocolVersion,
    position: position(bot.entity?.position),
    velocity: position(bot.entity?.velocity),
    yaw: round(bot.entity?.yaw ?? 0),
    pitch: round(bot.entity?.pitch ?? 0),
    onGround: bot.entity?.onGround ?? false,
    health: bot.health,
    food: bot.food,
    saturation: bot.foodSaturation,
    oxygen: bot.oxygenLevel,
    experience: bot.experience,
    gameMode: bot.game?.gameMode ?? null,
    dimension: bot.game?.dimension ?? null,
    difficulty: bot.game?.difficulty ?? null,
    raining: bot.isRaining,
    time: bot.time,
    heldItem: item(bot.heldItem),
    quickBarSlot: bot.quickBarSlot,
    sleeping: bot.isSleeping,
    usingHeldItem: bot.usingHeldItem
  }
}

function safeProperties(value: Block): Record<string, unknown> | null {
  try {
    return value.getProperties() as Record<string, unknown>
  } catch {
    return null
  }
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
