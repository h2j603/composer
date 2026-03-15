/**
 * SoundCanvas - Main Application
 * 그래픽 디자이너를 위한 음악 작곡 앱
 */

// ====== Music Theory Data ======
const SCALES = {
  C:  { name: 'C 장조', notes: ['C','D','E','F','G','A','B'], type: 'major' },
  G:  { name: 'G 장조', notes: ['G','A','B','C','D','E','F#'], type: 'major' },
  D:  { name: 'D 장조', notes: ['D','E','F#','G','A','B','C#'], type: 'major' },
  F:  { name: 'F 장조', notes: ['F','G','A','Bb','C','D','E'], type: 'major' },
  Am: { name: 'A 단조', notes: ['A','B','C','D','E','F','G'], type: 'minor' },
  Em: { name: 'E 단조', notes: ['E','F#','G','A','B','C','D'], type: 'minor' },
  Dm: { name: 'D 단조', notes: ['D','E','F','G','A','Bb','C'], type: 'minor' },
  pentatonic: { name: '펜타토닉', notes: ['C','D','E','G','A'], type: 'pentatonic' },
};

// Note frequencies (all octaves)
const NOTE_FREQS = {};
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLAT_NAMES = { 'C#':'Db','D#':'Eb','F#':'Gb','G#':'Ab','A#':'Bb' };

for (let octave = 1; octave <= 7; octave++) {
  for (let i = 0; i < 12; i++) {
    const note = NOTE_NAMES[i];
    const freq = 440 * Math.pow(2, (octave - 4) + (i - 9) / 12);
    NOTE_FREQS[`${note}${octave}`] = freq;
    if (FLAT_NAMES[note]) {
      NOTE_FREQS[`${FLAT_NAMES[note]}${octave}`] = freq;
    }
  }
}

// Color palette for notes (warm to cool spectrum - designer friendly)
const NOTE_COLORS = [
  '#FF6B6B', // Red - C / Do
  '#FF8E53', // Orange
  '#FFD93D', // Yellow
  '#6BCB77', // Green
  '#4D96FF', // Blue
  '#9B59B6', // Purple
  '#E91E9C', // Magenta
  '#FF6B6B', // loop back
];

const SHAPE_NAMES = {
  circle: 'Sine (부드러운)',
  square: 'Square (전자음)',
  triangle: 'Triangle (맑은)',
  diamond: 'Sawtooth (날카로운)',
  star: 'Bell (종소리)',
  hexagon: 'Percussion (타악기)',
};

const SIZE_LABELS = {
  1: '16분음표',
  2: '8분음표',
  4: '4분음표 (1박)',
  8: '2분음표 (2박)',
};

// ====== App State ======
const state = {
  notes: [],
  layers: [
    { id: 'layer-1', name: '멜로디 (Melody)', color: '#FF6B6B', muted: false, solo: false },
    { id: 'layer-2', name: '베이스 (Bass)', color: '#4D96FF', muted: false, solo: false },
    { id: 'layer-3', name: '리듬 (Rhythm)', color: '#6BCB77', muted: false, solo: false },
  ],
  activeLayerId: 'layer-1',
  selectedNoteId: null,
  currentShape: 'circle',
  currentColor: '#FF6B6B',
  currentSize: 2,
  currentOpacity: 0.8,
  currentMode: 'draw', // draw, select, erase
  musicKey: 'C',
  bpm: 120,
  isPlaying: false,
  loopEnabled: false,
  undoStack: [],
  redoStack: [],
  noteIdCounter: 0,
  pitchMap: [], // maps row index to {name, freq}
};

let renderer;
let animFrameId;

// init is defined at the bottom of the file

// ====== Pitch Map ======
function buildPitchMap() {
  const scale = SCALES[state.musicKey];
  const pitchMap = [];

  // Build scale notes across octaves (high to low for canvas top-to-bottom)
  const octaves = [5, 4, 3];
  for (const octave of octaves) {
    for (let i = scale.notes.length - 1; i >= 0; i--) {
      const noteName = scale.notes[i];
      const fullName = `${noteName}${octave}`;
      const freq = NOTE_FREQS[fullName];
      if (freq) {
        pitchMap.push({ name: fullName, displayName: noteName, freq, octave });
      }
    }
  }

  // Sort high to low
  pitchMap.sort((a, b) => b.freq - a.freq);

  // Limit to renderer row count
  state.pitchMap = pitchMap.slice(0, renderer.totalPitchRows);

  // Pad if needed
  while (state.pitchMap.length < renderer.totalPitchRows) {
    const last = state.pitchMap[state.pitchMap.length - 1];
    state.pitchMap.push({ name: '-', displayName: '-', freq: last ? last.freq / 2 : 220, octave: 2 });
  }
}

function buildPitchLabels() {
  const container = document.getElementById('pitch-labels');
  container.innerHTML = '';
  for (let i = 0; i < state.pitchMap.length; i++) {
    const p = state.pitchMap[i];
    const div = document.createElement('div');
    div.className = 'pitch-label';
    // Show note name (e.g. C4, D5) - helps learn pitch names
    div.textContent = p.displayName + (p.octave || '');
    if (p.displayName === SCALES[state.musicKey].notes[0]) {
      div.classList.add('highlight');
    }
    div.style.height = renderer.cellHeight + 'px';
    container.appendChild(div);
  }
}

function buildBeatLabels() {
  const container = document.getElementById('beat-labels');
  container.innerHTML = '';
  for (let i = 0; i < renderer.totalBeats; i++) {
    const div = document.createElement('div');
    div.className = 'beat-label';
    if (i % 4 === 0) {
      div.classList.add('bar-start');
      div.textContent = `${Math.floor(i / 4) + 1}`;
    } else {
      div.textContent = `${(i % 4) + 1}`;
    }
    div.style.minWidth = renderer.cellWidth + 'px';
    div.style.width = renderer.cellWidth + 'px';
    container.appendChild(div);
  }
}

function buildColorPalette() {
  const container = document.getElementById('color-palette');
  container.innerHTML = '';
  const scale = SCALES[state.musicKey];
  // Solfege names for learning
  const solfege = ['도', '레', '미', '파', '솔', '라', '시', '도'];

  scale.notes.forEach((noteName, i) => {
    const color = NOTE_COLORS[i % NOTE_COLORS.length];
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    if (color === state.currentColor) swatch.classList.add('active');
    swatch.style.backgroundColor = color;
    swatch.dataset.color = color;
    swatch.dataset.note = noteName;
    swatch.title = `${noteName} (${solfege[i] || ''})`;

    // Show note name label on the swatch
    const label = document.createElement('span');
    label.className = 'swatch-label';
    label.textContent = noteName;
    swatch.appendChild(label);

    swatch.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      state.currentColor = color;
    });

    container.appendChild(swatch);
  });
}

// ====== Rendering ======
function render() {
  renderer.render(state.notes, state.selectedNoteId, state.activeLayerId, state.layers);
}

// ====== Note Management ======
function createNote(beatPos, pitchRow) {
  const pitch = state.pitchMap[pitchRow];
  if (!pitch || pitch.name === '-') return null;

  const note = {
    id: `note-${++state.noteIdCounter}`,
    layerId: state.activeLayerId,
    beatPos,
    pitchRow,
    shape: state.currentShape,
    color: state.currentColor,
    sizeFactor: state.currentSize,
    opacity: state.currentOpacity,
    pitchName: pitch.name,
    frequency: pitch.freq,
  };

  return note;
}

function addNote(note) {
  if (!note) return;

  // Check for overlap
  const overlapping = state.notes.find(n =>
    n.layerId === note.layerId &&
    n.pitchRow === note.pitchRow &&
    n.beatPos < note.beatPos + note.sizeFactor &&
    note.beatPos < n.beatPos + n.sizeFactor
  );
  if (overlapping) return;

  saveUndoState();
  state.notes.push(note);
  render();

  // Play preview
  audioEngine.init().then(() => {
    audioEngine.playNote({
      frequency: note.frequency,
      shape: note.shape,
      volume: note.opacity * 0.5,
      duration: (60 / state.bpm) * note.sizeFactor * 0.5,
    });
  });
}

function deleteNote(noteId) {
  saveUndoState();
  state.notes = state.notes.filter(n => n.id !== noteId);
  state.selectedNoteId = null;
  updateNoteProperties(null);
  render();
}

function selectNote(note) {
  state.selectedNoteId = note ? note.id : null;
  updateNoteProperties(note);
  render();
}

function updateNoteProperties(note) {
  const emptyPanel = document.getElementById('panel-empty-state');
  const notePanel = document.getElementById('panel-note-info');

  if (!note) {
    emptyPanel.style.display = '';
    notePanel.style.display = 'none';
    return;
  }

  emptyPanel.style.display = 'none';
  notePanel.style.display = '';

  document.getElementById('prop-pitch').textContent = note.pitchName;
  document.getElementById('prop-instrument').textContent = SHAPE_NAMES[note.shape] || note.shape;
  document.getElementById('prop-duration').textContent = SIZE_LABELS[note.sizeFactor] || `${note.sizeFactor}박`;
  // Volume as musical dynamics terminology
  const vol = note.opacity;
  const dynamics = vol < 0.3 ? 'pp (매우 여리게)' : vol < 0.5 ? 'p (여리게)' : vol < 0.7 ? 'mf (조금 세게)' : vol < 0.9 ? 'f (세게)' : 'ff (매우 세게)';
  document.getElementById('prop-volume').textContent = dynamics;
  document.getElementById('prop-beat').textContent = `${Math.floor(note.beatPos / 4) + 1}마디 ${(note.beatPos % 4) + 1}박`;
}

// ====== Undo/Redo ======
function saveUndoState() {
  state.undoStack.push(JSON.stringify(state.notes));
  if (state.undoStack.length > 50) state.undoStack.shift();
  state.redoStack = [];
}

function undo() {
  if (state.undoStack.length === 0) return;
  state.redoStack.push(JSON.stringify(state.notes));
  state.notes = JSON.parse(state.undoStack.pop());
  state.selectedNoteId = null;
  updateNoteProperties(null);
  render();
}

function redo() {
  if (state.redoStack.length === 0) return;
  state.undoStack.push(JSON.stringify(state.notes));
  state.notes = JSON.parse(state.redoStack.pop());
  render();
}

// ====== Layers ======
function updateLayersList() {
  const container = document.getElementById('layers-list');
  container.innerHTML = '';

  for (const layer of state.layers) {
    const item = document.createElement('div');
    item.className = 'layer-item' + (layer.id === state.activeLayerId ? ' active' : '');
    item.innerHTML = `
      <div class="layer-color" style="background:${layer.color}"></div>
      <span class="layer-name">${layer.name}</span>
      <button class="layer-mute ${layer.muted ? 'active' : ''}" data-layer="${layer.id}" title="음소거">M</button>
      <button class="layer-solo ${layer.solo ? 'active' : ''}" data-layer="${layer.id}" title="솔로">S</button>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('layer-mute') || e.target.classList.contains('layer-solo')) return;
      state.activeLayerId = layer.id;
      updateLayersList();
      render();
    });

    const muteBtn = item.querySelector('.layer-mute');
    muteBtn.addEventListener('click', () => {
      layer.muted = !layer.muted;
      updateLayersList();
      render();
    });

    const soloBtn = item.querySelector('.layer-solo');
    soloBtn.addEventListener('click', () => {
      layer.solo = !layer.solo;
      updateLayersList();
      render();
    });

    container.appendChild(item);
  }
}

function addLayer() {
  const colors = ['#FF6B6B', '#4D96FF', '#6BCB77', '#FFD93D', '#9B59B6', '#FF8E53', '#E91E9C'];
  const layerNum = state.layers.length + 1;
  const layer = {
    id: `layer-${Date.now()}`,
    name: `Track ${layerNum}`,
    color: colors[layerNum % colors.length],
    muted: false,
    solo: false,
  };
  state.layers.push(layer);
  state.activeLayerId = layer.id;
  updateLayersList();
}

// ====== Playback ======
function togglePlay() {
  if (state.isPlaying) {
    stopPlayback();
  } else {
    startPlayback();
  }
}

async function startPlayback() {
  await audioEngine.init();

  const bpm = state.bpm;
  const secondsPerBeat = 60 / bpm;
  const totalDuration = renderer.totalBeats * secondsPerBeat;

  // Convert notes to audio events
  const audioNotes = getPlayableNotes(secondsPerBeat);

  if (audioNotes.length === 0) return;

  state.isPlaying = true;
  audioEngine.loopEnabled = state.loopEnabled;

  const playBtn = document.getElementById('btn-play');
  playBtn.classList.add('playing');

  const playhead = document.getElementById('playhead');
  playhead.style.display = 'block';

  audioEngine.onPlayheadUpdate = (progress) => {
    const px = renderer.progressToPixel(progress);
    playhead.style.left = px + 'px';

    // Auto-scroll
    const wrapper = document.getElementById('canvas-scroll-wrapper');
    const scrollLeft = wrapper.scrollLeft;
    const wrapperWidth = wrapper.clientWidth;
    if (px > scrollLeft + wrapperWidth - 50 || px < scrollLeft) {
      wrapper.scrollLeft = px - 50;
    }
  };

  audioEngine.onPlaybackEnd = () => {
    stopPlayback();
  };

  audioEngine.play(audioNotes, totalDuration);
}

function stopPlayback() {
  state.isPlaying = false;
  audioEngine.stop();

  const playBtn = document.getElementById('btn-play');
  playBtn.classList.remove('playing');

  const playhead = document.getElementById('playhead');
  playhead.style.display = 'none';
}

function getPlayableNotes(secondsPerBeat) {
  const mutedLayers = new Set();
  const soloLayers = new Set();
  for (const layer of state.layers) {
    if (layer.muted) mutedLayers.add(layer.id);
    if (layer.solo) soloLayers.add(layer.id);
  }
  const hasSolo = soloLayers.size > 0;

  return state.notes
    .filter(n => hasSolo ? soloLayers.has(n.layerId) : !mutedLayers.has(n.layerId))
    .map(n => ({
      time: n.beatPos * secondsPerBeat,
      frequency: n.frequency,
      shape: n.shape,
      volume: n.opacity,
      duration: n.sizeFactor * secondsPerBeat,
    }));
}

// ====== Presets (including Botanica) ======
const PRESETS = {
  heartbeat: {
    name: '심장박동',
    generate(scale) {
      const notes = [];
      const root = scale.notes[0];
      // Steady pulse rhythm
      for (let bar = 0; bar < 8; bar++) {
        const beat = bar * 4;
        notes.push({ beatPos: beat, pitchIdx: 0, shape: 'hexagon', size: 1, opacity: 0.9, color: '#FF6B6B' });
        notes.push({ beatPos: beat + 1, pitchIdx: 0, shape: 'hexagon', size: 1, opacity: 0.5, color: '#FF8E53' });
        notes.push({ beatPos: beat + 2, pitchIdx: 0, shape: 'hexagon', size: 1, opacity: 0.7, color: '#FF6B6B' });
        notes.push({ beatPos: beat + 3, pitchIdx: 2, shape: 'circle', size: 1, opacity: 0.3, color: '#FFD93D' });
      }
      return notes;
    }
  },
  rain: {
    name: '빗방울',
    generate(scale) {
      const notes = [];
      // Random high pitched droplets
      for (let i = 0; i < 32; i++) {
        const beat = i;
        if (Math.random() > 0.5) {
          const pitchIdx = Math.floor(Math.random() * 5);
          notes.push({
            beatPos: beat,
            pitchIdx,
            shape: 'star',
            size: 1,
            opacity: 0.2 + Math.random() * 0.4,
            color: '#4D96FF'
          });
        }
      }
      // Sustained ambient pad
      for (let bar = 0; bar < 4; bar++) {
        notes.push({
          beatPos: bar * 8,
          pitchIdx: 12 + Math.floor(Math.random() * 4),
          shape: 'circle',
          size: 8,
          opacity: 0.25,
          color: '#9B59B6'
        });
      }
      return notes;
    }
  },
  sunrise: {
    name: '일출',
    generate(scale) {
      const notes = [];
      // Gradual ascending melody
      for (let i = 0; i < 16; i++) {
        const pitchIdx = Math.max(0, 16 - i);
        notes.push({
          beatPos: i * 2,
          pitchIdx,
          shape: 'circle',
          size: 2,
          opacity: 0.3 + (i / 16) * 0.6,
          color: NOTE_COLORS[i % 7],
        });
      }
      // Bass foundation
      for (let bar = 0; bar < 8; bar++) {
        notes.push({
          beatPos: bar * 4,
          pitchIdx: 18,
          shape: 'triangle',
          size: 4,
          opacity: 0.4,
          color: '#FF8E53'
        });
      }
      return notes;
    }
  },
  waves: {
    name: '파도',
    generate(scale) {
      const notes = [];
      // Sine-wave like melodic contour
      for (let i = 0; i < 32; i++) {
        const sine = Math.sin(i * Math.PI / 8);
        const pitchIdx = Math.round(8 + sine * 6);
        notes.push({
          beatPos: i,
          pitchIdx: Math.max(0, Math.min(23, pitchIdx)),
          shape: 'circle',
          size: 2,
          opacity: 0.4 + Math.abs(sine) * 0.4,
          color: sine > 0 ? '#4D96FF' : '#6BCB77',
        });
      }
      return notes;
    }
  },
  city: {
    name: '도시',
    generate(scale) {
      const notes = [];
      // Rhythmic electronic pattern
      for (let bar = 0; bar < 8; bar++) {
        const beat = bar * 4;
        // Kick
        notes.push({ beatPos: beat, pitchIdx: 22, shape: 'hexagon', size: 1, opacity: 0.9, color: '#FF6B6B' });
        notes.push({ beatPos: beat + 2, pitchIdx: 22, shape: 'hexagon', size: 1, opacity: 0.8, color: '#FF6B6B' });
        // Hi-hat
        notes.push({ beatPos: beat + 1, pitchIdx: 2, shape: 'hexagon', size: 1, opacity: 0.4, color: '#FFD93D' });
        notes.push({ beatPos: beat + 3, pitchIdx: 2, shape: 'hexagon', size: 1, opacity: 0.4, color: '#FFD93D' });
        // Synth stab
        if (bar % 2 === 0) {
          notes.push({ beatPos: beat + 1, pitchIdx: 8, shape: 'square', size: 1, opacity: 0.6, color: '#9B59B6' });
        }
        // Bass
        notes.push({ beatPos: beat, pitchIdx: 18, shape: 'diamond', size: 2, opacity: 0.7, color: '#4D96FF' });
      }
      return notes;
    }
  },
  stars: {
    name: '별빛',
    generate(scale) {
      const notes = [];
      // Arpeggiated bell pattern (Botanica-inspired - organic, nature-like)
      const scaleLen = scale.notes.length;
      for (let bar = 0; bar < 8; bar++) {
        for (let i = 0; i < 4; i++) {
          const beat = bar * 4 + i;
          // Ascending arpeggio
          const pitchIdx = 4 + (i % scaleLen) * 2;
          notes.push({
            beatPos: beat,
            pitchIdx: Math.min(23, pitchIdx),
            shape: 'star',
            size: 1,
            opacity: 0.3 + (i % 3) * 0.2,
            color: NOTE_COLORS[(bar + i) % 7],
          });
        }
        // Pad
        if (bar % 2 === 0) {
          notes.push({
            beatPos: bar * 4,
            pitchIdx: 14,
            shape: 'circle',
            size: 8,
            opacity: 0.2,
            color: '#6BCB77'
          });
        }
      }
      return notes;
    }
  },
  // Botanica genre preset - nature-inspired ambient organic music
  botanica: {
    name: '보타니카',
    generate(scale) {
      const notes = [];
      const scaleLen = scale.notes.length;

      // Organic pad layer - slowly evolving chords like growing plants
      for (let bar = 0; bar < 4; bar++) {
        // Root pad (earth)
        notes.push({
          beatPos: bar * 8,
          pitchIdx: 16,
          shape: 'circle',
          size: 8,
          opacity: 0.25,
          color: '#6BCB77', // green - earth
          layer: 'layer-1'
        });
        // Third pad (leaves)
        notes.push({
          beatPos: bar * 8,
          pitchIdx: 14,
          shape: 'circle',
          size: 8,
          opacity: 0.2,
          color: '#4D96FF', // blue - water
          layer: 'layer-1'
        });
        // Fifth pad (sky)
        notes.push({
          beatPos: bar * 8 + 2,
          pitchIdx: 12,
          shape: 'circle',
          size: 4,
          opacity: 0.18,
          color: '#9B59B6', // purple - flowers
          layer: 'layer-1'
        });
      }

      // Delicate melodic fragments - like birdsong or wind chimes
      const melodyPattern = [0, 2, 4, 2, 3, 1, 4, 3, 0, 1, 3, 4, 2, 0, 3, 1];
      for (let i = 0; i < melodyPattern.length; i++) {
        const pitchIdx = 4 + melodyPattern[i] * 2;
        const beat = i * 2;
        if (beat >= 32) break;
        if (Math.random() > 0.15) { // slight organic randomness
          notes.push({
            beatPos: beat,
            pitchIdx: Math.min(23, pitchIdx),
            shape: i % 3 === 0 ? 'star' : 'triangle',
            size: i % 4 === 0 ? 4 : 2,
            opacity: 0.3 + Math.sin(i * 0.5) * 0.15,
            color: NOTE_COLORS[melodyPattern[i] % 7],
            layer: 'layer-1'
          });
        }
      }

      // Gentle rhythmic texture - like raindrops on leaves
      for (let i = 0; i < 32; i++) {
        if (i % 3 === 0 || i % 5 === 0) {
          notes.push({
            beatPos: i,
            pitchIdx: 2 + Math.floor(Math.sin(i * 0.7) * 2 + 2),
            shape: 'star',
            size: 1,
            opacity: 0.15 + Math.random() * 0.2,
            color: '#FFD93D',
            layer: 'layer-3'
          });
        }
      }

      // Sub-bass foundation - deep earth vibration
      for (let bar = 0; bar < 8; bar++) {
        if (bar % 2 === 0) {
          notes.push({
            beatPos: bar * 4,
            pitchIdx: 20,
            shape: 'circle',
            size: 8,
            opacity: 0.35,
            color: '#6BCB77',
            layer: 'layer-2'
          });
        }
      }

      return notes;
    }
  }
};

function applyPreset(presetName) {
  const preset = PRESETS[presetName];
  if (!preset) return;

  saveUndoState();

  const scale = SCALES[state.musicKey];
  const generatedNotes = preset.generate(scale);

  for (const gn of generatedNotes) {
    const layerId = gn.layer || state.activeLayerId;
    const pitch = state.pitchMap[gn.pitchIdx];
    if (!pitch || pitch.name === '-') continue;

    // Check overlap
    const overlapping = state.notes.find(n =>
      n.layerId === layerId &&
      n.pitchRow === gn.pitchIdx &&
      n.beatPos < gn.beatPos + gn.size &&
      gn.beatPos < n.beatPos + n.sizeFactor
    );
    if (overlapping) continue;

    state.notes.push({
      id: `note-${++state.noteIdCounter}`,
      layerId,
      beatPos: gn.beatPos,
      pitchRow: gn.pitchIdx,
      shape: gn.shape,
      color: gn.color,
      sizeFactor: gn.size,
      opacity: gn.opacity,
      pitchName: pitch.name,
      frequency: pitch.freq,
    });
  }

  render();
}

// ====== Export ======
async function exportWav() {
  const modal = document.getElementById('export-modal');
  const progress = document.getElementById('export-progress');
  const options = document.querySelector('.export-options');
  const fill = document.getElementById('progress-fill');
  const status = document.getElementById('export-status');

  options.style.display = 'none';
  progress.style.display = 'block';
  status.textContent = 'WAV 파일 생성 중...';

  await audioEngine.init();

  const secondsPerBeat = 60 / state.bpm;
  const totalDuration = renderer.totalBeats * secondsPerBeat;
  const audioNotes = getPlayableNotes(secondsPerBeat);

  try {
    const blob = await audioEngine.exportWav(audioNotes, totalDuration, (p) => {
      fill.style.width = (p * 100) + '%';
    });

    status.textContent = '다운로드 준비 완료!';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `soundcanvas-${Date.now()}.wav`;
    a.click();
    URL.revokeObjectURL(url);

    setTimeout(() => {
      modal.style.display = 'none';
      options.style.display = '';
      progress.style.display = 'none';
      fill.style.width = '0';
    }, 1500);
  } catch (e) {
    status.textContent = '오류가 발생했습니다: ' + e.message;
    console.error(e);
  }
}

function exportMidi() {
  const secondsPerBeat = 60 / state.bpm;
  const audioNotes = getPlayableNotes(secondsPerBeat);

  const blob = midiExporter.export(audioNotes, state.bpm);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `soundcanvas-${Date.now()}.mid`;
  a.click();
  URL.revokeObjectURL(url);

  document.getElementById('export-modal').style.display = 'none';
}

function exportProject() {
  const project = {
    version: 1,
    notes: state.notes,
    layers: state.layers,
    bpm: state.bpm,
    musicKey: state.musicKey,
    timestamp: new Date().toISOString(),
  };

  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `soundcanvas-project-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  document.getElementById('export-modal').style.display = 'none';
}

function importProject(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const project = JSON.parse(e.target.result);
      if (project.version && project.notes) {
        saveUndoState();
        state.notes = project.notes;
        state.layers = project.layers || state.layers;
        state.bpm = project.bpm || 120;
        state.musicKey = project.musicKey || 'C';
        state.noteIdCounter = Math.max(...state.notes.map(n => parseInt(n.id.split('-')[1]) || 0), state.noteIdCounter);

        document.getElementById('tempo').value = state.bpm;
        document.getElementById('music-key').value = state.musicKey;

        buildPitchMap();
        buildPitchLabels();
        buildColorPalette();
        updateLayersList();
        render();
      }
    } catch (err) {
      console.error('Invalid project file:', err);
    }
  };
  reader.readAsText(file);
}

// ====== Event Binding ======
function bindEvents() {
  const canvas = document.getElementById('main-canvas');

  // Canvas interaction
  let isDragging = false;
  let dragStartNote = null;

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handleCanvasInteraction(e);
    isDragging = true;
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    if (state.currentMode === 'draw') {
      handleCanvasInteraction(e);
    }
  });

  canvas.addEventListener('pointerup', () => {
    isDragging = false;
    dragStartNote = null;
  });

  canvas.addEventListener('pointerleave', () => {
    isDragging = false;
  });

  // Shape buttons
  document.querySelectorAll('.tool-btn[data-shape]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool-btn[data-shape]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentShape = btn.dataset.shape;
    });
  });

  // Size buttons
  document.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentSize = parseInt(btn.dataset.size);
    });
  });

  // Mode buttons
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentMode = btn.dataset.mode;
      const canvas = document.getElementById('main-canvas');
      canvas.className = '';
      canvas.classList.add(`mode-${state.currentMode}`);
    });
  });

  // Opacity slider
  const opacitySlider = document.getElementById('opacity-slider');
  opacitySlider.addEventListener('input', () => {
    state.currentOpacity = opacitySlider.value / 100;
    document.getElementById('volume-display').textContent = opacitySlider.value + '%';
  });

  // Custom color
  document.getElementById('custom-color').addEventListener('input', (e) => {
    state.currentColor = e.target.value;
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
  });

  // Transport
  document.getElementById('btn-play').addEventListener('click', togglePlay);
  document.getElementById('btn-rewind').addEventListener('click', () => {
    stopPlayback();
    const wrapper = document.getElementById('canvas-scroll-wrapper');
    wrapper.scrollLeft = 0;
  });
  document.getElementById('btn-loop').addEventListener('click', (e) => {
    state.loopEnabled = !state.loopEnabled;
    e.currentTarget.classList.toggle('active', state.loopEnabled);
  });

  // Tempo
  const tempoInput = document.getElementById('tempo');
  const tempoLabel = document.getElementById('tempo-label');
  function updateTempoLabel(val) {
    if (!tempoLabel) return;
    // Show musical tempo marking
    if (val < 60) tempoLabel.textContent = 'Largo';
    else if (val < 80) tempoLabel.textContent = 'Adagio';
    else if (val < 100) tempoLabel.textContent = 'Andante';
    else if (val < 120) tempoLabel.textContent = 'Moderato';
    else if (val < 140) tempoLabel.textContent = 'Allegro';
    else if (val < 170) tempoLabel.textContent = 'Vivace';
    else tempoLabel.textContent = 'Presto';
  }
  tempoInput.addEventListener('change', (e) => {
    state.bpm = Math.max(40, Math.min(240, parseInt(e.target.value) || 120));
    e.target.value = state.bpm;
    updateTempoLabel(state.bpm);
  });
  updateTempoLabel(state.bpm);

  // Key change
  document.getElementById('music-key').addEventListener('change', (e) => {
    state.musicKey = e.target.value;
    buildPitchMap();
    buildPitchLabels();
    buildColorPalette();
    buildChordGuide();
    // Update existing note frequencies
    for (const note of state.notes) {
      const pitch = state.pitchMap[note.pitchRow];
      if (pitch) {
        note.pitchName = pitch.name;
        note.frequency = pitch.freq;
      }
    }
    render();
  });

  // Undo/Redo
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);

  // Clear
  document.getElementById('btn-clear').addEventListener('click', () => {
    if (state.notes.length === 0) return;
    if (confirm('모든 노트를 지울까요?')) {
      saveUndoState();
      state.notes = [];
      state.selectedNoteId = null;
      updateNoteProperties(null);
      render();
    }
  });

  // Delete selected note
  document.getElementById('btn-delete-note').addEventListener('click', () => {
    if (state.selectedNoteId) {
      deleteNote(state.selectedNoteId);
    }
  });

  // Add layer
  document.getElementById('btn-add-layer').addEventListener('click', addLayer);

  // Export
  document.getElementById('btn-export').addEventListener('click', () => {
    document.getElementById('export-modal').style.display = '';
    document.querySelector('.export-options').style.display = '';
    document.getElementById('export-progress').style.display = 'none';
  });
  document.getElementById('modal-close').addEventListener('click', () => {
    document.getElementById('export-modal').style.display = 'none';
  });
  document.getElementById('export-wav').addEventListener('click', exportWav);
  document.getElementById('export-midi').addEventListener('click', exportMidi);
  document.getElementById('export-json').addEventListener('click', exportProject);

  // Presets
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      applyPreset(btn.dataset.preset);
    });
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    if (e.key === ' ') {
      e.preventDefault();
      togglePlay();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      redo();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (state.selectedNoteId) {
        e.preventDefault();
        deleteNote(state.selectedNoteId);
      }
    } else if (e.key === '1') {
      setMode('draw');
    } else if (e.key === '2') {
      setMode('select');
    } else if (e.key === '3') {
      setMode('erase');
    }
  });

  // Drag and drop import
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    document.getElementById('import-overlay').style.display = '';
  });
  document.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null) {
      document.getElementById('import-overlay').style.display = 'none';
    }
  });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    document.getElementById('import-overlay').style.display = 'none';
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.json')) {
      importProject(file);
    }
  });

  // Onboarding
  document.getElementById('onboarding-close').addEventListener('click', () => {
    document.getElementById('onboarding').classList.add('hidden');
    localStorage.setItem('soundcanvas-seen-onboarding', '1');
  });

  // Mobile toolbar
  document.getElementById('mobile-play')?.addEventListener('click', togglePlay);
  document.getElementById('mobile-export')?.addEventListener('click', () => {
    document.getElementById('export-modal').style.display = '';
  });

  document.querySelectorAll('.mobile-tool[data-mobile-panel]').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.mobilePanel;
      const overlay = document.getElementById('mobile-panel-overlay');
      const content = document.getElementById('mobile-panel-content');
      const isActive = btn.classList.contains('active') && overlay.classList.contains('visible');

      // Toggle off if already open
      if (isActive) {
        overlay.classList.remove('visible');
        return;
      }

      document.querySelectorAll('.mobile-tool').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      content.innerHTML = '';

      if (panel === 'tools') {
        // Clone shapes + modes
        content.innerHTML = `
          <h3 style="font-size:13px;font-weight:600;margin-bottom:10px">도형 = 소리 종류</h3>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:16px">
            ${['circle','square','triangle','diamond','star','hexagon'].map(s => {
              const names = {circle:'부드러운',square:'전자',triangle:'맑은',diamond:'날카로운',star:'벨',hexagon:'타악기'};
              return `<button class="tool-btn mobile-shape-btn ${state.currentShape===s?'active':''}" data-shape="${s}" style="padding:12px 4px">
                <span style="font-size:13px">${names[s]}</span>
              </button>`;
            }).join('')}
          </div>
          <h3 style="font-size:13px;font-weight:600;margin-bottom:10px">크기 = 울림 길이</h3>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:16px">
            ${[{s:1,l:'톡'},{s:2,l:'보통'},{s:4,l:'길게'},{s:8,l:'깔기'}].map(({s,l}) =>
              `<button class="size-btn mobile-size-btn ${state.currentSize===s?'active':''}" data-size="${s}" style="padding:10px 4px">
                <div class="size-preview" style="width:${8+s*4}px;height:${8+s*4}px;background:currentColor;border-radius:50%;opacity:0.5"></div>
                <span>${l}</span>
              </button>`
            ).join('')}
          </div>
          <h3 style="font-size:13px;font-weight:600;margin-bottom:10px">도구</h3>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
            <button class="mode-btn mobile-mode-btn ${state.currentMode==='draw'?'active':''}" data-mode="draw" style="padding:10px">그리기</button>
            <button class="mode-btn mobile-mode-btn ${state.currentMode==='select'?'active':''}" data-mode="select" style="padding:10px">선택</button>
            <button class="mode-btn mobile-mode-btn ${state.currentMode==='erase'?'active':''}" data-mode="erase" style="padding:10px">지우개</button>
          </div>
        `;
        // Bind mobile shape/size/mode
        content.querySelectorAll('.mobile-shape-btn').forEach(b => {
          b.addEventListener('click', () => {
            content.querySelectorAll('.mobile-shape-btn').forEach(x=>x.classList.remove('active'));
            b.classList.add('active');
            state.currentShape = b.dataset.shape;
            document.querySelectorAll('#toolbar .tool-btn[data-shape]').forEach(x => x.classList.toggle('active', x.dataset.shape === b.dataset.shape));
          });
        });
        content.querySelectorAll('.mobile-size-btn').forEach(b => {
          b.addEventListener('click', () => {
            content.querySelectorAll('.mobile-size-btn').forEach(x=>x.classList.remove('active'));
            b.classList.add('active');
            state.currentSize = parseInt(b.dataset.size);
          });
        });
        content.querySelectorAll('.mobile-mode-btn').forEach(b => {
          b.addEventListener('click', () => {
            content.querySelectorAll('.mobile-mode-btn').forEach(x=>x.classList.remove('active'));
            b.classList.add('active');
            setMode(b.dataset.mode);
          });
        });
      } else if (panel === 'colors') {
        const scale = SCALES[state.musicKey];
        content.innerHTML = `
          <h3 style="font-size:13px;font-weight:600;margin-bottom:10px">색상 = 높낮이</h3>
          <div style="display:grid;grid-template-columns:repeat(${Math.min(scale.notes.length, 5)},1fr);gap:8px;margin-bottom:16px">
            ${scale.notes.map((n, i) => {
              const c = NOTE_COLORS[i % NOTE_COLORS.length];
              return `<div class="color-swatch mobile-color-btn ${state.currentColor===c?'active':''}" data-color="${c}" style="background:${c};aspect-ratio:1;border-radius:10px;cursor:pointer;min-height:44px"></div>`;
            }).join('')}
          </div>
          <h3 style="font-size:13px;font-weight:600;margin-bottom:10px">투명도 = 볼륨</h3>
          <input type="range" class="styled-range" id="mobile-opacity" min="10" max="100" value="${Math.round(state.currentOpacity*100)}" style="width:100%;margin:8px 0">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted)"><span>여리게</span><span>세게</span></div>
        `;
        content.querySelectorAll('.mobile-color-btn').forEach(b => {
          b.addEventListener('click', () => {
            content.querySelectorAll('.mobile-color-btn').forEach(x=>x.classList.remove('active'));
            b.classList.add('active');
            state.currentColor = b.dataset.color;
          });
        });
        const mobileOpacity = content.querySelector('#mobile-opacity');
        if (mobileOpacity) {
          mobileOpacity.addEventListener('input', () => {
            state.currentOpacity = mobileOpacity.value / 100;
          });
        }
      } else if (panel === 'props') {
        content.innerHTML = `
          <h3 style="font-size:13px;font-weight:600;margin-bottom:10px">분위기</h3>
          <select id="mobile-key" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border-color);font-size:14px;margin-bottom:16px;background:var(--bg-surface)">
            <option value="C" ${state.musicKey==='C'?'selected':''}>밝은</option>
            <option value="G" ${state.musicKey==='G'?'selected':''}>따뜻한</option>
            <option value="D" ${state.musicKey==='D'?'selected':''}>힘찬</option>
            <option value="F" ${state.musicKey==='F'?'selected':''}>편안한</option>
            <option value="Am" ${state.musicKey==='Am'?'selected':''}>슬픈</option>
            <option value="Em" ${state.musicKey==='Em'?'selected':''}>어두운</option>
            <option value="Dm" ${state.musicKey==='Dm'?'selected':''}>감성적</option>
            <option value="pentatonic" ${state.musicKey==='pentatonic'?'selected':''}>동양적</option>
          </select>
          <h3 style="font-size:13px;font-weight:600;margin-bottom:10px">속도</h3>
          <input type="range" class="styled-range" id="mobile-tempo" min="40" max="240" value="${state.bpm}" style="width:100%;margin:8px 0">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted)"><span>느리게</span><span id="mobile-tempo-label">${state.bpm < 100 ? '느린' : state.bpm < 130 ? '보통' : '빠른'}</span><span>빠르게</span></div>
          <div style="margin-top:16px;display:flex;gap:8px">
            <button id="mobile-undo" style="flex:1;padding:10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-surface);font-size:13px;cursor:pointer">되돌리기</button>
            <button id="mobile-clear" style="flex:1;padding:10px;border-radius:8px;border:1px solid rgba(255,59,92,0.3);background:rgba(255,59,92,0.08);color:var(--accent);font-size:13px;cursor:pointer">전체 지우기</button>
          </div>
        `;
        const mobileKey = content.querySelector('#mobile-key');
        mobileKey?.addEventListener('change', () => {
          state.musicKey = mobileKey.value;
          document.getElementById('music-key').value = mobileKey.value;
          buildPitchMap();
          buildPitchLabels();
          buildColorPalette();
          for (const note of state.notes) {
            const pitch = state.pitchMap[note.pitchRow];
            if (pitch) { note.pitchName = pitch.name; note.frequency = pitch.freq; }
          }
          render();
        });
        const mobileTempo = content.querySelector('#mobile-tempo');
        mobileTempo?.addEventListener('input', () => {
          const v = parseInt(mobileTempo.value);
          state.bpm = v;
          document.getElementById('tempo').value = v;
          const lbl = content.querySelector('#mobile-tempo-label');
          if (lbl) lbl.textContent = v < 70 ? '매우 느린' : v < 100 ? '느린' : v < 130 ? '보통' : v < 160 ? '빠른' : '매우 빠른';
        });
        content.querySelector('#mobile-undo')?.addEventListener('click', undo);
        content.querySelector('#mobile-clear')?.addEventListener('click', () => {
          if (state.notes.length && confirm('모든 도형을 지울까요?')) {
            saveUndoState();
            state.notes = [];
            state.selectedNoteId = null;
            updateNoteProperties(null);
            render();
          }
        });
      }

      overlay.classList.add('visible');
    });
  });

  // Close mobile panel when tapping canvas
  document.getElementById('canvas-scroll-wrapper')?.addEventListener('pointerdown', () => {
    const overlay = document.getElementById('mobile-panel-overlay');
    if (overlay) overlay.classList.remove('visible');
  });

  // Window resize
  window.addEventListener('resize', () => {
    setTimeout(() => {
      buildPitchLabels();
      buildBeatLabels();
      render();
    }, 100);
  });
}

function setMode(mode) {
  state.currentMode = mode;
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  const canvas = document.getElementById('main-canvas');
  canvas.className = `mode-${mode}`;
}

function handleCanvasInteraction(e) {
  const canvas = document.getElementById('main-canvas');
  const { beatPos, pitchRow } = renderer.canvasToGrid(e.clientX, e.clientY);

  switch (state.currentMode) {
    case 'draw': {
      const existingNote = renderer.findNoteAt(state.notes, e.clientX, e.clientY);
      if (existingNote) {
        selectNote(existingNote);
        return;
      }
      const note = createNote(beatPos, pitchRow);
      addNote(note);
      break;
    }
    case 'select': {
      const note = renderer.findNoteAt(state.notes, e.clientX, e.clientY);
      selectNote(note);
      break;
    }
    case 'erase': {
      const note = renderer.findNoteAt(state.notes, e.clientX, e.clientY);
      if (note) deleteNote(note.id);
      break;
    }
  }
}

// ====== Chord Progression System ======
// Chord degrees for each key (diatonic triads)
const CHORD_DEGREES = {
  major: [
    { degree: 'I', type: 'Major', suffix: '', desc: '으뜸화음 (Tonic) - 안정적' },
    { degree: 'ii', type: 'minor', suffix: 'm', desc: '윗으뜸화음 - 부드러운 움직임' },
    { degree: 'iii', type: 'minor', suffix: 'm', desc: '셋째화음 - 감성적' },
    { degree: 'IV', type: 'Major', suffix: '', desc: '버금딸림화음 (Subdominant) - 편안한' },
    { degree: 'V', type: 'Major', suffix: '', desc: '딸림화음 (Dominant) - 긴장감' },
    { degree: 'vi', type: 'minor', suffix: 'm', desc: '여섯째화음 - 슬프고 서정적' },
    { degree: 'vii°', type: 'dim', suffix: 'dim', desc: '일곱째화음 - 불안한' },
  ],
  minor: [
    { degree: 'i', type: 'minor', suffix: 'm', desc: '으뜸화음 - 어둡고 안정적' },
    { degree: 'ii°', type: 'dim', suffix: 'dim', desc: '둘째화음 - 불안한' },
    { degree: 'III', type: 'Major', suffix: '', desc: '셋째화음 - 밝은 전환' },
    { degree: 'iv', type: 'minor', suffix: 'm', desc: '넷째화음 - 깊은 감정' },
    { degree: 'v', type: 'minor', suffix: 'm', desc: '다섯째화음 - 긴장' },
    { degree: 'VI', type: 'Major', suffix: '', desc: '여섯째화음 - 희망적' },
    { degree: 'VII', type: 'Major', suffix: '', desc: '일곱째화음 - 열린 느낌' },
  ],
  pentatonic: [
    { degree: 'I', type: 'Major', suffix: '', desc: '으뜸화음' },
    { degree: 'ii', type: 'minor', suffix: 'm', desc: '둘째화음' },
    { degree: 'IV', type: 'Major', suffix: '', desc: '넷째화음' },
    { degree: 'V', type: 'Major', suffix: '', desc: '다섯째화음' },
  ]
};

// Famous chord progressions
const FAMOUS_PROGRESSIONS = [
  { name: 'I - V - vi - IV', desc: '팝 명곡 진행 (캐논 변형)', degrees: [0, 4, 5, 3], emoji: '🎵' },
  { name: 'I - IV - V - I', desc: '클래식 기본 진행', degrees: [0, 3, 4, 0], emoji: '🎼' },
  { name: 'vi - IV - I - V', desc: '감성 발라드 진행', degrees: [5, 3, 0, 4], emoji: '💜' },
  { name: 'I - vi - IV - V', desc: '50s 올디스 진행 (도와프)', degrees: [0, 5, 3, 4], emoji: '🎶' },
  { name: 'ii - V - I', desc: '재즈 기본 진행', degrees: [1, 4, 0], emoji: '🎷' },
  { name: 'I - V - vi - iii - IV', desc: '캐논 진행', degrees: [0, 4, 5, 2, 3], emoji: '✨' },
];

function buildChordGuide() {
  const guidePanel = document.getElementById('chord-guide-panel');
  if (!guidePanel) return;

  const scale = SCALES[state.musicKey];
  const scaleType = scale.type === 'pentatonic' ? 'pentatonic' : scale.type;
  const degrees = CHORD_DEGREES[scaleType] || CHORD_DEGREES.major;

  // Build chord buttons
  const chordBtns = document.getElementById('chord-buttons');
  if (chordBtns) {
    chordBtns.innerHTML = '';
    degrees.forEach((chord, idx) => {
      const root = scale.notes[idx % scale.notes.length];
      const btn = document.createElement('button');
      btn.className = 'chord-btn';
      btn.innerHTML = `
        <span class="chord-name">${root}${chord.suffix}</span>
        <span class="chord-degree">${chord.degree}</span>
        <span class="chord-desc">${chord.desc}</span>
      `;
      btn.title = `${root}${chord.suffix} 코드 배치 - ${chord.desc}`;
      btn.addEventListener('click', () => placeChord(idx, chord));
      chordBtns.appendChild(btn);
    });
  }

  // Build progression list
  const progList = document.getElementById('progression-list');
  if (progList) {
    progList.innerHTML = '';
    FAMOUS_PROGRESSIONS.forEach(prog => {
      // Only show progressions that fit the current scale
      const maxDegree = Math.max(...prog.degrees);
      if (maxDegree >= degrees.length) return;

      const chordNames = prog.degrees.map(d => {
        const root = scale.notes[d % scale.notes.length];
        return root + degrees[d].suffix;
      }).join(' → ');

      const btn = document.createElement('button');
      btn.className = 'progression-btn';
      btn.innerHTML = `
        <span class="prog-emoji">${prog.emoji}</span>
        <span class="prog-info">
          <span class="prog-name">${prog.name}</span>
          <span class="prog-chords">${chordNames}</span>
          <span class="prog-desc">${prog.desc}</span>
        </span>
      `;
      btn.addEventListener('click', () => placeProgression(prog, degrees, scale));
      progList.appendChild(btn);
    });
  }
}

function placeChord(degreeIdx, chordInfo) {
  const scale = SCALES[state.musicKey];
  const scaleNotes = scale.notes;

  // Find next available beat position
  const usedBeats = state.notes.filter(n => n.layerId === state.activeLayerId).map(n => n.beatPos);
  let startBeat = 0;
  while (usedBeats.some(b => Math.abs(b - startBeat) < 4)) {
    startBeat += 4;
    if (startBeat >= renderer.totalBeats) { startBeat = 0; break; }
  }

  // Build chord tones (root, 3rd, 5th)
  const rootIdx = degreeIdx % scaleNotes.length;
  const thirdIdx = (rootIdx + 2) % scaleNotes.length;
  const fifthIdx = (rootIdx + 4) % scaleNotes.length;

  saveUndoState();

  // Find pitch rows for these notes
  const chordTones = [rootIdx, thirdIdx, fifthIdx];
  chordTones.forEach((noteIdx, i) => {
    // Find the matching pitch row in the middle register
    const targetNote = scaleNotes[noteIdx];
    let bestRow = -1;
    let bestDist = Infinity;
    const midRow = Math.floor(renderer.totalPitchRows / 2);

    for (let row = 0; row < state.pitchMap.length; row++) {
      const p = state.pitchMap[row];
      if (p.displayName === targetNote) {
        const dist = Math.abs(row - midRow + i * 2); // spread out slightly
        if (dist < bestDist) {
          bestDist = dist;
          bestRow = row;
        }
      }
    }

    if (bestRow >= 0) {
      const pitch = state.pitchMap[bestRow];
      const colors = [NOTE_COLORS[rootIdx % 7], NOTE_COLORS[thirdIdx % 7], NOTE_COLORS[fifthIdx % 7]];
      const note = {
        id: `note-${++state.noteIdCounter}`,
        layerId: state.activeLayerId,
        beatPos: startBeat,
        pitchRow: bestRow,
        shape: state.currentShape,
        color: colors[i],
        sizeFactor: 4, // quarter note
        opacity: state.currentOpacity,
        pitchName: pitch.name,
        frequency: pitch.freq,
      };

      // Check overlap
      const overlap = state.notes.find(n =>
        n.layerId === note.layerId && n.pitchRow === note.pitchRow &&
        n.beatPos < note.beatPos + note.sizeFactor && note.beatPos < n.beatPos + n.sizeFactor
      );
      if (!overlap) {
        state.notes.push(note);
      }
    }
  });

  render();

  // Play preview of the chord
  audioEngine.init().then(() => {
    chordTones.forEach((noteIdx, i) => {
      const targetNote = scaleNotes[noteIdx];
      for (let row = 0; row < state.pitchMap.length; row++) {
        if (state.pitchMap[row].displayName === targetNote && state.pitchMap[row].octave === 4) {
          audioEngine.playNote({
            frequency: state.pitchMap[row].freq,
            shape: state.currentShape,
            volume: state.currentOpacity * 0.4,
            duration: 0.8,
          });
          break;
        }
      }
    });
  });
}

function placeProgression(prog, degrees, scale) {
  saveUndoState();

  prog.degrees.forEach((degIdx, barIdx) => {
    const startBeat = barIdx * 4;
    if (startBeat >= renderer.totalBeats) return;

    const scaleNotes = scale.notes;
    const rootIdx = degIdx % scaleNotes.length;
    const thirdIdx = (rootIdx + 2) % scaleNotes.length;
    const fifthIdx = (rootIdx + 4) % scaleNotes.length;

    [rootIdx, thirdIdx, fifthIdx].forEach((noteIdx, i) => {
      const targetNote = scaleNotes[noteIdx];
      let bestRow = -1;
      let bestDist = Infinity;
      const midRow = Math.floor(renderer.totalPitchRows / 2);

      for (let row = 0; row < state.pitchMap.length; row++) {
        const p = state.pitchMap[row];
        if (p.displayName === targetNote) {
          const dist = Math.abs(row - midRow + i * 2);
          if (dist < bestDist) { bestDist = dist; bestRow = row; }
        }
      }

      if (bestRow >= 0) {
        const pitch = state.pitchMap[bestRow];
        const note = {
          id: `note-${++state.noteIdCounter}`,
          layerId: state.activeLayerId,
          beatPos: startBeat,
          pitchRow: bestRow,
          shape: state.currentShape,
          color: NOTE_COLORS[noteIdx % 7],
          sizeFactor: 4,
          opacity: state.currentOpacity,
          pitchName: pitch.name,
          frequency: pitch.freq,
        };
        const overlap = state.notes.find(n =>
          n.layerId === note.layerId && n.pitchRow === note.pitchRow &&
          n.beatPos < note.beatPos + note.sizeFactor && note.beatPos < n.beatPos + n.sizeFactor
        );
        if (!overlap) state.notes.push(note);
      }
    });
  });

  render();
}

// ====== Start ======
function init() {
  const canvas = document.getElementById('main-canvas');
  renderer = new CanvasRenderer(canvas);

  buildPitchMap();
  buildPitchLabels();
  buildBeatLabels();
  buildColorPalette();
  buildChordGuide();
  updateLayersList();
  render();
  bindEvents();

  // Onboarding
  if (!localStorage.getItem('soundcanvas-seen-onboarding')) {
    document.getElementById('onboarding').classList.remove('hidden');
  } else {
    document.getElementById('onboarding').classList.add('hidden');
  }
}
document.addEventListener('DOMContentLoaded', init);
