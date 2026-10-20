import { describe, expect, it } from 'vitest'
import { inspectVersion, versionCapabilities } from './version-support.js'

describe('Minecraft version support', () => {
  it('supports Minecraft 26.1 through the installed Mineflayer stack', () => {
    expect(inspectVersion('26.1')).toMatchObject({
      supported: true,
      testedByMineflayer: true,
      protocolVersion: 775
    })
  })

  it('does not misrepresent partial 26.2 registry data as client support', () => {
    expect(inspectVersion('26.2')).toMatchObject({
      supported: false,
      protocolKnown: true,
      gameDataAvailable: false,
      protocolVersion: 776
    })
  })

  it('publishes capabilities for agents before connecting', () => {
    expect(versionCapabilities().requestedVersions.map((entry) => entry.requestedVersion))
      .toEqual(['26.1', '26.1.1', '26.1.2', '26.2'])
  })
})
