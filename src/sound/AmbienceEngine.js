// Ambient sound engine derived from Slumbr (slumbr.mikewhyle.com)
// Drives four elemental channels (sky/air, fire, earth, sea/water) with
// A/B pair crossfading, panning LFOs, and a master EQ/limiter chain.
// Designed for expansion: biome, critter, village, battle, and movement
// layers will plug into the same AudioContext and master chain.

const CHANNEL_DEFS = {
  air: {
    files: ['sky1.ogg', 'sky2.ogg', 'sky3.ogg', 'sky4.ogg', 'sky5.ogg', 'sky6.ogg', 'sky7.ogg'],
    pan: 0.4,
    abMap: { 0: 3, 1: 4, 2: 5, 3: 0, 4: 1, 5: 6, 6: 2 },
  },
  fire: {
    files: ['fire1.ogg', 'fire2.ogg', 'fire3.ogg', 'fire4.ogg', 'fire5.ogg', 'fire6.ogg', 'fire7.ogg'],
    pan: -0.5,
    abMap: { 0: 6, 1: 2, 2: 5, 3: 0, 4: 1, 5: 3, 6: 4 },
  },
  earth: {
    files: ['earth1.ogg', 'earth2.ogg', 'earth3.ogg', 'earth4.ogg', 'earth5.ogg', 'earth6.ogg', 'earth7.ogg'],
    pan: -0.3,
    abMap: { 0: 6, 1: 4, 2: 5, 3: 1, 4: 2, 5: 0, 6: 3 },
  },
  water: {
    files: ['sea1.ogg', 'sea2.ogg', 'sea3.ogg', 'sea4.ogg', 'sea5.ogg', 'sea6.ogg', 'sea7.ogg'],
    pan: 0.6,
    abMap: { 0: 3, 1: 4, 2: 6, 3: 0, 4: 1, 5: 2, 6: 5 },
  },
}

const ORDERED = ['air', 'fire', 'earth', 'water']

// Maps critter type names (from Critters.js) to element keys for sound selection
const CRITTER_ELEMENT = {
  salamander: 'fire',
  crab: 'water',
  moth: 'air',
  beetle: 'earth',
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export default class AmbienceEngine {
  constructor() {
    this.ctx = null
    this.initialized = false
    this.channels = {}
    this.masterGain = null
    this.params = null
  }

  // Must be called from a user gesture (click/key).
  // Safe to call multiple times; only initialises once.
  async init() {
    if (this.initialized) return
    if (this._initialising) return this._initialising
    this._initialising = this._doInit()
    await this._initialising
    this._initialising = null
  }

  async _doInit() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)()

    // Browsers block AudioContext until a user gesture. If suspended,
    // hook into the first click/keydown to resume rather than failing silently.
    if (this.ctx.state === 'suspended') {
      const tryResume = async () => {
        try { await this.ctx.resume() } catch { /* noop */ }
      }
      await tryResume()
      if (this.ctx.state === 'suspended') {
        const unlock = async () => {
          await tryResume()
          if (this.ctx.state === 'running') {
            document.removeEventListener('click', unlock)
            document.removeEventListener('keydown', unlock)
            // Now that context is running, start playback if world was already set
            if (this.params && !this._playbackStarted) {
              this._playbackStarted = true
              this.setWorld(this.params)
            }
          }
        }
        document.addEventListener('click', unlock, { once: false })
        document.addEventListener('keydown', unlock, { once: false })
      }
    }

    this._buildMasterChain()
    this._buildChannels()
    this._noiseBuffer = this._createNoiseBuffer(1)       // short: for transient one-shots
    this._longNoiseBuffer = this._createNoiseBuffer(8)  // long: for continuous looped layers
    this._initZones()
    this._initCavernLayer()
    this._initBirdsong()
    this._initCritterLayer()
    this._initVillageLayer()
    this._initVillagerChatter()
    this._initWaterLayer()
    await this._loadCoreSounds()
    this._loadRemainingSounds() // fire-and-forget
    this._loadOneShots()
    this.initialized = true
  }

  async _loadOneShots() {
    this.oneShots = { magic: [], gong: null }
    try {
      this.oneShots.gong = await this._fetchBuffer('teepee.ogg')
      for (let i = 1; i <= 4; i++) {
        const buf = await this._fetchBuffer(`spell${i}.wav`)
        if (buf) this.oneShots.magic.push(buf)
      }
    } catch {}
  }

  // --- Master output chain (EQ + limiter) ---

  _buildMasterChain() {
    const ac = this.ctx
    this.masterGain = ac.createGain()
    this.masterGain.gain.value = Math.pow(0.4, 2.2) // ~40% perceptual

    const low = ac.createBiquadFilter()
    low.type = 'lowshelf'; low.frequency.value = 200; low.gain.value = 0
    const mid = ac.createBiquadFilter()
    mid.type = 'peaking'; mid.frequency.value = 500; mid.Q.value = 0.7; mid.gain.value = 0
    const high = ac.createBiquadFilter()
    high.type = 'highshelf'; high.frequency.value = 2000; high.gain.value = 0

    const limiter = ac.createDynamicsCompressor()
    limiter.threshold.value = -1; limiter.knee.value = 12
    limiter.ratio.value = 12; limiter.attack.value = 0.003; limiter.release.value = 0.08

    this.masterGain.connect(low)
    low.connect(mid); mid.connect(high); high.connect(limiter)
    limiter.connect(ac.destination)
    this.eq = { low, mid, high }

    // Separate gain for procedural layers (critter, village, movement).
    // Bypasses masterGain so transient one-shots aren't crushed by the
    // pad-level attenuation (0.133). Feeds the same limiter for safety.
    this.proceduralGain = ac.createGain()
    this.proceduralGain.gain.value = 0.55

    // Reverb bus: wet/dry split driven by cavern zone weight.
    // Dry path goes straight to limiter; wet path goes through convolver.
    this._reverbDry = ac.createGain()
    this._reverbDry.gain.value = 1.0
    this._reverbWet = ac.createGain()
    this._reverbWet.gain.value = 0.0
    this._convolver = ac.createConvolver()
    // Pre-delay + dampening on the wet signal
    this._reverbPreDelay = ac.createDelay(0.1)
    this._reverbPreDelay.delayTime.value = 0.02
    this._reverbDamp = ac.createBiquadFilter()
    this._reverbDamp.type = 'lowpass'
    this._reverbDamp.frequency.value = 4000
    this._reverbDamp.Q.value = 0.5

    this.proceduralGain.connect(this._reverbDry)
    this.proceduralGain.connect(this._reverbPreDelay)
    this._reverbPreDelay.connect(this._convolver)
    this._convolver.connect(this._reverbDamp)
    this._reverbDamp.connect(this._reverbWet)
    this._reverbDry.connect(limiter)
    this._reverbWet.connect(limiter)

    // Also route ambient pads through the reverb for cave immersion
    this._padReverbSend = ac.createGain()
    this._padReverbSend.gain.value = 0.0
    high.connect(this._padReverbSend)
    this._padReverbSend.connect(this._reverbPreDelay)

    // Generate initial impulse response (short surface room)
    this._setReverbIR(0.4, 3000)
    this._lastIRCavern = 0
  }

  // Procedurally generate a reverb impulse response.
  // duration: seconds (0.2 for tight room, 2.5 for deep cave)
  // damping: Hz cutoff for high-freq decay (lower = darker reverb)
  _setReverbIR(duration, damping) {
    const ac = this.ctx
    const rate = ac.sampleRate
    const length = Math.floor(rate * duration)
    const buffer = ac.createBuffer(2, length, rate)

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch)
      for (let i = 0; i < length; i++) {
        const t = i / rate
        // Exponential decay with early reflection clusters
        const decay = Math.exp(-t * (3.5 / duration))
        // Sparse early reflections (first 60ms)
        const early = t < 0.06 ? (Math.random() > 0.85 ? 1.5 : 0.3) : 1.0
        // Diffuse tail with slight modulation for richness
        const noise = (Math.random() * 2 - 1) * decay * early
        // Simple damping: reduce amplitude of high-freq energy over time
        // by smoothing samples (1-pole lowpass approximation)
        data[i] = noise
      }

      // Apply damping via simple 1-pole lowpass in-place
      const coeff = Math.exp(-2 * Math.PI * damping / rate)
      let prev = 0
      for (let i = 0; i < length; i++) {
        prev = data[i] = data[i] * (1 - coeff) + prev * coeff
      }
    }

    this._convolver.buffer = buffer
  }

  // Called from updateZones lerp; morphs reverb character with depth.
  // Regenerates IR only when cavern weight crosses thresholds (expensive).
  _updateReverb() {
    if (!this._convolver) return
    const now = this.ctx.currentTime
    const cavern = this.zones.cavern
    const depth = this.zones.depth

    // Wet/dry mix: more cave = more reverb
    const wetLevel = Math.min(0.7, cavern * 0.85)
    this._reverbWet.gain.setTargetAtTime(wetLevel, now, 0.4)
    this._reverbDry.gain.setTargetAtTime(1.0 - wetLevel * 0.3, now, 0.4)

    // Also send ambient pads through reverb when in caves
    this._padReverbSend.gain.setTargetAtTime(cavern * 0.4, now, 0.5)

    // Regenerate IR when cavern zone changes significantly (costly, so threshold)
    const cavernBucket = Math.floor(cavern * 4) // 5 tiers: 0, 0.25, 0.5, 0.75, 1.0
    if (cavernBucket !== this._lastIRCavern) {
      this._lastIRCavern = cavernBucket
      // Deeper = longer tail, darker
      const duration = 0.4 + cavern * 2.0  // 0.4s surface → 2.4s deep cave
      const damping = 3000 - cavern * 2000  // 3kHz surface → 1kHz deep
      this._setReverbIR(duration, damping)
    }

    // Tighten pre-delay and damping with depth for tube-like resonance
    this._reverbPreDelay.delayTime.setTargetAtTime(
      0.02 + depth * 0.04, now, 0.3 // 20ms surface → 60ms deep
    )
    this._reverbDamp.frequency.setTargetAtTime(
      4000 - depth * 2500, now, 0.5 // 4kHz surface → 1.5kHz deep
    )
  }

  // --- Per-element channels ---

  _buildChannels() {
    const ac = this.ctx

    for (const name of ORDERED) {
      const def = CHANNEL_DEFS[name]

      // Gain node (volume for this element)
      const gain = ac.createGain()
      gain.gain.value = 0 // silent until setWorld
      gain.connect(this.masterGain)

      // Stereo panner with slow LFO for spatial width
      const panner = ac.createStereoPanner()
      panner.pan.value = def.pan

      const panLFO = ac.createOscillator()
      panLFO.type = 'sine'
      panLFO.frequency.value = 1 / (12 + Math.random() * 18)
      const panDepth = ac.createGain()
      panDepth.gain.value = 0.15
      panLFO.connect(panDepth)
      panDepth.connect(panner.pan)
      panLFO.start()

      panner.connect(gain)

      this.channels[name] = {
        def, gain, panner, panLFO, panDepth,
        buffers: new Array(def.files.length).fill(null),
        pair: null,
        baseVolume: 0,
        abPhase: Math.random() * Math.PI * 2,
        abFreq: 1 / (180 + Math.random() * 120),
        abDepth: 0.25,
        abTimer: null,
      }
    }
  }

  // --- Sound loading ---

  _soundPath() {
    const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/'
    return `${base}sounds/`
  }

  async _fetchBuffer(filename) {
    const resp = await fetch(this._soundPath() + filename)
    const ab = await resp.arrayBuffer()
    const buf = await this.ctx.decodeAudioData(ab)
    return { buffer: buf, pregain: this._rmsPreGain(buf) }
  }

  _rmsPreGain(buffer) {
    const target = 0.16
    const data = buffer.getChannelData(0)
    let sum = 0
    const step = 100
    for (let i = 0; i < data.length; i += step) sum += data[i] * data[i]
    const rms = Math.sqrt(sum / Math.ceil(data.length / step))
    return rms > 0.001 ? target / rms : 1
  }

  _createSilent() {
    const buf = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * 0.02), this.ctx.sampleRate)
    return { buffer: buf, pregain: 1 }
  }

  async _loadCoreSounds() {
    // Load first 2 sounds per channel (enough to start playback)
    for (const name of ORDERED) {
      const ch = this.channels[name]
      for (let i = 0; i < Math.min(2, ch.def.files.length); i++) {
        try {
          ch.buffers[i] = await this._fetchBuffer(ch.def.files[i])
        } catch {
          ch.buffers[i] = this._createSilent()
        }
      }
    }
  }

  async _loadRemainingSounds() {
    for (const name of ORDERED) {
      const ch = this.channels[name]
      for (let i = 2; i < ch.def.files.length; i++) {
        try {
          ch.buffers[i] = await this._fetchBuffer(ch.def.files[i])
        } catch {
          ch.buffers[i] = this._createSilent()
        }
        await new Promise(r => setTimeout(r, 50))
      }
    }
  }

  // --- A/B pair playback (from Slumbr) ---

  _switchSound(channelName, index) {
    const ch = this.channels[channelName]
    if (!ch || !ch.buffers[index]?.buffer) return

    const metaA = ch.buffers[index]
    const bIdx = ch.def.abMap[index] ?? ((index + 1) % ch.def.files.length)
    const metaB = ch.buffers[bIdx] || metaA

    const ac = this.ctx
    const now = ac.currentTime

    const srcA = ac.createBufferSource(); srcA.buffer = metaA.buffer; srcA.loop = true
    // Subtle pitch variance per-source (±1.5%); shared direction so A/B don't phase
    const rateShift = 1 + (Math.random() - 0.5) * 0.03
    srcA.playbackRate.value = rateShift
    const preA = ac.createGain(); preA.gain.value = metaA.pregain
    const crossA = ac.createGain(); crossA.gain.value = 1

    const srcB = ac.createBufferSource(); srcB.buffer = metaB.buffer; srcB.loop = true
    srcB.playbackRate.value = rateShift // same rate to avoid phasing
    const preB = ac.createGain(); preB.gain.value = metaB.pregain
    const crossB = ac.createGain(); crossB.gain.value = 0

    srcA.connect(preA).connect(crossA).connect(ch.panner)
    srcB.connect(preB).connect(crossB).connect(ch.panner)
    srcA.start(now); srcB.start(now)

    // Fade out previous pair
    if (ch.pair) {
      try {
        ch.pair.crossA.gain.linearRampToValueAtTime(0, now + 0.8)
        ch.pair.crossB.gain.linearRampToValueAtTime(0, now + 0.8)
        ch.pair.srcA.stop(now + 0.85)
        ch.pair.srcB.stop(now + 0.85)
      } catch { /* already stopped */ }
    }

    ch.pair = { srcA, srcB, crossA, crossB }
    this._startABModulation(channelName)
  }

  _startABModulation(channelName) {
    const ch = this.channels[channelName]
    if (!ch?.pair) return
    if (ch.abTimer) clearInterval(ch.abTimer)

    ch.abTimer = setInterval(() => {
      if (!ch.pair) return
      const now = this.ctx.currentTime
      ch.abPhase += 2 * Math.PI * ch.abFreq * 0.5

      // Wider crossfade sweep so A/B blend is clearly audible
      const base = 0.5
      const amp = ch.abDepth * 0.45
      const x = Math.max(0, Math.min(1, base + amp * Math.sin(ch.abPhase)))
      const gB = Math.sin(x * Math.PI / 2)
      const gA = Math.cos(x * Math.PI / 2)

      ch.pair.crossA.gain.setTargetAtTime(gA, now, 0.25)
      ch.pair.crossB.gain.setTargetAtTime(gB, now, 0.25)
    }, 500)
  }


  // ============================================================
  //  PUBLIC API
  // ============================================================

  playMagic() {
    if (!this.initialized || !this.oneShots?.magic?.length) return
    const ac = this.ctx
    const buf = this.oneShots.magic[Math.floor(Math.random() * this.oneShots.magic.length)]
    if (!buf || !buf.buffer) return

    const src = ac.createBufferSource()
    src.buffer = buf.buffer
    // Procedural pitch variance
    src.playbackRate.value = 0.8 + Math.random() * 0.4
    
    // Connect to procedural gain which handles wet/dry reverb procedurally based on zones
    const gain = ac.createGain()
    // Reduced from 1.5
    gain.gain.value = buf.pregain * 0.35
    src.connect(gain).connect(this.proceduralGain)
    src.start()
  }

  playGong() {
    if (!this.initialized || !this.oneShots?.gong?.buffer) return
    const ac = this.ctx
    const src = ac.createBufferSource()
    src.buffer = this.oneShots.gong.buffer
    src.playbackRate.value = 0.9 + Math.random() * 0.2
    
    const gain = ac.createGain()
    // Reduced from 2.0
    gain.gain.value = this.oneShots.gong.pregain * 0.4
    src.connect(gain).connect(this.proceduralGain)
    src.start()
  }

  // Call once when the world is created. Picks sounds and sets volumes
  // based on element pair, ratio, and seed.
  setWorld(params) {
    this.params = params
    if (!this.initialized || this.ctx?.state !== 'running') return
    this._playbackStarted = true

    const el1 = params.element1
    const el2 = params.element2
    const ratio = ((params.elementRatio ?? 5) / 10)
    const rng = mulberry32((params.seed || 12345) + 33333)

    for (const name of ORDERED) {
      const ch = this.channels[name]
      const loaded = ch.buffers.filter(b => b?.buffer).length
      if (loaded === 0) continue

      // Seed-consistent sound variant per channel
      const idx = Math.floor(rng() * loaded)
      this._switchSound(name, idx)

      // Volume: dominant element loudest, secondary medium, others quiet
      let vol = 0.08
      if (name === el1) vol = 0.25 + ratio * 0.25
      else if (name === el2) vol = 0.25 + (1 - ratio) * 0.25
      ch.baseVolume = vol
      ch.gain.gain.setTargetAtTime(vol * vol, this.ctx.currentTime, 0.8)
    }

    // Initialise periodic pad switching
    this._lastPadSwitch = this.ctx.currentTime
    this._nextPadSwitchInterval = 60 + Math.random() * 60

    // Generate per-world bird species, critter voicings, and villager babble
    const seed = params.seed || 12345
    this._generateBirdSpecies(seed, el1, el2)
    this._generateCritterVoices(seed, el1, el2)
    this._generateVillagerVoice(seed, el1, el2)
  }

  // t: 0..1 where 0 = midnight, 0.5 = noon
  // Modulates pad volumes from three sources: base element mix,
  // time-of-day cycle, and spatial zone weights.
  setTimeOfDay(t) {
    if (!this.initialized) return
    const now = this.ctx.currentTime
    const day = Math.sin(t * Math.PI)
    const night = 1 - day

    // Zone modifiers: each element channel responds to relevant zones
    const z = this.zones || { canopy: 0, cavern: 0, water: 0, openAir: 0, depth: 0 }
    const zoneMod = {
      air:   0.15 * z.openAir + 0.1 * z.canopy - 0.15 * z.cavern,
      fire:  0.12 * day - 0.08 * z.water + 0.05 * z.cavern,
      earth: 0.2 * z.cavern + 0.1 * z.depth - 0.1 * z.openAir,
      water: 0.2 * z.water + 0.08 * night - 0.1 * z.cavern,
    }

    for (const name of ORDERED) {
      const ch = this.channels[name]
      // Time-of-day base modulation
      const timeMod = (name === 'fire' || name === 'air') ? day * 0.08 : night * 0.08
      // Combined volume: base + time + zone, clamped
      const v = Math.max(0.02, Math.min(0.6, ch.baseVolume + timeMod + (zoneMod[name] || 0)))
      ch.gain.gain.setTargetAtTime(v * v, now, 0.8)
    }

    // Periodic sound switching: rotate to new variants every 60-120s
    // so the pad bed doesn't stagnate on the same loops
    if (!this._lastPadSwitch) this._lastPadSwitch = now
    if (now - this._lastPadSwitch > this._nextPadSwitchInterval) {
      this._lastPadSwitch = now
      this._nextPadSwitchInterval = 60 + Math.random() * 60

      // Pick one random channel to switch
      const name = ORDERED[Math.floor(Math.random() * ORDERED.length)]
      const ch = this.channels[name]
      const loaded = ch.buffers.filter(b => b?.buffer).length
      if (loaded > 1) {
        const newIdx = Math.floor(Math.random() * loaded)
        this._switchSound(name, newIdx)
      }
    }
  }

  // d: 0 = surface, 1 = deepest underground
  // Underground amplifies earth, muffles air; zone-driven EQ shift
  setDepth(d) {
    if (!this.initialized || !this.eq) return
    const now = this.ctx.currentTime
    const cavern = this.zones?.cavern || 0
    // Shift EQ: deeper = darker, more bass; cave enclosure tightens further
    this.eq.low.gain.setTargetAtTime(d * 4 + cavern * 2, now, 0.5)
    this.eq.high.gain.setTargetAtTime(-d * 6 - cavern * 3, now, 0.5)
    // Mid scoop in caves for that hollow resonance
    this.eq.mid.gain.setTargetAtTime(-cavern * 3, now, 0.8)
  }

  setMasterVolume(v) {
    if (!this.masterGain) return
    this.masterGain.gain.setTargetAtTime(Math.pow(v, 2.2), this.ctx.currentTime, 0.15)
  }

  // ============================================================
  //  ZONE DETECTION
  //  Scans tiles around the god to derive spatial zone weights (0-1).
  //  Throttled to avoid per-frame grid scans; weights smooth-lerp
  //  toward targets for organic crossfading.
  // ============================================================

  _initZones() {
    this.zones = {
      canopy: 0,     // near trees / forest
      cavern: 0,     // underground enclosed space
      water: 0,      // near or in liquid
      openAir: 0,    // surface, sky above
      village: 0,    // near settlement (already handled, unified here)
      depth: 0,      // 0 = surface, 1 = deepest
    }
    this._zoneTargets = { ...this.zones }
    this._lastZoneScan = 0
  }

  // Called every frame from WorldScene. Throttles the expensive grid
  // scan to ~4Hz, then lerps current weights toward targets each frame.
  updateZones(worldGrid, godTileX, godTileY) {
    if (!this.initialized) return
    const now = performance.now()

    // Full scan every 250ms
    if (now - this._lastZoneScan > 250) {
      this._lastZoneScan = now
      this._scanZones(worldGrid, godTileX, godTileY)
    }

    // Smooth lerp toward targets (~6dB/s transition)
    const lerpRate = 0.08
    for (const key of Object.keys(this.zones)) {
      this.zones[key] += (this._zoneTargets[key] - this.zones[key]) * lerpRate
    }

    // Drive reverb, cavern, and water ambience from zone weights
    this._updateReverb()
    this._updateCavernLayer()
    this._updateWaterLayer()
  }

  _scanZones(worldGrid, gx, gy) {
    const { grid, width, height, surfaceHeights } = worldGrid
    if (!grid || !surfaceHeights) return

    const R = 15 // scan radius in tiles
    let treeTiles = 0
    let liquidTiles = 0
    let airTiles = 0
    let solidTiles = 0
    let totalScanned = 0

    for (let dy = -R; dy <= R; dy++) {
      const y = gy + dy
      if (y < 0 || y >= height) continue
      for (let dx = -R; dx <= R; dx++) {
        // Circular scan, not square
        if (dx * dx + dy * dy > R * R) continue
        const x = ((gx + dx) % width + width) % width
        const tile = grid[y * width + x]
        totalScanned++

        if (tile === 16 || tile === 17 || tile === 18 || tile === 19) {
          treeTiles++ // TREE_TRUNK, TREE_LEAVES, BUSH, TALL_GRASS
        } else if (tile === 5 || tile === 6 || tile === 13) {
          liquidTiles++ // WATER, LAVA, DEEP_WATER
        } else if (tile === 0) {
          airTiles++
        } else {
          solidTiles++
        }
      }
    }

    if (totalScanned === 0) return
    const inv = 1 / totalScanned

    // Canopy: fraction of vegetation tiles, boosted for saliency
    this._zoneTargets.canopy = Math.min(1, treeTiles * inv * 8)

    // Water: fraction of liquid tiles, boosted
    this._zoneTargets.water = Math.min(1, liquidTiles * inv * 6)

    // Cavern: how enclosed is this space? High solid ratio + underground
    const surfaceY = surfaceHeights[((gx % width) + width) % width] || 0
    const depthBelow = Math.max(0, gy - surfaceY)
    const depthNorm = Math.min(1, depthBelow / (height * 0.6))
    const enclosure = solidTiles * inv // 0-1, how walled-in
    this._zoneTargets.cavern = Math.min(1, depthNorm * 1.2 + enclosure * 0.5)
    this._zoneTargets.depth = depthNorm

    // Open air: on or above surface, lots of air, few solids overhead
    const aboveSurface = gy <= surfaceY + 3 ? 1 : Math.max(0, 1 - depthBelow / 30)
    const openness = airTiles * inv
    this._zoneTargets.openAir = aboveSurface * openness
  }

  // ============================================================
  //  CAVERN AMBIENCE LAYER
  //  Continuous drone, stochastic drips, and distant tunnel echoes
  //  driven by cavern + depth zone weights.
  // ============================================================

  _initCavernLayer() {
    const ac = this.ctx

    // Deep resonant drone: two detuned triangle oscillators
    const drone1 = ac.createOscillator()
    drone1.type = 'triangle'
    drone1.frequency.value = 55 // A1
    const drone2 = ac.createOscillator()
    drone2.type = 'triangle'
    drone2.frequency.value = 55.5 // slight detune for beating

    const droneGain = ac.createGain()
    droneGain.gain.value = 0

    // Subtle LFO modulating drone pitch for organic movement
    const droneLFO = ac.createOscillator()
    droneLFO.frequency.value = 0.15
    const droneLFOGain = ac.createGain()
    droneLFOGain.gain.value = 0.5
    droneLFO.connect(droneLFOGain)
    droneLFOGain.connect(drone1.frequency)
    droneLFOGain.connect(drone2.frequency)
    droneLFO.start()

    // Lowpass filter to keep the drone subterranean
    const droneLp = ac.createBiquadFilter()
    droneLp.type = 'lowpass'
    droneLp.frequency.value = 200
    droneLp.Q.value = 2

    drone1.connect(droneLp)
    drone2.connect(droneLp)
    droneLp.connect(droneGain)
    droneGain.connect(this.proceduralGain)
    drone1.start()
    drone2.start()

    // Wind-through-tunnels: filtered noise bed
    const windSrc = ac.createBufferSource()
    windSrc.buffer = this._longNoiseBuffer
    windSrc.loop = true
    const windBp = ac.createBiquadFilter()
    windBp.type = 'bandpass'
    windBp.frequency.value = 300
    windBp.Q.value = 3
    const windGain = ac.createGain()
    windGain.gain.value = 0
    // Slow modulation of the wind filter frequency
    const windLFO = ac.createOscillator()
    windLFO.frequency.value = 0.08
    const windLFOGain = ac.createGain()
    windLFOGain.gain.value = 100
    windLFO.connect(windLFOGain)
    windLFOGain.connect(windBp.frequency)
    windLFO.start()

    windSrc.connect(windBp).connect(windGain)
    windGain.connect(this.proceduralGain)
    windSrc.start()

    this._cavern = {
      drone1, drone2, droneGain, droneLp, droneLFO,
      windSrc, windBp, windGain, windLFO,
    }
    this._cavernDripTime = 0
    this._cavernDripDelay = 2
  }

  // Called from the zone update loop to modulate cavern layer gains
  _updateCavernLayer() {
    if (!this._cavern) return
    const now = this.ctx.currentTime
    const cavern = this.zones.cavern
    const depth = this.zones.depth

    // Drone: swells with cavern weight, pitch drops with depth
    this._cavern.droneGain.gain.setTargetAtTime(cavern * 0.18, now, 0.5)
    const droneFreq = 55 - depth * 20 // 55Hz surface → 35Hz deep
    this._cavern.drone1.frequency.setTargetAtTime(droneFreq, now, 1.0)
    this._cavern.drone2.frequency.setTargetAtTime(droneFreq + 0.5, now, 1.0)
    this._cavern.droneLp.frequency.setTargetAtTime(120 + (1 - depth) * 180, now, 0.5)

    // Cave wind: subtle breath, not howl
    this._cavern.windGain.gain.setTargetAtTime(cavern * 0.08, now, 0.4)
    this._cavern.windBp.frequency.setTargetAtTime(200 + (1 - depth) * 300, now, 0.5)
  }

  // Stochastic drip sounds: random pitched water drops
  updateCavernDrips() {
    if (!this.initialized || this.ctx.state !== 'running') return
    const cavern = this.zones.cavern
    if (cavern < 0.1) return

    const now = this.ctx.currentTime
    if (now - this._cavernDripTime < this._cavernDripDelay) return

    this._cavernDripTime = now
    // More frequent drips deeper in caves (0.5-4s)
    this._cavernDripDelay = 0.5 + (1 - cavern) * 3.5 + Math.random() * 2

    const ac = this.ctx
    const pan = (Math.random() - 0.5) * 1.8
    const panner = ac.createStereoPanner()
    panner.pan.value = Math.max(-1, Math.min(1, pan))

    // Resonant drip: sine ping with fast decay
    const freq = 800 + Math.random() * 2000
    const osc = ac.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, now)
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + 0.15)

    const env = ac.createGain()
    const vol = 0.15 + cavern * 0.25
    env.gain.setValueAtTime(vol, now)
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.1 + Math.random() * 0.15)

    osc.connect(env).connect(panner).connect(this.proceduralGain)
    osc.start(now)
    osc.stop(now + 0.3)

    // Occasional second drip echo (delayed, quieter)
    if (Math.random() < 0.4) {
      const delay = 0.08 + Math.random() * 0.12
      const osc2 = ac.createOscillator()
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(freq * (0.9 + Math.random() * 0.2), now + delay)
      const env2 = ac.createGain()
      env2.gain.setValueAtTime(0, now)
      env2.gain.setValueAtTime(vol * 0.4, now + delay)
      env2.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.12)
      osc2.connect(env2).connect(panner)
      osc2.start(now + delay)
      osc2.stop(now + delay + 0.2)
    }
  }

  // ============================================================
  //  BIRDSONG LAYER
  //  Seeded melodic calls that play when canopy zone weight is high.
  //  Each world gets unique bird "species" derived from seed + elements.
  // ============================================================

  _initBirdsong() {
    this._birdLastTime = 0
    this._birdNextDelay = 1
    this._birdSpecies = null // generated on setWorld
  }

  // Build per-world bird species from seed. Each species has a call
  // pattern (note sequence), base pitch, timbre, and rhythm.
  _generateBirdSpecies(seed, element1, element2) {
    const rng = mulberry32(seed + 77777)
    const count = 2 + Math.floor(rng() * 3) // 2-4 species per world
    const species = []

    // Element influences timbre: fire = sawtooth/harsh, water = sine/pure,
    // air = triangle/airy, earth = square/woody
    const waveMap = { fire: 'sawtooth', water: 'sine', air: 'triangle', earth: 'square' }
    const primaryWave = waveMap[element1] || 'sine'
    const secondaryWave = waveMap[element2] || 'triangle'

    for (let i = 0; i < count; i++) {
      const wave = rng() > 0.5 ? primaryWave : secondaryWave
      // Pentatonic base so calls sound melodic, not random
      const pentatonic = [0, 2, 4, 7, 9, 12, 14, 16]
      const baseNote = 72 + Math.floor(rng() * 12) // MIDI 72-83 (C5-B5)

      // Generate a 2-6 note call pattern
      const noteCount = 2 + Math.floor(rng() * 5)
      const notes = []
      for (let n = 0; n < noteCount; n++) {
        const interval = pentatonic[Math.floor(rng() * pentatonic.length)]
        notes.push(baseNote + interval - 7) // centre around base
      }

      // Rhythm: note durations in ms
      const tempoBase = 60 + rng() * 100 // ms per note (fast trill to slow call)
      const durations = notes.map(() => tempoBase * (0.5 + rng()))

      // Call style affects envelope
      const style = rng() < 0.3 ? 'trill' : rng() < 0.6 ? 'whistle' : 'chirp'

      species.push({
        wave,
        notes,
        durations,
        style,
        vibrato: 2 + rng() * 8, // Hz
        vibratoDepth: 5 + rng() * 20, // cents
        volume: 0.3 + rng() * 0.4,
      })
    }

    this._birdSpecies = species
  }

  // Stochastic birdsong triggered by canopy zone weight
  updateBirdsong() {
    if (!this.initialized || this.ctx.state !== 'running') return
    if (!this._birdSpecies || this._birdSpecies.length === 0) return

    const canopy = this.zones.canopy
    if (canopy < 0.02) return // no trees nearby

    const now = this.ctx.currentTime
    if (now - this._birdLastTime < this._birdNextDelay) return

    this._birdLastTime = now
    // Higher canopy = more frequent calls (1-6s range)
    this._birdNextDelay = 1 + (1 - canopy) * 5 + Math.random() * 3

    // Pick a random species and play its call
    const sp = this._birdSpecies[Math.floor(Math.random() * this._birdSpecies.length)]
    this._playBirdCall(sp, canopy)
  }

  _playBirdCall(species, canopyWeight) {
    const ac = this.ctx
    const now = ac.currentTime
    const pan = (Math.random() - 0.5) * 1.6 // wide stereo field

    const panner = ac.createStereoPanner()
    panner.pan.value = Math.max(-1, Math.min(1, pan))

    const callGain = ac.createGain()
    callGain.gain.value = 0
    callGain.connect(panner)
    panner.connect(this.proceduralGain)

    let t = now
    for (let i = 0; i < species.notes.length; i++) {
      const midi = species.notes[i]
      const freq = 440 * Math.pow(2, (midi - 69) / 12)
      const dur = species.durations[i] / 1000 // ms → s
      const vol = species.volume * canopyWeight

      const osc = ac.createOscillator()
      osc.type = species.wave
      osc.frequency.setValueAtTime(freq, t)

      // Vibrato for organic warble
      const vib = ac.createOscillator()
      vib.frequency.value = species.vibrato
      const vibGain = ac.createGain()
      vibGain.gain.value = species.vibratoDepth * (freq / 1200) // cents to Hz
      vib.connect(vibGain)
      vibGain.connect(osc.frequency)
      vib.start(t)
      vib.stop(t + dur + 0.05)

      // Per-note envelope
      const noteEnv = ac.createGain()
      if (species.style === 'trill') {
        noteEnv.gain.setValueAtTime(vol, t)
        noteEnv.gain.setValueAtTime(0, t + dur * 0.8)
      } else if (species.style === 'whistle') {
        noteEnv.gain.setValueAtTime(0.001, t)
        noteEnv.gain.linearRampToValueAtTime(vol, t + dur * 0.15)
        noteEnv.gain.setValueAtTime(vol, t + dur * 0.7)
        noteEnv.gain.exponentialRampToValueAtTime(0.001, t + dur)
      } else {
        // chirp: sharp attack, fast decay
        noteEnv.gain.setValueAtTime(vol, t)
        noteEnv.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.6)
      }

      osc.connect(noteEnv)
      noteEnv.connect(callGain)
      osc.start(t)
      osc.stop(t + dur + 0.05)

      // Slight pitch slide between notes for naturalism
      if (i < species.notes.length - 1) {
        const nextFreq = 440 * Math.pow(2, (species.notes[i + 1] - 69) / 12)
        osc.frequency.linearRampToValueAtTime(nextFreq, t + dur)
      }

      t += dur * (0.8 + Math.random() * 0.2) // slight timing variance
    }

    // Master envelope for the whole call
    callGain.gain.setValueAtTime(species.volume * canopyWeight, now)
  }

  // ============================================================
  //  CRITTER SOUND LAYER
  //  Stochastic element-themed one-shots panned to critter positions
  // ============================================================

  _createNoiseBuffer(duration) {
    const length = Math.floor(this.ctx.sampleRate * duration)
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
    return buffer
  }

  _initCritterLayer() {
    this._lastCritterTime = 0
    this._nextCritterDelay = 3
    this._critterVoices = null // generated on setWorld
  }

  // Build per-world critter voicings: each element's critter gets a
  // unique sound character derived from the seed. Voices control pitch
  // range, filter shape, burst pattern, and duration.
  _generateCritterVoices(seed, element1, element2) {
    const rng = mulberry32(seed + 55555)
    const voices = {}

    for (const element of ['fire', 'water', 'air', 'earth']) {
      // Elements close to the world's pair get richer, louder voices
      const isPrimary = element === element1 || element === element2
      const richness = isPrimary ? 1.0 : 0.6

      voices[element] = {
        // Pitch centre and range (Hz)
        freqBase: 200 + rng() * 1800,
        freqRange: 100 + rng() * 800,
        // Filter character
        filterQ: 1 + rng() * 6,
        filterType: rng() < 0.5 ? 'bandpass' : 'highpass',
        // Temporal pattern
        burstCount: 1 + Math.floor(rng() * 4),
        burstSpacing: 0.02 + rng() * 0.06,
        noteDuration: 0.03 + rng() * 0.15,
        // Envelope shape
        attack: 0.002 + rng() * 0.01,
        decay: 0.03 + rng() * 0.2,
        // Pitch modulation per burst (creates chirp/warble)
        pitchSweep: (rng() - 0.5) * 2, // -1 to 1: down-sweep vs up-sweep
        // Tonal vs noise mix (0 = pure noise, 1 = pure tone)
        tonality: rng() * 0.8,
        // Per-play randomization ranges
        pitchVariance: 0.1 + rng() * 0.3,
        richness,
      }
    }

    this._critterVoices = voices
  }

  // Call from the game loop. Picks a random nearby critter and plays
  // an element-themed sound at stochastic intervals (2-8s).
  updateCritters(critters, cameraX, cameraY) {
    if (!this.initialized || this.ctx.state !== 'running') return
    const now = this.ctx.currentTime
    if (now - this._lastCritterTime < this._nextCritterDelay) return

    const range = 400
    const nearby = critters.filter(c => {
      if (!c.sprite?.active) return false
      const dx = c.sprite.x - cameraX
      const dy = c.sprite.y - cameraY
      return dx * dx + dy * dy < range * range
    })
    if (nearby.length === 0) return

    const critter = nearby[Math.floor(Math.random() * nearby.length)]
    const dx = critter.sprite.x - cameraX
    const dy = critter.sprite.y - cameraY
    const dist = Math.sqrt(dx * dx + dy * dy)
    const pan = Math.max(-1, Math.min(1, dx / 300))
    const volume = Math.max(0, 1 - dist / range) * 0.6

    const element = CRITTER_ELEMENT[critter.typeName] || 'earth'
    this._playCritterOneShot(element, pan, volume)

    this._lastCritterTime = now
    this._nextCritterDelay = 2 + Math.random() * 6
  }

  // Voice-driven critter synth. Uses per-world voice parameters to
  // generate unique sounds. Each play randomises pitch/timing within
  // the voice's variance range for organic feel.
  _playCritterOneShot(element, pan, volume) {
    const ac = this.ctx
    const now = ac.currentTime
    const panner = ac.createStereoPanner()
    panner.pan.value = pan
    panner.connect(this.proceduralGain)

    // Use seeded voice if available, otherwise fall back to element defaults
    const voice = this._critterVoices?.[element]
    if (!voice) return

    const vol = volume * voice.richness

    for (let b = 0; b < voice.burstCount; b++) {
      const t = now + b * voice.burstSpacing + Math.random() * voice.burstSpacing * 0.3

      // Per-burst pitch randomisation
      const pitchMod = 1 + (Math.random() - 0.5) * voice.pitchVariance
      const freq = (voice.freqBase + (Math.random() - 0.5) * voice.freqRange) * pitchMod
      const endFreq = freq * Math.pow(2, voice.pitchSweep * 0.5) // sweep up or down

      // Mix tonal oscillator with filtered noise based on tonality
      const burstGain = ac.createGain()
      burstGain.gain.setValueAtTime(0.001, t)
      burstGain.gain.linearRampToValueAtTime(vol, t + voice.attack)
      burstGain.gain.exponentialRampToValueAtTime(0.001, t + voice.attack + voice.decay)
      burstGain.connect(panner)

      // Tonal component
      if (voice.tonality > 0.15) {
        const osc = ac.createOscillator()
        osc.type = element === 'fire' ? 'sawtooth' : element === 'air' ? 'triangle' : 'sine'
        osc.frequency.setValueAtTime(freq, t)
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + voice.attack + voice.decay)
        const toneGain = ac.createGain()
        toneGain.gain.value = voice.tonality
        osc.connect(toneGain).connect(burstGain)
        osc.start(t)
        osc.stop(t + voice.attack + voice.decay + 0.05)
      }

      // Noise component
      if (voice.tonality < 0.85) {
        const src = ac.createBufferSource()
        src.buffer = this._noiseBuffer
        const filt = ac.createBiquadFilter()
        filt.type = voice.filterType
        filt.frequency.setValueAtTime(freq, t)
        filt.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + voice.attack + voice.decay)
        filt.Q.value = voice.filterQ
        const noiseGain = ac.createGain()
        noiseGain.gain.value = 1 - voice.tonality
        src.connect(filt).connect(noiseGain).connect(burstGain)
        src.start(t)
        src.stop(t + voice.attack + voice.decay + 0.05)
      }
    }
  }

  // ============================================================
  //  VILLAGE PROXIMITY LAYER
  //  Ambient hum that fades in near settlements
  // ============================================================

  _initVillageLayer() {
    const ac = this.ctx

    // Filtered noise for indistinct murmur
    const noiseSrc = ac.createBufferSource()
    noiseSrc.buffer = this._longNoiseBuffer
    noiseSrc.loop = true
    const bp = ac.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 280
    bp.Q.value = 0.8

    // Tonal hum (distant voices); grows louder at higher village stages
    const hum = ac.createOscillator()
    hum.type = 'triangle'
    hum.frequency.value = 140
    const humGain = ac.createGain()
    humGain.gain.value = 0

    // Campfire crackle for stage 2+
    const fireSrc = ac.createBufferSource()
    fireSrc.buffer = this._longNoiseBuffer
    fireSrc.loop = true
    const fireBP = ac.createBiquadFilter()
    fireBP.type = 'bandpass'
    fireBP.frequency.value = 1200
    fireBP.Q.value = 1.5
    const fireGain = ac.createGain()
    fireGain.gain.value = 0

    const villageGain = ac.createGain()
    villageGain.gain.value = 0

    noiseSrc.connect(bp).connect(villageGain)
    hum.connect(humGain).connect(villageGain)
    fireSrc.connect(fireBP).connect(fireGain).connect(villageGain)
    villageGain.connect(this.proceduralGain)

    noiseSrc.start()
    hum.start()
    fireSrc.start()

    this._village = { noiseSrc, bp, hum, humGain, fireSrc, fireBP, fireGain, villageGain }
  }

  // Call from the game loop. Modulates village ambience based on
  // god distance to the nearest village.
  updateVillageProximity(villages, godX, godY) {
    if (!this.initialized || !this._village) return
    const now = this.ctx.currentTime
    const range = 240 // ~30 tiles * 8px

    let closestDist = Infinity
    let closestVillage = null
    for (const v of villages) {
      const dx = v.worldX - godX
      const dy = v.worldY - godY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < closestDist) { closestDist = dist; closestVillage = v }
    }

    if (!closestVillage || closestDist > range) {
      this._village.villageGain.gain.setTargetAtTime(0, now, 0.5)
      this._village.humGain.gain.setTargetAtTime(0, now, 0.5)
      this._village.fireGain.gain.setTargetAtTime(0, now, 0.5)
      return
    }

    const proximity = 1 - closestDist / range
    const stage = closestVillage.stage || 1

    // Base murmur: squared falloff for natural attenuation
    this._village.villageGain.gain.setTargetAtTime(proximity * proximity * 0.4, now, 0.3)
    // Tonal hum: grows with village stage
    this._village.humGain.gain.setTargetAtTime(proximity * (stage / 7) * 0.15, now, 0.5)
    // Campfire: stage 2+
    this._village.fireGain.gain.setTargetAtTime(stage >= 2 ? proximity * 0.2 : 0, now, 0.3)
  }

  // ============================================================
  //  WATER ZONE LAYER
  //  Lapping, bubbling, and submerged filtering near water bodies.
  //  Driven by zone.water weight and god's isInLiquid state.
  // ============================================================

  _initWaterLayer() {
    const ac = this.ctx

    // Continuous water lapping: modulated filtered noise
    const lapSrc = ac.createBufferSource()
    lapSrc.buffer = this._longNoiseBuffer
    lapSrc.loop = true
    const lapBp = ac.createBiquadFilter()
    lapBp.type = 'bandpass'
    lapBp.frequency.value = 400
    lapBp.Q.value = 1.5

    // Slow amplitude modulation for wave-like rhythm; very slow so it
    // reads as tidal drift rather than a metronome
    const lapLFO = ac.createOscillator()
    lapLFO.frequency.value = 0.08 + Math.random() * 0.06
    const lapLFOGain = ac.createGain()
    lapLFOGain.gain.value = 0.3
    lapLFO.connect(lapLFOGain)

    const lapGain = ac.createGain()
    lapGain.gain.value = 0
    lapLFOGain.connect(lapGain.gain)

    // Higher bubbling bed: resonant filtered noise
    const bubbleSrc = ac.createBufferSource()
    bubbleSrc.buffer = this._longNoiseBuffer
    bubbleSrc.loop = true
    const bubbleBp = ac.createBiquadFilter()
    bubbleBp.type = 'bandpass'
    bubbleBp.frequency.value = 1200
    bubbleBp.Q.value = 4
    // Randomised modulation for irregular bubble rhythm
    const bubbleLFO = ac.createOscillator()
    bubbleLFO.frequency.value = 2 + Math.random() * 3
    const bubbleLFOGain = ac.createGain()
    bubbleLFOGain.gain.value = 600
    bubbleLFO.connect(bubbleLFOGain)
    bubbleLFOGain.connect(bubbleBp.frequency)

    const bubbleGain = ac.createGain()
    bubbleGain.gain.value = 0

    lapSrc.connect(lapBp).connect(lapGain)
    bubbleSrc.connect(bubbleBp).connect(bubbleGain)
    lapGain.connect(this.proceduralGain)
    bubbleGain.connect(this.proceduralGain)

    lapSrc.start()
    lapLFO.start()
    bubbleSrc.start()
    bubbleLFO.start()

    // Submerged filter: lowpass on the entire procedural bus when underwater
    // (applied by toggling the cutoff frequency)
    this._submergedFilter = ac.createBiquadFilter()
    this._submergedFilter.type = 'lowpass'
    this._submergedFilter.frequency.value = 20000 // fully open by default
    this._submergedFilter.Q.value = 0.7

    // Re-route proceduralGain through the submerged filter
    // proceduralGain -> submergedFilter -> [existing connections]
    // Need to disconnect proceduralGain from its current targets and insert filter
    this.proceduralGain.disconnect()
    this.proceduralGain.connect(this._submergedFilter)
    this._submergedFilter.connect(this._reverbDry)
    this._submergedFilter.connect(this._reverbPreDelay)

    this._water = {
      lapSrc, lapBp, lapGain, lapLFO,
      bubbleSrc, bubbleBp, bubbleGain, bubbleLFO,
    }
    this._isSubmerged = false
  }

  // Called from zone update to modulate water layer
  _updateWaterLayer() {
    if (!this._water) return
    const now = this.ctx.currentTime
    const water = this.zones.water

    // Lapping: subtle wash; lower gain to sit behind pads
    this._water.lapGain.gain.setTargetAtTime(water * 0.1, now, 0.6)
    // Bubbling: only when very close to water
    this._water.bubbleGain.gain.setTargetAtTime(Math.max(0, water - 0.3) * 0.08, now, 0.4)
  }

  // Toggle submerged lowpass filter based on god's liquid state
  setSubmerged(inLiquid) {
    if (!this._submergedFilter) return
    if (inLiquid === this._isSubmerged) return
    this._isSubmerged = inLiquid
    const now = this.ctx.currentTime
    // Underwater: muffle everything above 600Hz
    // Surface: fully open (20kHz)
    const target = inLiquid ? 600 : 20000
    this._submergedFilter.frequency.setTargetAtTime(target, now, 0.08)
    this._submergedFilter.Q.setTargetAtTime(inLiquid ? 2 : 0.7, now, 0.08)
  }

  // ============================================================
  //  VILLAGER CHATTER (ANIMALESE)
  //  Rapid pitched syllables near villages, seeded per world.
  //  Not speech; impressionistic babble like Animal Crossing.
  // ============================================================

  _initVillagerChatter() {
    this._chatterLastTime = 0
    this._chatterNextDelay = 2
    this._villagerVoice = null
  }

  // Generate per-world villager "language" from seed.
  // Defines formant frequencies, pitch range, syllable timing.
  _generateVillagerVoice(seed, element1, element2) {
    const rng = mulberry32(seed + 99999)

    // Vowel formants: 3-5 "phonemes" the villagers cycle through
    const vowelCount = 3 + Math.floor(rng() * 3)
    const vowels = []
    for (let i = 0; i < vowelCount; i++) {
      vowels.push({
        f1: 250 + rng() * 600,  // first formant (openness)
        f2: 800 + rng() * 1800, // second formant (frontness)
        q1: 3 + rng() * 8,
        q2: 2 + rng() * 6,
      })
    }

    // Element influences voice character
    const waveMap = { fire: 'sawtooth', water: 'sine', air: 'triangle', earth: 'square' }

    this._villagerVoice = {
      vowels,
      wave: waveMap[element1] || 'triangle',
      pitchBase: 180 + rng() * 200,    // Hz: base speaking pitch
      pitchRange: 40 + rng() * 80,     // Hz: pitch variance between syllables
      syllableDur: 0.06 + rng() * 0.08, // seconds per syllable
      syllableGap: 0.02 + rng() * 0.04, // seconds between syllables
      phraseLength: 3 + Math.floor(rng() * 5), // syllables per phrase
      volume: 0.3 + rng() * 0.3,
    }
  }

  // Stochastic chatter near villages; frequency scales with proximity and stage
  updateVillagerChatter(villages, godX, godY) {
    if (!this.initialized || this.ctx.state !== 'running') return
    if (!this._villagerVoice) return

    // Find closest village and its proximity
    let closestDist = Infinity
    let closestVillage = null
    for (const v of villages) {
      const dx = v.worldX - godX
      const dy = v.worldY - godY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < closestDist) { closestDist = dist; closestVillage = v }
    }

    const range = 200
    if (!closestVillage || closestDist > range) return
    const proximity = 1 - closestDist / range
    const stage = closestVillage.stage || 1

    const now = this.ctx.currentTime
    if (now - this._chatterLastTime < this._chatterNextDelay) return

    this._chatterLastTime = now
    // More frequent at higher stage and closer proximity (0.8-4s)
    this._chatterNextDelay = 0.8 + (1 - proximity) * 2 + (1 - stage / 7) * 1.5 + Math.random() * 1.5

    this._playChatterPhrase(proximity, stage)
  }

  _playChatterPhrase(proximity, stage) {
    const ac = this.ctx
    const now = ac.currentTime
    const voice = this._villagerVoice
    const vol = voice.volume * proximity

    // Random pan position (villager in the settlement)
    const panner = ac.createStereoPanner()
    panner.pan.value = (Math.random() - 0.5) * 1.4
    panner.connect(this.proceduralGain)

    // Longer phrases at higher stages (busier settlement)
    const syllables = voice.phraseLength + Math.floor(stage / 3)

    let t = now
    for (let s = 0; s < syllables; s++) {
      const vowel = voice.vowels[Math.floor(Math.random() * voice.vowels.length)]
      const pitch = voice.pitchBase + (Math.random() - 0.5) * voice.pitchRange
      // Slight intonation: rising at start, falling at end of phrase
      const intonation = s < syllables / 2 ? 1 + s * 0.02 : 1 + (syllables - s) * 0.015
      const freq = pitch * intonation

      const dur = voice.syllableDur * (0.7 + Math.random() * 0.6)

      // Carrier oscillator
      const osc = ac.createOscillator()
      osc.type = voice.wave
      osc.frequency.setValueAtTime(freq, t)

      // Two formant filters shape the vowel sound
      const f1 = ac.createBiquadFilter()
      f1.type = 'bandpass'
      f1.frequency.value = vowel.f1
      f1.Q.value = vowel.q1
      const f2 = ac.createBiquadFilter()
      f2.type = 'bandpass'
      f2.frequency.value = vowel.f2
      f2.Q.value = vowel.q2

      // Syllable envelope: sharp attack, short sustain, fast release
      const env = ac.createGain()
      env.gain.setValueAtTime(0.001, t)
      env.gain.linearRampToValueAtTime(vol, t + 0.005)
      env.gain.setValueAtTime(vol, t + dur * 0.6)
      env.gain.exponentialRampToValueAtTime(0.001, t + dur)

      // Split signal through both formants and sum
      const mix = ac.createGain()
      mix.gain.value = 0.5
      osc.connect(f1)
      osc.connect(f2)
      f1.connect(mix)
      f2.connect(mix)
      mix.connect(env)
      env.connect(panner)

      osc.start(t)
      osc.stop(t + dur + 0.01)

      t += dur + voice.syllableGap * (0.5 + Math.random())
    }
  }

  // ============================================================
  //  GOD MOVEMENT SOUNDS
  //  One-shots triggered by player actions
  // ============================================================

  playDig() {
    if (!this.initialized || this.ctx.state !== 'running') return
    const ac = this.ctx
    const now = ac.currentTime
    const src = ac.createBufferSource()
    src.buffer = this._noiseBuffer
    const lp = ac.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 300 + Math.random() * 200
    lp.Q.value = 1
    const env = ac.createGain()
    env.gain.setValueAtTime(0.5, now)
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
    src.connect(lp).connect(env).connect(this.proceduralGain)
    src.start(now)
    src.stop(now + 0.15)
  }

  // Filter frequency varies by surface material: stone is bright,
  // soil is muffled, crystal rings, sand is soft.
  playStep(tileType) {
    if (!this.initialized || this.ctx.state !== 'running') return
    const ac = this.ctx
    const now = ac.currentTime
    const freqMap = { 1: 1800, 2: 600, 3: 2000, 7: 800, 8: 2000, 9: 700, 10: 2200, 11: 1500, 12: 2500 }
    const freq = freqMap[tileType] || 1200
    const src = ac.createBufferSource()
    src.buffer = this._noiseBuffer
    const bp = ac.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = freq
    bp.Q.value = 2
    const env = ac.createGain()
    env.gain.setValueAtTime(0.3, now)
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.04)
    src.connect(bp).connect(env).connect(this.proceduralGain)
    src.start(now)
    src.stop(now + 0.06)
  }

  playSplash() {
    if (!this.initialized || this.ctx.state !== 'running') return
    const ac = this.ctx
    const now = ac.currentTime
    const src = ac.createBufferSource()
    src.buffer = this._noiseBuffer
    const bp = ac.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 400 + Math.random() * 300
    bp.Q.value = 0.8
    const env = ac.createGain()
    env.gain.setValueAtTime(0.6, now)
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
    src.connect(bp).connect(env).connect(this.proceduralGain)
    src.start(now)
    src.stop(now + 0.35)
  }

  playFlap() {
    if (!this.initialized || this.ctx.state !== 'running') return
    const ac = this.ctx
    const now = ac.currentTime
    const src = ac.createBufferSource()
    src.buffer = this._noiseBuffer
    const bp = ac.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(200, now)
    bp.frequency.exponentialRampToValueAtTime(900, now + 0.15)
    bp.Q.value = 1.5
    const env = ac.createGain()
    env.gain.setValueAtTime(0.4, now)
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
    src.connect(bp).connect(env).connect(this.proceduralGain)
    src.start(now)
    src.stop(now + 0.25)
  }

  destroy() {
    for (const ch of Object.values(this.channels)) {
      if (ch.abTimer) clearInterval(ch.abTimer)
      if (ch.pair) {
        try { ch.pair.srcA.stop(); ch.pair.srcB.stop() } catch { /* noop */ }
      }
    }
    if (this._village) {
      try {
        this._village.noiseSrc.stop()
        this._village.hum.stop()
        this._village.fireSrc.stop()
      } catch { /* noop */ }
    }
    if (this.ctx) this.ctx.close()
    this.initialized = false
  }
}
