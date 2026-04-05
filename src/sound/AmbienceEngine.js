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
    if (this.ctx.state === 'suspended') await this.ctx.resume()

    this._buildMasterChain()
    this._buildChannels()
    await this._loadCoreSounds()
    this._loadRemainingSounds() // fire-and-forget
    this.initialized = true
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
    const preA = ac.createGain(); preA.gain.value = metaA.pregain
    const crossA = ac.createGain(); crossA.gain.value = 1

    const srcB = ac.createBufferSource(); srcB.buffer = metaB.buffer; srcB.loop = true
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

      const base = ch.abDepth * 0.5
      const amp = ch.abDepth * 0.15
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

  // Call once when the world is created. Picks sounds and sets volumes
  // based on element pair, ratio, and seed.
  setWorld(params) {
    if (!this.initialized) { this.params = params; return }
    this.params = params

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
  }

  // t: 0..1 where 0 = midnight, 0.5 = noon
  // Fire/air swell during day; water/earth swell at night
  setTimeOfDay(t) {
    if (!this.initialized) return
    const day = Math.sin(t * Math.PI)
    const night = 1 - day
    const boost = 0.12

    for (const name of ORDERED) {
      const ch = this.channels[name]
      const mod = (name === 'fire' || name === 'air') ? day * boost : night * boost
      const v = ch.baseVolume + mod
      ch.gain.gain.setTargetAtTime(v * v, this.ctx.currentTime, 1.5)
    }
  }

  // d: 0 = surface, 1 = deepest underground
  // Underground amplifies earth, muffles air
  setDepth(d) {
    if (!this.initialized || !this.eq) return
    // Shift EQ: deeper = darker, more bass
    this.eq.low.gain.setTargetAtTime(d * 4, this.ctx.currentTime, 0.5)
    this.eq.high.gain.setTargetAtTime(-d * 6, this.ctx.currentTime, 0.5)
  }

  setMasterVolume(v) {
    if (!this.masterGain) return
    this.masterGain.gain.setTargetAtTime(Math.pow(v, 2.2), this.ctx.currentTime, 0.15)
  }

  destroy() {
    for (const ch of Object.values(this.channels)) {
      if (ch.abTimer) clearInterval(ch.abTimer)
      if (ch.pair) {
        try { ch.pair.srcA.stop(); ch.pair.srcB.stop() } catch { /* noop */ }
      }
    }
    if (this.ctx) this.ctx.close()
    this.initialized = false
  }
}
