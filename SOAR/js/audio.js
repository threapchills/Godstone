/* AUDIO ENGINE - REMASTERED
   Sound limiting, better volume management, efficient playback.
*/

export class AudioManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
        this.masterGain.gain.value = 0.8;

        this.sounds = {};
        this.files = {
            'ambience': 'assets/sounds/ambience.ogg',
            'jump': 'assets/sounds/jump.ogg',
            'land': 'assets/sounds/land.ogg',
            'fall': 'assets/sounds/fall.ogg',
            'shoot': 'assets/sounds/shoot.ogg',
            'hit': 'assets/sounds/hit.ogg',
            'music': 'assets/sounds/music.ogg',
            'teepee': 'assets/sounds/teepee.ogg',
            'death': 'assets/sounds/death.ogg',
            'munch': 'assets/sounds/munch.ogg',
            'fire': 'assets/sounds/spell1.wav',
            'water': 'assets/sounds/spell2.wav',
            'earth': 'assets/sounds/spell3.wav',
            'air': 'assets/sounds/spell4.wav',
            'horn': 'assets/sounds/teepee.ogg',
            'drum_loop': 'assets/sounds/ambience.ogg'
        };

        this.loops = {};
        this.initialized = false;

        // Sound limiting: prevent audio spam
        this._lastPlayTime = {};
        this._minInterval = {
            'hit': 0.05,
            'shoot': 0.04,
            'air': 0.15,
            'jump': 0.1
        };
    }

    async loadAll() {
        const promises = Object.entries(this.files).map(([key, url]) => this._loadBuffer(key, url));
        await Promise.all(promises);
    }

    async _loadBuffer(key, url) {
        try {
            const response = await fetch(url);
            if (!response.ok) return;
            const arrayBuffer = await response.arrayBuffer();
            this.sounds[key] = await this.ctx.decodeAudioData(arrayBuffer);
        } catch (e) {
            // Silent fail for missing audio
        }
    }

    resume() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume().then(() => { this.initialized = true; });
        } else {
            this.initialized = true;
        }
    }

    play(name, vol = 1.0, pitchVar = 0.0) {
        if (!this.sounds[name]) return;

        // Sound limiting
        const now = this.ctx.currentTime;
        const minInt = this._minInterval[name] || 0.02;
        if (this._lastPlayTime[name] && (now - this._lastPlayTime[name]) < minInt) return;
        this._lastPlayTime[name] = now;

        try {
            const source = this.ctx.createBufferSource();
            source.buffer = this.sounds[name];

            if (pitchVar > 0) {
                source.playbackRate.value = 1.0 + (Math.random() * 2 - 1) * pitchVar;
            }

            const gainNode = this.ctx.createGain();
            gainNode.gain.value = vol;
            source.connect(gainNode);
            gainNode.connect(this.masterGain);
            source.start(0);
        } catch (e) { /* ignore */ }
    }

    startLoop(name, vol = 1.0) {
        if (!this.sounds[name] || this.loops[name]) return;
        try {
            const source = this.ctx.createBufferSource();
            source.buffer = this.sounds[name];
            source.loop = true;

            const gainNode = this.ctx.createGain();
            gainNode.gain.value = vol;
            source.connect(gainNode);
            gainNode.connect(this.masterGain);
            source.start(0);

            this.loops[name] = { source, gain: gainNode };
        } catch (e) { /* ignore */ }
    }

    setLoopVolume(name, vol) {
        if (this.loops[name]) {
            try {
                this.loops[name].gain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.1);
            } catch (e) { /* ignore */ }
        }
    }

    setLoopPitch(name, rate) {
        if (this.loops[name]) {
            try {
                this.loops[name].source.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, 0.1);
            } catch (e) { /* ignore */ }
        }
    }

    setMasterVolume(vol) {
        this.masterGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.05);
    }
}
