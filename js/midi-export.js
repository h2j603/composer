/**
 * Simple MIDI file export
 * Standard MIDI File Format 1
 */
class MidiExporter {
  constructor() {
    this.HEADER_CHUNK = [0x4D, 0x54, 0x68, 0x64]; // MThd
    this.TRACK_CHUNK = [0x4D, 0x54, 0x72, 0x6B]; // MTrk
  }

  /**
   * Export notes to MIDI file
   * @param {Array} notes - [{time(s), frequency, duration(s), volume(0-1)}]
   * @param {number} bpm
   * @returns {Blob}
   */
  export(notes, bpm) {
    const ticksPerBeat = 480;
    const secondsPerBeat = 60 / bpm;

    // Convert notes to MIDI events
    const events = [];
    for (const note of notes) {
      const midiNote = this._frequencyToMidi(note.frequency);
      if (midiNote < 0 || midiNote > 127) continue;

      const velocity = Math.round(Math.max(1, Math.min(127, note.volume * 127)));
      const startTick = Math.round((note.time / secondsPerBeat) * ticksPerBeat);
      const durationTick = Math.round((note.duration / secondsPerBeat) * ticksPerBeat);

      events.push({ tick: startTick, type: 'noteOn', note: midiNote, velocity });
      events.push({ tick: startTick + durationTick, type: 'noteOff', note: midiNote, velocity: 0 });
    }

    // Sort by tick
    events.sort((a, b) => a.tick - b.tick || (a.type === 'noteOff' ? -1 : 1));

    // Build track data
    const trackData = [];

    // Tempo meta event
    const microsecondsPerBeat = Math.round(60000000 / bpm);
    trackData.push(...this._writeVarLen(0)); // delta time
    trackData.push(0xFF, 0x51, 0x03); // tempo meta event
    trackData.push((microsecondsPerBeat >> 16) & 0xFF);
    trackData.push((microsecondsPerBeat >> 8) & 0xFF);
    trackData.push(microsecondsPerBeat & 0xFF);

    // Program change (piano)
    trackData.push(...this._writeVarLen(0));
    trackData.push(0xC0, 0x00);

    // Note events
    let lastTick = 0;
    for (const evt of events) {
      const delta = evt.tick - lastTick;
      lastTick = evt.tick;

      trackData.push(...this._writeVarLen(delta));
      if (evt.type === 'noteOn') {
        trackData.push(0x90, evt.note, evt.velocity);
      } else {
        trackData.push(0x80, evt.note, 0);
      }
    }

    // End of track
    trackData.push(...this._writeVarLen(0));
    trackData.push(0xFF, 0x2F, 0x00);

    // Build file
    const fileData = [];

    // Header
    fileData.push(...this.HEADER_CHUNK);
    fileData.push(0x00, 0x00, 0x00, 0x06); // header length
    fileData.push(0x00, 0x00); // format 0
    fileData.push(0x00, 0x01); // 1 track
    fileData.push((ticksPerBeat >> 8) & 0xFF, ticksPerBeat & 0xFF);

    // Track
    fileData.push(...this.TRACK_CHUNK);
    const trackLen = trackData.length;
    fileData.push(
      (trackLen >> 24) & 0xFF,
      (trackLen >> 16) & 0xFF,
      (trackLen >> 8) & 0xFF,
      trackLen & 0xFF
    );
    fileData.push(...trackData);

    return new Blob([new Uint8Array(fileData)], { type: 'audio/midi' });
  }

  _frequencyToMidi(freq) {
    return Math.round(12 * Math.log2(freq / 440) + 69);
  }

  _writeVarLen(value) {
    const result = [];
    let v = value & 0x7F;
    result.unshift(v);
    value >>= 7;
    while (value > 0) {
      v = (value & 0x7F) | 0x80;
      result.unshift(v);
      value >>= 7;
    }
    return result;
  }
}

window.midiExporter = new MidiExporter();
