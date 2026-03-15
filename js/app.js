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
  loopEnabled: true,
  swing: 0, // 0-100, percentage of swing feel
  undoStack: [],
  redoStack: [],
  noteIdCounter: 0,
  pitchMap: [], // maps row index to {name, freq}
};

let renderer;
let animFrameId;
let isMobile = window.innerWidth <= 640;
let seqCurrentBar = 0; // which 4-beat bar is shown in step sequencer
const SEQ_BEATS_PER_BAR = 4;
const SEQ_TOTAL_BARS = 8;

// Loop section system: song = multiple 4-bar loop sections
const BEATS_PER_LOOP = 16; // 4 bars × 4 beats = 16 beats per loop
let currentLoopSection = 0; // which loop section we're editing
let totalLoopSections = 1; // start with 1 loop, can add more
let seqSubdivision = 2; // steps per beat: 1=quarter, 2=eighth, 4=sixteenth
let seqPlayingCol = -1; // currently playing column index for highlight

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
  if (renderer) {
    renderer.render(state.notes, state.selectedNoteId, state.activeLayerId, state.layers);
  }
  if (isMobile) {
    renderStepSequencer();
  }
}

// ====== Step Sequencer (Mobile) ======
function buildStepSequencer() {
  const container = document.getElementById('step-sequencer');
  if (!container) return;

  const scale = SCALES[state.musicKey];
  // Use 2 octaves for pentatonic (fewer notes), 1 for others
  const octave = 4;
  const pitchRows = [];
  const octaves = scale.type === 'pentatonic' ? [5, 4] : [4];
  for (const oct of octaves) {
    for (let i = scale.notes.length - 1; i >= 0; i--) {
      const noteName = scale.notes[i];
      const fullName = `${noteName}${oct}`;
      const freq = NOTE_FREQS[fullName];
      if (freq) {
        pitchRows.push({ name: fullName, displayName: noteName, freq, octave: oct, scaleIndex: i });
      }
    }
  }
  // Add octave-up root for diatonic scales
  if (scale.type !== 'pentatonic') {
    const rootUp = `${scale.notes[0]}${octave + 1}`;
    if (NOTE_FREQS[rootUp]) {
      pitchRows.unshift({ name: rootUp, displayName: scale.notes[0], freq: NOTE_FREQS[rootUp], octave: octave + 1, scaleIndex: 0 });
    }
  }

  container._pitchRows = pitchRows;

  // Total columns = beats per loop × subdivision
  const totalCols = BEATS_PER_LOOP * seqSubdivision;
  const loopStart = currentLoopSection * BEATS_PER_LOOP;

  // === Build HTML ===
  let html = '';

  // Top bar: loop tabs + actions
  html += '<div class="seq-top-bar">';
  // Loop section tabs
  html += '<div class="seq-loop-tabs">';
  for (let s = 0; s < totalLoopSections; s++) {
    const hasNotes = state.notes.some(n => n.beatPos >= s * BEATS_PER_LOOP && n.beatPos < (s + 1) * BEATS_PER_LOOP);
    html += `<button class="seq-loop-tab${s === currentLoopSection ? ' active' : ''}${hasNotes ? ' has-notes' : ''}" data-section="${s}">${s + 1}</button>`;
  }
  html += `<button class="seq-loop-tab seq-add-loop" id="seq-add-loop">+</button>`;
  html += '</div>';
  // Actions
  html += '<div class="seq-actions">';
  html += `<button class="seq-action-btn" id="seq-duplicate-loop">복제</button>`;
  html += `<button class="seq-action-btn" id="seq-clear-loop">비우기</button>`;
  html += `<button class="seq-action-btn seq-subdiv-btn${seqSubdivision >= 2 ? ' active' : ''}" id="seq-toggle-subdiv">${seqSubdivision >= 2 ? '×2' : '×1'}</button>`;
  html += '</div>';
  html += '</div>';

  // Grid wrapper (pitch labels fixed, grid scrolls horizontally)
  html += '<div class="seq-grid-wrapper">';

  // Pitch labels (fixed left)
  html += '<div class="seq-pitch-labels">';
  for (const p of pitchRows) {
    const isRoot = p.displayName === scale.notes[0];
    html += `<div class="seq-pitch-label${isRoot ? ' root' : ''}">${p.displayName}<span class="seq-oct">${p.octave}</span></div>`;
  }
  html += '</div>';

  // Scrollable grid area
  html += '<div class="seq-scroll-area" id="seq-scroll-area">';

  // Beat numbers row (top)
  html += '<div class="seq-beat-row">';
  for (let c = 0; c < totalCols; c++) {
    const beat = c / seqSubdivision;
    const isDownbeat = c % seqSubdivision === 0;
    const barNum = Math.floor(beat / 4) + 1;
    const beatInBar = Math.floor(beat % 4) + 1;
    const label = isDownbeat ? `${barNum}.${beatInBar}` : '';
    html += `<div class="seq-beat-num${isDownbeat ? ' downbeat' : ''}" data-col="${c}">${label}</div>`;
  }
  html += '</div>';

  // Grid rows
  html += '<div class="seq-grid" id="seq-grid">';
  for (let r = 0; r < pitchRows.length; r++) {
    const isRoot = pitchRows[r].displayName === scale.notes[0];
    html += `<div class="seq-row${isRoot ? ' root-row' : ''}">`;
    for (let c = 0; c < totalCols; c++) {
      const beatPos = loopStart + c / seqSubdivision;
      const isBarLine = c % (4 * seqSubdivision) === 0;
      const isBeatLine = c % seqSubdivision === 0;
      let cls = 'seq-cell';
      if (isBarLine) cls += ' bar-start';
      else if (isBeatLine) cls += ' beat-start';
      html += `<button class="${cls}" data-row="${r}" data-col="${c}" data-beat="${beatPos}">`;
      html += `<div class="seq-dot"></div>`;
      html += `</button>`;
    }
    html += '</div>';
  }
  html += '</div>'; // seq-grid

  // Playback cursor overlay
  html += '<div class="seq-cursor" id="seq-cursor"></div>';

  html += '</div>'; // seq-scroll-area
  html += '</div>'; // seq-grid-wrapper

  container.innerHTML = html;

  // === Bind Events ===

  // Loop tabs
  container.querySelectorAll('.seq-loop-tab:not(.seq-add-loop)').forEach(tab => {
    tab.addEventListener('click', () => {
      currentLoopSection = parseInt(tab.dataset.section);
      buildStepSequencer();
    });
  });

  // Add loop
  document.getElementById('seq-add-loop')?.addEventListener('click', () => {
    totalLoopSections++;
    currentLoopSection = totalLoopSections - 1;
    updateCanvasTotalBeats();
    buildStepSequencer();
  });

  // Duplicate loop
  document.getElementById('seq-duplicate-loop')?.addEventListener('click', () => {
    const srcStart = currentLoopSection * BEATS_PER_LOOP;
    const srcEnd = srcStart + BEATS_PER_LOOP;
    const srcNotes = state.notes.filter(n => n.beatPos >= srcStart && n.beatPos < srcEnd);
    totalLoopSections++;
    const destStart = (totalLoopSections - 1) * BEATS_PER_LOOP;
    saveUndoState();
    for (const n of srcNotes) {
      state.notes.push({
        ...n,
        id: `note-${++state.noteIdCounter}`,
        beatPos: n.beatPos - srcStart + destStart,
      });
    }
    currentLoopSection = totalLoopSections - 1;
    updateCanvasTotalBeats();
    render();
    buildStepSequencer();
  });

  // Clear loop
  document.getElementById('seq-clear-loop')?.addEventListener('click', () => {
    const loopStartB = currentLoopSection * BEATS_PER_LOOP;
    const loopEndB = loopStartB + BEATS_PER_LOOP;
    const toRemove = state.notes.filter(n => n.beatPos >= loopStartB && n.beatPos < loopEndB);
    if (toRemove.length === 0) return;
    saveUndoState();
    state.notes = state.notes.filter(n => n.beatPos < loopStartB || n.beatPos >= loopEndB);
    render();
    buildStepSequencer();
  });

  // Subdivision toggle
  document.getElementById('seq-toggle-subdiv')?.addEventListener('click', () => {
    seqSubdivision = seqSubdivision >= 2 ? 1 : 2;
    buildStepSequencer();
  });

  // Cell tap — toggle note
  container.querySelectorAll('.seq-cell').forEach(cell => {
    cell.addEventListener('click', (e) => {
      e.preventDefault();
      const row = parseInt(cell.dataset.row);
      const beatPos = parseFloat(cell.dataset.beat);
      const pitch = pitchRows[row];
      if (!pitch) return;

      const pitchRowIdx = getPitchRowForSeq(pitch);
      const stepSize = 1 / seqSubdivision; // note duration = 1 step

      // Find existing note at this position
      const existing = state.notes.find(n =>
        n.pitchRow === pitchRowIdx &&
        Math.abs(n.beatPos - beatPos) < 0.01
      );

      if (existing) {
        saveUndoState();
        state.notes = state.notes.filter(n => n.id !== existing.id);
        render();
        renderStepSequencer();
      } else {
        const note = {
          id: `note-${++state.noteIdCounter}`,
          layerId: state.activeLayerId,
          beatPos,
          pitchRow: pitchRowIdx,
          shape: state.currentShape,
          color: NOTE_COLORS[pitch.scaleIndex % NOTE_COLORS.length],
          sizeFactor: stepSize,
          opacity: state.currentOpacity,
          pitchName: pitch.name,
          frequency: pitch.freq,
        };
        saveUndoState();
        state.notes.push(note);
        render();
        renderStepSequencer();

        // Play preview
        audioEngine.init().then(() => {
          audioEngine.playNote({
            frequency: note.frequency,
            shape: note.shape,
            duration: 0.15,
            volume: note.opacity,
          });
        });
      }
    });
  });

  renderStepSequencer();
}

function updateCanvasTotalBeats() {
  if (renderer) {
    renderer.totalBeats = totalLoopSections * BEATS_PER_LOOP;
    renderer._resize();
  }
}

// Map a step sequencer pitch to the full pitchMap row index
function getPitchRowForSeq(seqPitch) {
  const idx = state.pitchMap.findIndex(p => p.name === seqPitch.name);
  return idx >= 0 ? idx : 0;
}

function renderStepSequencer() {
  const container = document.getElementById('step-sequencer');
  if (!container || !container._pitchRows) return;
  const pitchRows = container._pitchRows;

  container.querySelectorAll('.seq-cell').forEach(cell => {
    const row = parseInt(cell.dataset.row);
    const beatPos = parseFloat(cell.dataset.beat);
    const col = parseInt(cell.dataset.col);
    const pitch = pitchRows[row];
    if (!pitch) return;

    const pitchRowIdx = getPitchRowForSeq(pitch);

    // Find note at exactly this beat position
    const note = state.notes.find(n =>
      n.pitchRow === pitchRowIdx &&
      Math.abs(n.beatPos - beatPos) < 0.01
    );

    const dot = cell.querySelector('.seq-dot');
    if (note) {
      cell.classList.add('active');
      dot.style.display = 'block';
      dot.style.background = note.color;
      dot.style.opacity = note.opacity;
    } else {
      cell.classList.remove('active');
      dot.style.display = 'none';
    }

    // Playback highlight
    cell.classList.toggle('playing', col === seqPlayingCol);
  });
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
  state.undoStack.push(JSON.stringify({
    notes: state.notes,
    totalLoopSections,
    currentLoopSection,
  }));
  if (state.undoStack.length > 50) state.undoStack.shift();
  state.redoStack = [];
}

function undo() {
  if (state.undoStack.length === 0) return;
  state.redoStack.push(JSON.stringify({
    notes: state.notes,
    totalLoopSections,
    currentLoopSection,
  }));
  const snapshot = JSON.parse(state.undoStack.pop());
  state.notes = snapshot.notes;
  if (snapshot.totalLoopSections !== undefined) {
    totalLoopSections = snapshot.totalLoopSections;
    currentLoopSection = snapshot.currentLoopSection;
    updateCanvasTotalBeats();
  }
  state.selectedNoteId = null;
  updateNoteProperties(null);
  render();
  if (isMobile) buildStepSequencer();
}

function redo() {
  if (state.redoStack.length === 0) return;
  state.undoStack.push(JSON.stringify({
    notes: state.notes,
    totalLoopSections,
    currentLoopSection,
  }));
  const snapshot = JSON.parse(state.redoStack.pop());
  state.notes = snapshot.notes;
  if (snapshot.totalLoopSections !== undefined) {
    totalLoopSections = snapshot.totalLoopSections;
    currentLoopSection = snapshot.currentLoopSection;
    updateCanvasTotalBeats();
  }
  render();
  if (isMobile) buildStepSequencer();
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

  // Play current loop section only
  const loopStart = currentLoopSection * BEATS_PER_LOOP;
  const loopEnd = loopStart + BEATS_PER_LOOP;
  const loopDuration = BEATS_PER_LOOP * secondsPerBeat;

  const audioNotes = getPlayableNotes(secondsPerBeat, loopStart, loopEnd);

  if (audioNotes.length === 0) return;

  state.isPlaying = true;
  audioEngine.loopEnabled = state.loopEnabled;

  const playBtn = document.getElementById('btn-play');
  playBtn.classList.add('playing');

  if (!isMobile) {
    const playhead = document.getElementById('playhead');
    if (playhead) playhead.style.display = 'block';

    audioEngine.onPlayheadUpdate = (progress) => {
      const globalBeat = loopStart + progress * BEATS_PER_LOOP;
      const px = globalBeat * (renderer ? renderer.cellWidth : 40);
      const playhead = document.getElementById('playhead');
      if (playhead) playhead.style.left = px + 'px';

      const wrapper = document.getElementById('canvas-scroll-wrapper');
      if (wrapper) {
        const scrollLeft = wrapper.scrollLeft;
        const wrapperWidth = wrapper.clientWidth;
        if (px > scrollLeft + wrapperWidth - 50 || px < scrollLeft) {
          wrapper.scrollLeft = px - 50;
        }
      }
    };
  } else {
    // Mobile: highlight column in step sequencer
    const totalCols = BEATS_PER_LOOP * seqSubdivision;
    audioEngine.onPlayheadUpdate = (progress) => {
      const col = Math.floor(progress * totalCols) % totalCols;
      highlightSeqCol(col);
    };
  }

  audioEngine.onPlaybackEnd = () => {
    stopPlayback();
  };

  audioEngine.play(audioNotes, loopDuration);
}

function highlightSeqCol(colIndex) {
  if (colIndex === seqPlayingCol) return;
  seqPlayingCol = colIndex;

  // Update cursor position
  const cursor = document.getElementById('seq-cursor');
  const grid = document.getElementById('seq-grid');
  if (cursor && grid) {
    const firstCell = grid.querySelector(`.seq-cell[data-col="${colIndex}"]`);
    if (firstCell) {
      cursor.style.display = 'block';
      cursor.style.left = firstCell.offsetLeft + 'px';
      cursor.style.width = firstCell.offsetWidth + 'px';
      cursor.style.height = grid.scrollHeight + 'px';

      // Auto-scroll to keep cursor visible
      const scrollArea = document.getElementById('seq-scroll-area');
      if (scrollArea) {
        const cursorLeft = firstCell.offsetLeft;
        const scrollLeft = scrollArea.scrollLeft;
        const viewWidth = scrollArea.clientWidth;
        if (cursorLeft < scrollLeft + 40 || cursorLeft > scrollLeft + viewWidth - 60) {
          scrollArea.scrollLeft = cursorLeft - 60;
        }
      }
    }
  }

  // Update cell highlights
  document.querySelectorAll('.seq-cell.playing').forEach(c => c.classList.remove('playing'));
  document.querySelectorAll(`.seq-cell[data-col="${colIndex}"]`).forEach(c => c.classList.add('playing'));
}

function clearSeqPlayhead() {
  seqPlayingCol = -1;
  document.querySelectorAll('.seq-cell.playing').forEach(c => c.classList.remove('playing'));
  const cursor = document.getElementById('seq-cursor');
  if (cursor) cursor.style.display = 'none';
}

function stopPlayback() {
  state.isPlaying = false;
  audioEngine.stop();

  const playBtn = document.getElementById('btn-play');
  if (playBtn) playBtn.classList.remove('playing');

  const playhead = document.getElementById('playhead');
  if (playhead) playhead.style.display = 'none';

  clearSeqPlayhead();
}

function getPlayableNotes(secondsPerBeat, beatStart, beatEnd) {
  const mutedLayers = new Set();
  const soloLayers = new Set();
  for (const layer of state.layers) {
    if (layer.muted) mutedLayers.add(layer.id);
    if (layer.solo) soloLayers.add(layer.id);
  }
  const hasSolo = soloLayers.size > 0;

  // If no range specified, play all notes
  const useRange = beatStart !== undefined && beatEnd !== undefined;

  return state.notes
    .filter(n => {
      if (hasSolo ? !soloLayers.has(n.layerId) : mutedLayers.has(n.layerId)) return false;
      if (useRange && (n.beatPos < beatStart || n.beatPos >= beatEnd)) return false;
      return true;
    })
    .map(n => {
      const baseBeat = useRange ? n.beatPos - beatStart : n.beatPos;
      let time = baseBeat * secondsPerBeat;

      // Apply swing: offset every "off-beat" (odd 8th notes)
      if (state.swing > 0) {
        const eighthBeat = baseBeat * 2; // position in 8th notes
        const isOffBeat = Math.abs(eighthBeat - Math.round(eighthBeat)) < 0.01 && Math.round(eighthBeat) % 2 === 1;
        if (isOffBeat) {
          time += (state.swing / 100) * secondsPerBeat * 0.33;
        }
      }

      return {
        time,
        frequency: n.frequency,
        shape: n.shape,
        volume: n.opacity,
        duration: n.sizeFactor * secondsPerBeat,
      };
    });
}

// ====== Presets (including Botanica) ======
const PRESETS = {
  heartbeat: {
    name: '심장박동',
    generate(scale) {
      const notes = [];
      const root = scale.notes[0];
      // Steady pulse rhythm
      for (let bar = 0; bar < 4; bar++) {
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
      for (let bar = 0; bar < 4; bar++) {
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
      for (let bar = 0; bar < 4; bar++) {
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
      for (let bar = 0; bar < 4; bar++) {
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
      for (let bar = 0; bar < 4; bar++) {
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

  // Offset notes to current loop section
  const loopOffset = currentLoopSection * BEATS_PER_LOOP;

  for (const gn of generatedNotes) {
    const layerId = gn.layer || state.activeLayerId;
    const pitch = state.pitchMap[gn.pitchIdx];
    if (!pitch || pitch.name === '-') continue;
    gn.beatPos += loopOffset;

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
  if (isMobile) renderStepSequencer();
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
  const totalBeats = totalLoopSections * BEATS_PER_LOOP;
  const totalDuration = totalBeats * secondsPerBeat;
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
        const noteIds = state.notes.map(n => parseInt(n.id.split('-')[1]) || 0);
        state.noteIdCounter = noteIds.length > 0 ? Math.max(...noteIds, state.noteIdCounter) : state.noteIdCounter;

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
  const wrapper = document.getElementById('canvas-scroll-wrapper');

  // Canvas interaction
  let isDragging = false;
  let lastDrawnCell = null;
  let handledByPointer = false; // track if pointerdown already handled this tap

  // Show visual tap feedback on canvas
  function showTapFeedback(clientX, clientY) {
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const dot = document.createElement('div');
    dot.className = 'tap-feedback';
    dot.style.left = (clientX - rect.left) + 'px';
    dot.style.top = (clientY - rect.top) + 'px';
    wrapper.appendChild(dot);
    setTimeout(() => dot.remove(), 400);
  }

  function handleTap(e) {
    // Close mobile panel if open
    const overlay = document.getElementById('mobile-panel-overlay');
    if (overlay) overlay.classList.remove('visible');

    // Dismiss onboarding if visible
    const onboarding = document.getElementById('onboarding');
    if (onboarding && !onboarding.classList.contains('hidden')) {
      onboarding.classList.add('hidden');
      localStorage.setItem('soundcanvas-seen-onboarding', '1');
      return; // Don't place note on first tap that dismisses onboarding
    }

    showTapFeedback(e.clientX, e.clientY);
    handleCanvasInteraction(e);
  }

  // Pointer events (desktop + modern mobile)
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handledByPointer = true;
    lastDrawnCell = null;
    handleTap(e);
    isDragging = true;
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    if (state.currentMode === 'draw' || state.currentMode === 'erase') {
      const { beatPos, pitchRow } = renderer.canvasToGrid(e.clientX, e.clientY);
      const cellKey = `${beatPos}-${pitchRow}`;
      if (cellKey !== lastDrawnCell) {
        lastDrawnCell = cellKey;
        handleCanvasInteraction(e);
      }
    }
  });

  canvas.addEventListener('pointerup', () => {
    isDragging = false;
    lastDrawnCell = null;
  });

  canvas.addEventListener('pointerleave', () => {
    isDragging = false;
    lastDrawnCell = null;
  });

  // Touch event fallback — handles mobile browsers where pointer events may not fire
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (handledByPointer) {
      handledByPointer = false;
      return; // Already handled by pointerdown
    }
    const touch = e.touches[0];
    if (touch) {
      const syntheticEvent = { clientX: touch.clientX, clientY: touch.clientY };
      handleTap(syntheticEvent);
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (state.currentMode === 'draw' || state.currentMode === 'erase') {
      const touch = e.touches[0];
      if (touch) {
        const { beatPos, pitchRow } = renderer.canvasToGrid(touch.clientX, touch.clientY);
        const cellKey = `${beatPos}-${pitchRow}`;
        if (cellKey !== lastDrawnCell) {
          lastDrawnCell = cellKey;
          handleCanvasInteraction({ clientX: touch.clientX, clientY: touch.clientY });
        }
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchend', () => {
    isDragging = false;
    lastDrawnCell = null;
    handledByPointer = false;
  }, { passive: false });

  // Click fallback for any browser that doesn't fire touch/pointer properly
  canvas.addEventListener('click', (e) => {
    // Only use as last resort — if no note was placed by pointer/touch
    if (!handledByPointer) {
      handleTap(e);
    }
    handledByPointer = false;
  });

  // Also prevent wrapper from stealing touches
  wrapper.addEventListener('touchstart', (e) => { e.preventDefault(); }, { passive: false });
  wrapper.addEventListener('touchmove', (e) => { e.preventDefault(); }, { passive: false });

  // Shape buttons
  document.querySelectorAll('.tool-btn[data-shape]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool-btn[data-shape]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentShape = btn.dataset.shape;
      updateMobileToolIndicator();
    });
  });

  // Size buttons
  document.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentSize = parseInt(btn.dataset.size);
      updateMobileToolIndicator();
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
    if (wrapper) wrapper.scrollLeft = 0;
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
    const mbv = document.getElementById('mobile-bpm-val');
    if (mbv) mbv.textContent = state.bpm;
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
  // Close onboarding — both button and tapping anywhere on overlay
  const closeOnboarding = () => {
    document.getElementById('onboarding').classList.add('hidden');
    localStorage.setItem('soundcanvas-seen-onboarding', '1');
  };
  document.getElementById('onboarding-close').addEventListener('click', closeOnboarding);
  document.getElementById('onboarding').addEventListener('click', closeOnboarding);

  // Mobile toolbar
  document.getElementById('mobile-play')?.addEventListener('click', togglePlay);

  // Mobile BPM button: tap to cycle through BPM presets
  const mobileBpmBtn = document.getElementById('mobile-bpm-btn');
  if (mobileBpmBtn) {
    const bpmPresets = [80, 90, 100, 110, 120, 130, 140, 160];
    mobileBpmBtn.addEventListener('click', () => {
      const currentIdx = bpmPresets.findIndex(b => b >= state.bpm);
      const nextIdx = (currentIdx + 1) % bpmPresets.length;
      state.bpm = bpmPresets[nextIdx];
      document.getElementById('tempo').value = state.bpm;
      document.getElementById('mobile-bpm-val').textContent = state.bpm;
      const tempoLabel = document.getElementById('tempo-label');
      updateTempoLabel(state.bpm);
    });
  }
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

      if (panel === 'instrument') {
        content.innerHTML = `
          <h3 style="font-size:14px;font-weight:700;margin-bottom:12px">악기 (Timbre)</h3>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
            ${['circle','square','triangle','diamond','star','hexagon'].map(s => {
              const names = {circle:'Sine\n부드러운',square:'Square\n전자',triangle:'Triangle\n맑은',diamond:'Saw\n날카로운',star:'Bell\n벨',hexagon:'Perc\n타악기'};
              return `<button class="tool-btn mobile-shape-btn ${state.currentShape===s?'active':''}" data-shape="${s}" style="padding:14px 6px;min-height:56px">
                <span style="font-size:13px;font-weight:600;white-space:pre-line;line-height:1.3">${names[s]}</span>
              </button>`;
            }).join('')}
          </div>
        `;
        content.querySelectorAll('.mobile-shape-btn').forEach(b => {
          b.addEventListener('click', () => {
            content.querySelectorAll('.mobile-shape-btn').forEach(x=>x.classList.remove('active'));
            b.classList.add('active');
            state.currentShape = b.dataset.shape;
            updateMobileToolIndicator();
          });
        });
      } else if (panel === 'duration') {
        content.innerHTML = `
          <h3 style="font-size:14px;font-weight:700;margin-bottom:12px">음표 길이 (Duration)</h3>
          <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">셀 하나가 1비트. 길이를 늘리면 여러 셀을 차지합니다.</p>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px">
            ${[{s:1,l:'16분음표',d:'½비트'},{s:2,l:'8분음표',d:'1비트'},{s:4,l:'4분음표',d:'2비트'},{s:8,l:'2분음표',d:'4비트'}].map(({s,l,d}) =>
              `<button class="size-btn mobile-size-btn ${state.currentSize===s?'active':''}" data-size="${s}" style="padding:14px 4px;min-height:56px;flex-direction:column;display:flex;align-items:center;gap:4px">
                <span style="font-weight:700;font-size:13px">${d}</span>
                <span style="font-size:10px;color:var(--text-muted)">${l}</span>
              </button>`
            ).join('')}
          </div>
          <h3 style="font-size:14px;font-weight:700;margin-bottom:12px">셈여림 (Dynamics)</h3>
          <input type="range" class="styled-range" id="mobile-opacity" min="10" max="100" value="${Math.round(state.currentOpacity*100)}" style="width:100%;margin:10px 0;height:6px">
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);font-weight:500"><span>pp 여리게</span><span id="mobile-vol-label">${Math.round(state.currentOpacity*100)}%</span><span>ff 세게</span></div>
        `;
        content.querySelectorAll('.mobile-size-btn').forEach(b => {
          b.addEventListener('click', () => {
            content.querySelectorAll('.mobile-size-btn').forEach(x=>x.classList.remove('active'));
            b.classList.add('active');
            state.currentSize = parseInt(b.dataset.size);
            updateMobileToolIndicator();
          });
        });
        const mobileOpacity = content.querySelector('#mobile-opacity');
        if (mobileOpacity) {
          mobileOpacity.addEventListener('input', () => {
            state.currentOpacity = mobileOpacity.value / 100;
            const lbl = content.querySelector('#mobile-vol-label');
            if (lbl) lbl.textContent = mobileOpacity.value + '%';
          });
        }
      } else if (panel === 'settings') {
        content.innerHTML = `
          <h3 style="font-size:14px;font-weight:700;margin-bottom:12px">조성 (Key)</h3>
          <select id="mobile-key" style="width:100%;padding:14px;border-radius:10px;border:1px solid var(--border-color);font-size:15px;margin-bottom:18px;background:var(--bg-surface);font-weight:500">
            <option value="C" ${state.musicKey==='C'?'selected':''}>C Major - 밝은</option>
            <option value="G" ${state.musicKey==='G'?'selected':''}>G Major - 따뜻한</option>
            <option value="D" ${state.musicKey==='D'?'selected':''}>D Major - 힘찬</option>
            <option value="F" ${state.musicKey==='F'?'selected':''}>F Major - 편안한</option>
            <option value="Am" ${state.musicKey==='Am'?'selected':''}>A minor - 슬픈</option>
            <option value="Em" ${state.musicKey==='Em'?'selected':''}>E minor - 어두운</option>
            <option value="Dm" ${state.musicKey==='Dm'?'selected':''}>D minor - 감성적</option>
            <option value="pentatonic" ${state.musicKey==='pentatonic'?'selected':''}>Pentatonic - 동양적</option>
          </select>
          <h3 style="font-size:14px;font-weight:700;margin-bottom:12px">BPM (속도)</h3>
          <input type="range" class="styled-range" id="mobile-tempo" min="40" max="240" value="${state.bpm}" style="width:100%;margin:10px 0;height:6px">
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);font-weight:500"><span>Largo</span><span id="mobile-tempo-label">${state.bpm} BPM</span><span>Presto</span></div>
          <h3 style="font-size:14px;font-weight:700;margin:18px 0 12px">스윙 (Groove)</h3>
          <input type="range" class="styled-range" id="mobile-swing" min="0" max="80" value="${state.swing}" style="width:100%;margin:10px 0;height:6px">
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);font-weight:500"><span>직선적</span><span id="mobile-swing-label">${state.swing}%</span><span>그루비</span></div>
          <div style="margin-top:20px;display:flex;gap:8px">
            <button id="mobile-undo" style="flex:1;padding:14px;border-radius:10px;border:1px solid var(--border-color);background:var(--bg-surface);font-size:14px;cursor:pointer;font-weight:600;min-height:48px">되돌리기</button>
            <button id="mobile-clear" style="flex:1;padding:14px;border-radius:10px;border:1px solid rgba(255,59,92,0.3);background:rgba(255,59,92,0.08);color:var(--accent);font-size:14px;cursor:pointer;font-weight:600;min-height:48px">전체 지우기</button>
          </div>
        `;
        const mobileKey = content.querySelector('#mobile-key');
        mobileKey?.addEventListener('change', () => {
          state.musicKey = mobileKey.value;
          document.getElementById('music-key').value = mobileKey.value;
          buildPitchMap();
          buildColorPalette();
          render();
          buildStepSequencer();
        });
        const mobileTempo = content.querySelector('#mobile-tempo');
        mobileTempo?.addEventListener('input', () => {
          const v = parseInt(mobileTempo.value);
          state.bpm = v;
          document.getElementById('tempo').value = v;
          const lbl = content.querySelector('#mobile-tempo-label');
          if (lbl) lbl.textContent = `${v} BPM`;
        });
        const mobileSwing = content.querySelector('#mobile-swing');
        mobileSwing?.addEventListener('input', () => {
          state.swing = parseInt(mobileSwing.value);
          const lbl = content.querySelector('#mobile-swing-label');
          if (lbl) lbl.textContent = `${state.swing}%`;
        });
        content.querySelector('#mobile-undo')?.addEventListener('click', () => { undo(); overlay.classList.remove('visible'); });
        content.querySelector('#mobile-clear')?.addEventListener('click', () => {
          if (state.notes.length && confirm('모든 노트를 지울까요?')) {
            saveUndoState();
            state.notes = [];
            state.selectedNoteId = null;
            render();
            overlay.classList.remove('visible');
          }
        });
      }

      overlay.classList.add('visible');
    });
  });

  // Mobile panel closing is now handled inside the canvas handleTap function

  // Window resize
  window.addEventListener('resize', () => {
    setTimeout(() => {
      const wasMobile = isMobile;
      isMobile = window.innerWidth <= 640;
      if (!isMobile) {
        buildPitchLabels();
        buildBeatLabels();
      }
      if (isMobile && !wasMobile) {
        buildStepSequencer();
      }
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
  updateMobileToolIndicator();
}

// Update the mobile tool indicator strip
function updateMobileToolIndicator() {
  const mShape = document.getElementById('m-shape');
  const mSize = document.getElementById('m-size');
  if (!mShape) return;

  const shapeLabels = { circle: 'Sine', square: 'Square', triangle: 'Triangle', diamond: 'Saw', star: 'Bell', hexagon: 'Perc' };
  mShape.textContent = shapeLabels[state.currentShape] || state.currentShape;

  const sizeLabels = { 1: '16분', 2: '8분', 4: '4분', 8: '2분' };
  if (mSize) mSize.textContent = sizeLabels[state.currentSize] || state.currentSize;
}

function handleCanvasInteraction(e) {
  try {
    if (!renderer) return;
    const { beatPos, pitchRow } = renderer.canvasToGrid(e.clientX, e.clientY);

    switch (state.currentMode) {
      case 'draw': {
        const existingNote = renderer.findNoteAt(state.notes, e.clientX, e.clientY);
        if (existingNote) {
          selectNote(existingNote);
          return;
        }
        const note = createNote(beatPos, pitchRow);
        if (note) {
          addNote(note);
        }
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
  } catch (err) {
    console.error('handleCanvasInteraction error:', err);
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
  try {
    isMobile = window.innerWidth <= 640;
    const canvas = document.getElementById('main-canvas');
    if (canvas) {
      renderer = new CanvasRenderer(canvas);
    }

    buildPitchMap();
    if (!isMobile) {
      buildPitchLabels();
      buildBeatLabels();
    }
    buildColorPalette();
    if (!isMobile) {
      buildChordGuide();
      updateLayersList();
    }
    render();
    bindEvents();

    if (isMobile) {
      buildStepSequencer();
    }

    // Onboarding
    if (!localStorage.getItem('soundcanvas-seen-onboarding')) {
      document.getElementById('onboarding').classList.remove('hidden');
    } else {
      document.getElementById('onboarding').classList.add('hidden');
    }

    // Loop on by default
    document.getElementById('btn-loop')?.classList.add('active');

    // Set initial canvas size based on loop sections
    if (renderer) {
      renderer.totalBeats = totalLoopSections * BEATS_PER_LOOP;
      renderer._resize();
    }

    console.log('SoundCanvas initialized. Mobile:', isMobile, 'Notes:', state.notes.length);
  } catch (err) {
    console.error('SoundCanvas init error:', err);
    const errDiv = document.createElement('div');
    errDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:12px;background:red;color:white;font-size:14px;z-index:9999;';
    errDiv.textContent = 'Error: ' + err.message;
    document.body.appendChild(errDiv);
  }
}
document.addEventListener('DOMContentLoaded', init);

// Global error handler for mobile debugging
window.addEventListener('error', (e) => {
  console.error('Global error:', e.message, e.filename, e.lineno);
});
