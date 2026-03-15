/**
 * SoundCanvas - Canvas Renderer
 * 캔버스에 노트를 시각적으로 렌더링
 */
class CanvasRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;

    // Grid settings
    this.cellWidth = 40;   // pixels per beat subdivision
    this.cellHeight = 24;  // pixels per pitch row
    this.totalBeats = 32;  // 8 bars of 4 beats
    this.totalPitchRows = 24;
    this.gridOffsetX = 0;

    this._resize();
    this._setupResizeObserver();
  }

  _setupResizeObserver() {
    const wrapper = this.canvas.parentElement;
    if (!wrapper) return;
    const ro = new ResizeObserver(() => this._resize());
    ro.observe(wrapper);
  }

  _resize() {
    const wrapper = this.canvas.parentElement;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const height = rect.height;

    this.cellHeight = Math.max(18, Math.floor(height / this.totalPitchRows));
    const canvasHeight = this.cellHeight * this.totalPitchRows;
    const canvasWidth = Math.max(rect.width, this.cellWidth * this.totalBeats);

    this.canvas.width = canvasWidth * this.dpr;
    this.canvas.height = canvasHeight * this.dpr;
    this.canvas.style.width = canvasWidth + 'px';
    this.canvas.style.height = canvasHeight + 'px';

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.width = canvasWidth;
    this.height = canvasHeight;
  }

  get logicalWidth() { return this.width; }
  get logicalHeight() { return this.height; }

  /**
   * 전체 캔버스 렌더링
   */
  render(notes, selectedNoteId, activeLayerId, layers) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    this._drawGrid(ctx);
    this._drawNotes(ctx, notes, selectedNoteId, activeLayerId, layers);
  }

  _drawGrid(ctx) {
    const w = this.width;
    const h = this.height;

    // Background - light designer-friendly
    ctx.fillStyle = '#FAFAFA';
    ctx.fillRect(0, 0, w, h);

    // Alternate row shading for readability
    for (let i = 0; i < this.totalPitchRows; i++) {
      const y = i * this.cellHeight;
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.015)';
        ctx.fillRect(0, y, w, this.cellHeight);
      }
    }

    // Horizontal lines (pitch rows)
    for (let i = 0; i <= this.totalPitchRows; i++) {
      const y = i * this.cellHeight;
      ctx.strokeStyle = i % 12 === 0 ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.04)';
      ctx.lineWidth = i % 12 === 0 ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Vertical lines (beat markers)
    for (let i = 0; i <= this.totalBeats; i++) {
      const x = i * this.cellWidth;
      const isBar = i % 4 === 0;
      ctx.strokeStyle = isBar ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.04)';
      ctx.lineWidth = isBar ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();

      // Bar highlight
      if (isBar && (Math.floor(i / 4) % 2 === 0)) {
        ctx.fillStyle = 'rgba(0,0,0,0.008)';
        ctx.fillRect(x, 0, this.cellWidth * 4, h);
      }
    }
  }

  _drawNotes(ctx, notes, selectedNoteId, activeLayerId, layers) {
    // Determine which layers are visible
    const mutedLayers = new Set();
    const soloLayers = new Set();
    for (const layer of layers) {
      if (layer.muted) mutedLayers.add(layer.id);
      if (layer.solo) soloLayers.add(layer.id);
    }
    const hasSolo = soloLayers.size > 0;

    for (const note of notes) {
      const isVisible = hasSolo ? soloLayers.has(note.layerId) : !mutedLayers.has(note.layerId);
      if (!isVisible) continue;

      const isActive = note.layerId === activeLayerId;
      const isSelected = note.id === selectedNoteId;
      const dimmed = !isActive && !isSelected;

      const x = note.beatPos * this.cellWidth;
      const y = note.pitchRow * this.cellHeight;
      const w = note.sizeFactor * this.cellWidth;
      const h = this.cellHeight;
      const alpha = dimmed ? note.opacity * 0.4 : note.opacity;

      ctx.save();
      ctx.globalAlpha = alpha;

      this._drawShape(ctx, note.shape, x, y, w, h, note.color, isSelected);

      ctx.restore();
    }
  }

  _drawShape(ctx, shape, x, y, w, h, color, isSelected) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.min(w, h) / 2 - 2;

    ctx.fillStyle = color;
    ctx.strokeStyle = isSelected ? '#1D1D1F' : 'rgba(0,0,0,0.1)';
    ctx.lineWidth = isSelected ? 2.5 : 1;

    switch (shape) {
      case 'circle':
        ctx.beginPath();
        ctx.ellipse(cx, cy, w / 2 - 2, r, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        break;

      case 'square':
        const sr = 3;
        ctx.beginPath();
        ctx.roundRect(x + 2, y + 2, w - 4, h - 4, sr);
        ctx.fill();
        ctx.stroke();
        break;

      case 'triangle':
        ctx.beginPath();
        ctx.moveTo(cx, y + 2);
        ctx.lineTo(x + w - 2, y + h - 2);
        ctx.lineTo(x + 2, y + h - 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;

      case 'diamond':
        ctx.beginPath();
        ctx.moveTo(cx, y + 2);
        ctx.lineTo(x + w - 2, cy);
        ctx.lineTo(cx, y + h - 2);
        ctx.lineTo(x + 2, cy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;

      case 'star':
        this._drawStar(ctx, cx, cy, r - 1, r * 0.4, 5);
        ctx.fill();
        ctx.stroke();
        break;

      case 'hexagon':
        this._drawPolygon(ctx, cx, cy, r - 1, 6);
        ctx.fill();
        ctx.stroke();
        break;
    }

    // Selected glow
    if (isSelected) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = '#1D1D1F';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  _drawStar(ctx, cx, cy, outerR, innerR, points) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  _drawPolygon(ctx, cx, cy, r, sides) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  /**
   * 캔버스 좌표 → 그리드 좌표 변환
   */
  canvasToGrid(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    // Account for scroll offset within the wrapper
    const wrapper = this.canvas.parentElement;
    const scrollLeft = wrapper ? wrapper.scrollLeft : 0;
    const scrollTop = wrapper ? wrapper.scrollTop : 0;

    const x = clientX - rect.left + scrollLeft;
    const y = clientY - rect.top + scrollTop;

    const beatPos = Math.floor(x / this.cellWidth);
    const pitchRow = Math.floor(y / this.cellHeight);

    return {
      beatPos: Math.max(0, Math.min(this.totalBeats - 1, beatPos)),
      pitchRow: Math.max(0, Math.min(this.totalPitchRows - 1, pitchRow)),
      x, y
    };
  }

  /**
   * 특정 좌표에 있는 노트 찾기
   */
  findNoteAt(notes, clientX, clientY) {
    const { beatPos, pitchRow } = this.canvasToGrid(clientX, clientY);

    // Reverse order to find topmost note first
    for (let i = notes.length - 1; i >= 0; i--) {
      const note = notes[i];
      if (note.pitchRow === pitchRow &&
          beatPos >= note.beatPos &&
          beatPos < note.beatPos + note.sizeFactor) {
        return note;
      }
    }
    return null;
  }

  /**
   * 재생 헤드 위치를 픽셀로 변환
   */
  progressToPixel(progress) {
    return progress * this.totalBeats * this.cellWidth;
  }
}

window.CanvasRenderer = CanvasRenderer;
