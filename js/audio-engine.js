/**
 * SoundCanvas Audio Engine
 * Web Audio API 기반 신디사이저 엔진
 */
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;
    this.reverb = null;
    this.isInitialized = false;
    this.activeSources = [];
    this.isPlaying = false;
    this.playStartTime = 0;
    this.scheduledNotes = [];
    this.loopEnabled = false;
    this.onPlaybackEnd = null;
    this.onPlayheadUpdate = null;
    this._animFrameId = null;
    this._recorder = null;
    this._recordedChunks = [];
  }

  async init() {
    if (this.isInitialized) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Master chain: compressor -> reverb -> gain -> destination
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -24;
    this.compressor.ratio.value = 4;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.7;

    // Create reverb
    this.reverb = await this._createReverb(1.5, 0.3);

    this.compressor.connect(this.reverb.input);
    this.reverb.output.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    this.isInitialized = true;
  }

  async _createReverb(duration, decay) {
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * duration;
    const impulse = this.ctx.createBuffer(2, length, sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const channel = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        channel[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay * 3);
      }
    }

    const convolver = this.ctx.createConvolver();
    convolver.buffer = impulse;

    const dry = this.ctx.createGain();
    dry.gain.value = 0.7;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.3;

    const input = this.ctx.createGain();
    const output = this.ctx.createGain();

    input.connect(dry);
    input.connect(convolver);
    convolver.connect(wet);
    dry.connect(output);
    wet.connect(output);

    return { input, output };
  }

  /**
   * Shape → 신스 타입 매핑
   */
  _getOscType(shape) {
    const map = {
      circle: 'sine',
      square: 'square',
      triangle: 'triangle',
      diamond: 'sawtooth',
      star: 'sine',     // + FM for bell
      hexagon: 'square', // short percussion
    };
    return map[shape] || 'sine';
  }

  /**
   * 단일 노트 재생 (미리듣기용)
   */
  playNote(note) {
    if (!this.isInitialized) return;
    const { frequency, shape, volume, duration } = note;
    const now = this.ctx.currentTime;
    this._scheduleNote(frequency, shape, volume, duration, now);
  }

  /**
   * 내부: 노트 스케줄링
   */
  _scheduleNote(frequency, shape, volume, duration, startTime) {
    const oscType = this._getOscType(shape);

    if (shape === 'hexagon') {
      this._playPercussion(frequency, volume, startTime);
      return;
    }

    if (shape === 'star') {
      this._playBell(frequency, volume, duration, startTime);
      return;
    }

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = oscType;
    osc.frequency.value = frequency;

    // Shape-specific filtering
    if (shape === 'square') {
      filter.type = 'lowpass';
      filter.frequency.value = 2000;
      filter.Q.value = 1;
    } else if (shape === 'diamond') {
      filter.type = 'lowpass';
      filter.frequency.value = 3000;
      filter.Q.value = 2;
    } else {
      filter.type = 'lowpass';
      filter.frequency.value = 8000;
      filter.Q.value = 0.5;
    }

    // ADSR envelope
    const attack = shape === 'circle' ? 0.05 : 0.01;
    const decay = 0.1;
    const sustain = volume * 0.3;
    const release = shape === 'circle' ? 0.3 : 0.15;

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume * 0.4, startTime + attack);
    gain.gain.linearRampToValueAtTime(sustain, startTime + attack + decay);
    gain.gain.setValueAtTime(sustain, startTime + duration - release);
    gain.gain.linearRampToValueAtTime(0, startTime + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.compressor);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.1);

    this.activeSources.push(osc);
    osc.onended = () => {
      const idx = this.activeSources.indexOf(osc);
      if (idx >= 0) this.activeSources.splice(idx, 1);
    };
  }

  _playBell(frequency, volume, duration, startTime) {
    // FM synthesis for bell-like sound
    const carrier = this.ctx.createOscillator();
    const modulator = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const outGain = this.ctx.createGain();

    carrier.frequency.value = frequency;
    modulator.frequency.value = frequency * 3.5;
    modGain.gain.value = frequency * 2;

    outGain.gain.setValueAtTime(volume * 0.3, startTime);
    outGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(outGain);
    outGain.connect(this.compressor);

    carrier.start(startTime);
    modulator.start(startTime);
    carrier.stop(startTime + duration + 0.1);
    modulator.stop(startTime + duration + 0.1);

    this.activeSources.push(carrier, modulator);
  }

  _playPercussion(frequency, volume, startTime) {
    // Noise-based percussion
    const bufferSize = this.ctx.sampleRate * 0.15;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency * 2;
    filter.Q.value = 2;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume * 0.5, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);

    // Add a click oscillator for tonal percussion
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.frequency.setValueAtTime(frequency, startTime);
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.3, startTime + 0.1);
    oscGain.gain.setValueAtTime(volume * 0.3, startTime);
    oscGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.1);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.compressor);

    osc.connect(oscGain);
    oscGain.connect(this.compressor);

    source.start(startTime);
    osc.start(startTime);
    osc.stop(startTime + 0.2);

    this.activeSources.push(source, osc);
  }

  /**
   * 전체 곡 재생
   * @param {Array} notes - [{time, frequency, shape, volume, duration}, ...]
   * @param {number} totalDuration - 총 길이 (초)
   */
  play(notes, totalDuration) {
    if (!this.isInitialized) return;
    this.stop();

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    this.isPlaying = true;
    this.playStartTime = this.ctx.currentTime;

    // Schedule all notes
    for (const note of notes) {
      this._scheduleNote(
        note.frequency,
        note.shape,
        note.volume,
        note.duration,
        this.playStartTime + note.time
      );
    }

    // Playhead animation
    const animate = () => {
      if (!this.isPlaying) return;
      const elapsed = this.ctx.currentTime - this.playStartTime;

      if (elapsed >= totalDuration) {
        if (this.loopEnabled) {
          this.play(notes, totalDuration);
          return;
        }
        this.isPlaying = false;
        if (this.onPlaybackEnd) this.onPlaybackEnd();
        return;
      }

      if (this.onPlayheadUpdate) {
        this.onPlayheadUpdate(elapsed / totalDuration);
      }

      this._animFrameId = requestAnimationFrame(animate);
    };
    this._animFrameId = requestAnimationFrame(animate);
  }

  stop() {
    this.isPlaying = false;
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
    for (const src of this.activeSources) {
      try { src.stop(); } catch (e) { /* already stopped */ }
    }
    this.activeSources = [];
  }

  /**
   * WAV 내보내기 (OfflineAudioContext 사용)
   */
  async exportWav(notes, totalDuration, onProgress) {
    const sampleRate = 44100;
    const length = Math.ceil(sampleRate * (totalDuration + 1));
    const offline = new OfflineAudioContext(2, length, sampleRate);

    // Recreate audio graph in offline context
    const compressor = offline.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.ratio.value = 4;

    const masterGain = offline.createGain();
    masterGain.gain.value = 0.7;

    compressor.connect(masterGain);
    masterGain.connect(offline.destination);

    // Schedule notes in offline context
    for (const note of notes) {
      this._scheduleOfflineNote(offline, compressor, note);
    }

    if (onProgress) onProgress(0.3);

    const audioBuffer = await offline.startRendering();

    if (onProgress) onProgress(0.7);

    // Convert to WAV
    const wav = this._audioBufferToWav(audioBuffer);

    if (onProgress) onProgress(1.0);

    return new Blob([wav], { type: 'audio/wav' });
  }

  _scheduleOfflineNote(ctx, destination, note) {
    const { time, frequency, shape, volume, duration } = note;
    const oscType = this._getOscType(shape);

    if (shape === 'hexagon') {
      // Simple noise percussion for offline
      const bufferSize = ctx.sampleRate * 0.15;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume * 0.4, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
      source.connect(gain);
      gain.connect(destination);
      source.start(time);
      return;
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = oscType;
    osc.frequency.value = frequency;

    if (shape === 'star') {
      // Simplified bell
      const mod = ctx.createOscillator();
      const modGain = ctx.createGain();
      mod.frequency.value = frequency * 3.5;
      modGain.gain.value = frequency * 2;
      mod.connect(modGain);
      modGain.connect(osc.frequency);
      gain.gain.setValueAtTime(volume * 0.3, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
      osc.connect(gain);
      gain.connect(destination);
      osc.start(time);
      osc.stop(time + duration + 0.1);
      mod.start(time);
      mod.stop(time + duration + 0.1);
      return;
    }

    const attack = shape === 'circle' ? 0.05 : 0.01;
    const release = shape === 'circle' ? 0.3 : 0.15;
    const sustain = volume * 0.3;

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume * 0.4, time + attack);
    gain.gain.linearRampToValueAtTime(sustain, time + attack + 0.1);
    gain.gain.setValueAtTime(sustain, time + duration - release);
    gain.gain.linearRampToValueAtTime(0, time + duration);

    osc.connect(gain);
    gain.connect(destination);
    osc.start(time);
    osc.stop(time + duration + 0.1);
  }

  _audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const dataLength = buffer.length * numChannels * bitsPerSample / 8;
    const headerLength = 44;
    const totalLength = headerLength + dataLength;

    const arrayBuffer = new ArrayBuffer(totalLength);
    const view = new DataView(arrayBuffer);

    // WAV header
    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, totalLength - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    // Interleave channels
    const channels = [];
    for (let ch = 0; ch < numChannels; ch++) {
      channels.push(buffer.getChannelData(ch));
    }

    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        let sample = channels[ch][i];
        sample = Math.max(-1, Math.min(1, sample));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, sample, true);
        offset += 2;
      }
    }

    return arrayBuffer;
  }
}

// Global instance
window.audioEngine = new AudioEngine();
