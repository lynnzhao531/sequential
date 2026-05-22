// =============================================================================
// grid-renderer.js — Canvas grid drawing, highlights, crosshair, history
// =============================================================================

(function () {
  'use strict';

  var Utils = window.ExperimentUtils;

  // Axis label area (pixels)
  var LABEL_PAD_LEFT = 35;
  var LABEL_PAD_TOP = 10;
  var LABEL_PAD_BOTTOM = 25;
  var LABEL_PAD_RIGHT = 10;

  /**
   * GridRenderer — draws a 100×50 grid on a canvas element.
   *
   * @param {HTMLCanvasElement} canvas
   * @param {number} [gridWidth=100]
   * @param {number} [gridHeight=50]
   * @param {number} [displayWidth] — optional CSS pixel width for the rendering area
   *   (used for mini-grids: e.g., 270×135 instead of full 800×400). Defaults to
   *   gridWidth*8. The canvas is sized to displayWidth + label padding.
   * @param {number} [displayHeight] — optional CSS pixel height (defaults to gridHeight*8).
   */
  function GridRenderer(canvas, gridWidth, gridHeight, displayWidth, displayHeight) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.gridWidth = gridWidth || Utils.GRID_WIDTH;
    this.gridHeight = gridHeight || Utils.GRID_HEIGHT;

    var fullW = displayWidth || (this.gridWidth * Utils.CELL_SIZE);
    var fullH = displayHeight || (this.gridHeight * Utils.CELL_SIZE);
    this.cellWidth = fullW / this.gridWidth;
    this.cellHeight = fullH / this.gridHeight;
    // Backward-compatible single cellSize (used by some legacy callers — not by mini-grids)
    this.cellSize = this.cellWidth;
    this.isMini = (fullW < 500);

    // Mini-grids skip axis labels — minimal padding instead
    var padL = this.isMini ? 4 : LABEL_PAD_LEFT;
    var padR = this.isMini ? 4 : LABEL_PAD_RIGHT;
    var padT = this.isMini ? 4 : LABEL_PAD_TOP;
    var padB = this.isMini ? 4 : LABEL_PAD_BOTTOM;

    this.canvasPixelWidth = padL + fullW + padR;
    this.canvasPixelHeight = padT + fullH + padB;

    canvas.width = this.canvasPixelWidth;
    canvas.height = this.canvasPixelHeight;

    this.originX = padL;
    this.originY = padT;

    // Offscreen canvas for caching the base grid (faster redraws)
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = this.canvasPixelWidth;
    this.offscreenCanvas.height = this.canvasPixelHeight;
    this.offscreenCtx = this.offscreenCanvas.getContext('2d');
    this._offscreenDrawn = false;

    // Mouse tracking state
    this._clickCallback = null;
    this._hoverCallback = null;
    this._redrawCallback = null;
    this._crosshairPos = null;
    this._crosshairColor = 'rgba(0, 0, 0, 0.35)';
    this._rafPending = false;
  }

  // ---------------------------------------------------------------------------
  // BASE GRID (offscreen)
  // ---------------------------------------------------------------------------

  GridRenderer.prototype._drawBaseToOffscreen = function () {
    var ctx = this.offscreenCtx;
    var ox = this.originX;
    var oy = this.originY;
    var gw = this.gridWidth * this.cellWidth;
    var gh = this.gridHeight * this.cellHeight;
    var showLabels = !this.isMini;

    ctx.clearRect(0, 0, this.canvasPixelWidth, this.canvasPixelHeight);

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox, oy, gw, gh);

    // Faint per-cell borders — only on full-size grid (mini grids skip this)
    if (!this.isMini) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.lineWidth = 0.5;
      for (var cx = 0; cx <= this.gridWidth; cx++) {
        var cpx = ox + cx * this.cellWidth + 0.5;
        ctx.beginPath();
        ctx.moveTo(cpx, oy);
        ctx.lineTo(cpx, oy + gh);
        ctx.stroke();
      }
      for (var cy = 0; cy <= this.gridHeight; cy++) {
        var cpy = oy + cy * this.cellHeight + 0.5;
        ctx.beginPath();
        ctx.moveTo(ox, cpy);
        ctx.lineTo(ox + gw, cpy);
        ctx.stroke();
      }
    }

    // Darker gridlines every 10 units (always shown, lighter on mini)
    ctx.strokeStyle = this.isMini ? 'rgba(0, 0, 0, 0.10)' : 'rgba(0, 0, 0, 0.15)';
    ctx.lineWidth = 1;
    for (var gx = 0; gx <= this.gridWidth; gx += 10) {
      var gpx = ox + gx * this.cellWidth + 0.5;
      ctx.beginPath();
      ctx.moveTo(gpx, oy);
      ctx.lineTo(gpx, oy + gh);
      ctx.stroke();
    }
    for (var gy = 0; gy <= this.gridHeight; gy += 10) {
      var gpy = oy + gy * this.cellHeight + 0.5;
      ctx.beginPath();
      ctx.moveTo(ox, gpy);
      ctx.lineTo(ox + gw, gpy);
      ctx.stroke();
    }

    // Outer border
    ctx.strokeStyle = this.isMini ? '#999' : '#666666';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, gw, gh);

    // Axis labels (skip on mini grids)
    if (showLabels) {
      ctx.fillStyle = '#333333';
      ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (var xl = 0; xl <= this.gridWidth; xl += 10) {
        ctx.fillText(xl.toString(), ox + xl * this.cellWidth, oy + gh + 6);
      }
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (var yl = 0; yl <= this.gridHeight; yl += 10) {
        ctx.fillText(yl.toString(), ox - 6, oy + yl * this.cellHeight);
      }
    }

    this._offscreenDrawn = true;
  };

  /**
   * Draw the base grid (from offscreen cache).
   */
  GridRenderer.prototype.drawGrid = function () {
    if (!this._offscreenDrawn) this._drawBaseToOffscreen();
    this.ctx.clearRect(0, 0, this.canvasPixelWidth, this.canvasPixelHeight);
    this.ctx.drawImage(this.offscreenCanvas, 0, 0);
  };

  /**
   * Clear and redraw from cache.
   */
  GridRenderer.prototype.clearHighlights = function () {
    this.drawGrid();
  };

  // ---------------------------------------------------------------------------
  // HIGHLIGHTS
  // ---------------------------------------------------------------------------

  /**
   * Highlight a single point.
   */
  GridRenderer.prototype.highlightPoint = function (x, y, color, radius) {
    color = color || 'rgba(41, 98, 255, 0.9)';
    radius = radius || 5;
    var ctx = this.ctx;
    var px = this.originX + x * this.cellSize + this.cellSize / 2;
    var py = this.originY + y * this.cellSize + this.cellSize / 2;

    ctx.beginPath();
    ctx.arc(px, py, radius, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  };

  /**
   * Highlight a full row (horizontal) or column (vertical) as a colored band.
   */
  GridRenderer.prototype.highlightLine = function (orientation, position, color, opacity) {
    if (opacity !== undefined && !color) {
      color = 'rgba(41, 98, 255, ' + opacity + ')';
    }
    color = color || 'rgba(41, 98, 255, 0.3)';
    var ctx = this.ctx;
    var ox = this.originX;
    var oy = this.originY;
    var gw = this.gridWidth * this.cellSize;
    var gh = this.gridHeight * this.cellSize;

    ctx.fillStyle = color;
    if (orientation === 'vertical') {
      var px = ox + position * this.cellSize;
      ctx.fillRect(px, oy, this.cellSize, gh);
    } else {
      var py = oy + position * this.cellSize;
      ctx.fillRect(ox, py, gw, this.cellSize);
    }
  };

  /**
   * Highlight a rectangular region with fill + border (used for in-progress selection).
   */
  GridRenderer.prototype.highlightRect = function (x1, y1, x2, y2, color) {
    color = color || 'rgba(41, 98, 255, 0.2)';
    var ctx = this.ctx;
    var minX = Math.min(x1, x2);
    var minY = Math.min(y1, y2);
    var w = Math.abs(x2 - x1) + 1;
    var h = Math.abs(y2 - y1) + 1;

    var px = this.originX + minX * this.cellSize;
    var py = this.originY + minY * this.cellSize;

    ctx.fillStyle = color;
    ctx.fillRect(px, py, w * this.cellSize, h * this.cellSize);

    ctx.strokeStyle = 'rgba(41, 98, 255, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px, py, w * this.cellSize, h * this.cellSize);
  };

  /**
   * Faint fill of a rectangle (used to emphasise current/most-recent rect in history).
   */
  GridRenderer.prototype.highlightRectFill = function (x1, y1, x2, y2, color, opacity) {
    opacity = opacity !== undefined ? opacity : 0.15;
    var fillColor = window.ExperimentUtils.withAlpha(color || 'hsl(20,90%,50%)', opacity);
    var minX = Math.min(x1, x2);
    var minY = Math.min(y1, y2);
    var w = Math.abs(x2 - x1) + 1;
    var h = Math.abs(y2 - y1) + 1;
    var px = this.originX + minX * this.cellSize;
    var py = this.originY + minY * this.cellSize;
    this.ctx.fillStyle = fillColor;
    this.ctx.fillRect(px, py, w * this.cellSize, h * this.cellSize);
  };

  /**
   * Draw a rectangle OUTLINE only (no fill). Used for history overlay so
   * underlying content stays visible. Optional label drawn in the center.
   */
  GridRenderer.prototype.highlightRectOutline = function (x1, y1, x2, y2, color, label) {
    color = color || 'rgba(41, 98, 255, 0.9)';
    var ctx = this.ctx;
    var minX = Math.min(x1, x2);
    var minY = Math.min(y1, y2);
    var w = Math.abs(x2 - x1) + 1;
    var h = Math.abs(y2 - y1) + 1;

    var px = this.originX + minX * this.cellSize;
    var py = this.originY + minY * this.cellSize;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(px + 1, py + 1, w * this.cellSize - 2, h * this.cellSize - 2);

    if (label) {
      var cxp = px + (w * this.cellSize) / 2;
      var cyp = py + (h * this.cellSize) / 2;
      ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var metrics = ctx.measureText(label);
      var pad = 4;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fillRect(cxp - metrics.width / 2 - pad, cyp - 8, metrics.width + pad * 2, 16);
      ctx.fillStyle = '#333';
      ctx.fillText(label, cxp, cyp);
    }
  };

  /**
   * Highlight a rectangle with a SOLID FILL of the given color/opacity, plus
   * an optional centered VALUE LABEL and optional small "#N" BADGE in the
   * top-left corner. Used for Option-C history mini-grids where rectangles
   * within a group are guaranteed non-overlapping.
   */
  GridRenderer.prototype.highlightRectFillLabeled = function (x1, y1, x2, y2, color, opacity, label, badgeText) {
    opacity = (opacity !== undefined) ? opacity : 0.7;
    color = color || 'hsl(20,90%,50%)';
    var fillColor = window.ExperimentUtils.withAlpha(color, opacity);

    var ctx = this.ctx;
    var minX = Math.min(x1, x2);
    var minY = Math.min(y1, y2);
    var w = Math.abs(x2 - x1) + 1;
    var h = Math.abs(y2 - y1) + 1;

    var px = this.originX + minX * this.cellWidth;
    var py = this.originY + minY * this.cellHeight;
    var rectW = w * this.cellWidth;
    var rectH = h * this.cellHeight;

    ctx.fillStyle = fillColor;
    ctx.fillRect(px, py, rectW, rectH);

    // Subtle outline for clarity
    ctx.strokeStyle = window.ExperimentUtils.withAlpha(color, Math.min(1, opacity + 0.2));
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, rectW - 1, rectH - 1);

    // Centered value label (white text with a thin dark shadow for readability)
    if (label) {
      var cx = px + rectW / 2;
      var cy = py + rectH / 2;
      var fontSize = this.isMini ? 10 : 12;
      ctx.font = 'bold ' + fontSize + 'px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.strokeText(label, cx, cy);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, cx, cy);
    }

    // "#N" badge in top-left corner
    if (badgeText) {
      var bFontSize = this.isMini ? 8 : 10;
      ctx.font = 'bold ' + bFontSize + 'px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.strokeText(badgeText, px + 2, py + 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(badgeText, px + 2, py + 2);
    }
  };

  /**
   * Set whether the grid responds to mouse input. When false, removes
   * mouse listeners so clicks/hovers do nothing — used by select-query
   * to render a non-interactive grid.
   */
  GridRenderer.prototype.setInteractive = function (interactive) {
    if (!interactive) {
      this.disableMouseTracking();
      this.canvas.style.cursor = 'default';
      this._interactive = false;
    } else {
      this.canvas.style.cursor = 'crosshair';
      this._interactive = true;
    }
  };

  // ---------------------------------------------------------------------------
  // OPTION-C HISTORY METHODS (typed mini-grids)
  // ---------------------------------------------------------------------------

  /**
   * Draw all point history entries on this grid, each as a circle colored by value.
   * Optionally takes opts.highlightedScan to draw a thicker ring around that scan.
   */
  GridRenderer.prototype.drawPointHistory = function (pointEntries, opts) {
    opts = opts || {};
    var hi = opts.highlightedScan;
    for (var i = 0; i < pointEntries.length; i++) {
      var e = pointEntries[i];
      var color = window.valueToColor(e.value);
      var radius = this.isMini ? 4 : 6;
      this.highlightPoint(e.coords.x, e.coords.y, color, radius);
      if (hi !== undefined && hi !== null && e.scanNumber === hi) {
        // Highlight ring
        var px = this.originX + e.coords.x * this.cellWidth + this.cellWidth / 2;
        var py = this.originY + e.coords.y * this.cellHeight + this.cellHeight / 2;
        this.ctx.strokeStyle = '#1a237e';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(px, py, radius + 2, 0, 2 * Math.PI);
        this.ctx.stroke();
      }
    }
  };

  /**
   * Draw all line history entries on this grid.
   * Each line gets a colored band + a small value label at the edge of the band.
   */
  GridRenderer.prototype.drawLineHistory = function (lineEntries, opts) {
    opts = opts || {};
    var hi = opts.highlightedScan;
    var ctx = this.ctx;
    var ox = this.originX;
    var oy = this.originY;
    var gw = this.gridWidth * this.cellWidth;
    var gh = this.gridHeight * this.cellHeight;

    for (var i = 0; i < lineEntries.length; i++) {
      var e = lineEntries[i];
      var color = window.valueToColor(e.value);
      var bandColor = window.ExperimentUtils.withAlpha(color, 0.5);
      var orient = e.orientation || (e.type === 'horizontal_line' ? 'horizontal' : 'vertical');
      var pos = e.coords.position;
      this.highlightLine(orient, pos, bandColor);

      // Value label at edge
      var labelText = e.value.toFixed(1);
      var fontSize = this.isMini ? 9 : 10;
      ctx.font = 'bold ' + fontSize + 'px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fillStyle = '#222';

      if (orient === 'horizontal') {
        var py = oy + pos * this.cellHeight + this.cellHeight / 2;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.strokeText('→ ' + labelText, ox + gw - 2, py);
        ctx.fillText('→ ' + labelText, ox + gw - 2, py);
      } else {
        var px = ox + pos * this.cellWidth + this.cellWidth / 2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.strokeText('↓' + labelText, px, oy + 2);
        ctx.fillText('↓' + labelText, px, oy + 2);
      }

      // Highlight ring for hovered line
      if (hi !== undefined && hi !== null && e.scanNumber === hi) {
        ctx.strokeStyle = '#1a237e';
        ctx.lineWidth = 2;
        if (orient === 'horizontal') {
          var py2 = oy + pos * this.cellHeight;
          ctx.strokeRect(ox + 1, py2 + 1, gw - 2, this.cellHeight - 2);
        } else {
          var px2 = ox + pos * this.cellWidth;
          ctx.strokeRect(px2 + 1, oy + 1, this.cellWidth - 2, gh - 2);
        }
      }
    }
  };

  /**
   * Draw a group of NON-OVERLAPPING rectangles (output of packRectanglesIntoGroups).
   * Each rectangle gets a solid fill, centered value label, and "#N" scan badge.
   */
  GridRenderer.prototype.drawRectangleGroup = function (rectEntries, opts) {
    opts = opts || {};
    var hi = opts.highlightedScan;
    for (var i = 0; i < rectEntries.length; i++) {
      var e = rectEntries[i];
      var color = window.valueToColor(e.value);
      this.highlightRectFillLabeled(
        e.coords.x1, e.coords.y1, e.coords.x2, e.coords.y2,
        color, 0.7,
        e.value.toFixed(1),
        '#' + e.scanNumber
      );
      if (hi !== undefined && hi !== null && e.scanNumber === hi) {
        // Highlight ring
        var minX = Math.min(e.coords.x1, e.coords.x2);
        var minY = Math.min(e.coords.y1, e.coords.y2);
        var w = Math.abs(e.coords.x2 - e.coords.x1) + 1;
        var h = Math.abs(e.coords.y2 - e.coords.y1) + 1;
        var px = this.originX + minX * this.cellWidth;
        var py = this.originY + minY * this.cellHeight;
        this.ctx.strokeStyle = '#1a237e';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(px - 2, py - 2, w * this.cellWidth + 4, h * this.cellHeight + 4);
      }
    }
  };

  /**
   * Hit-test: given mouse position (in canvas pixel coords) and an array of items
   * currently drawn, return the item that contains the position, or null.
   * Each item must have `coords` and `type` matching a queryHistory entry.
   */
  GridRenderer.prototype.getItemAtPosition = function (canvasX, canvasY, items) {
    var gx = (canvasX - this.originX) / this.cellWidth;
    var gy = (canvasY - this.originY) / this.cellHeight;
    if (gx < 0 || gx >= this.gridWidth || gy < 0 || gy >= this.gridHeight) return null;

    // Iterate newest first so top-most item wins on overlap (e.g., points)
    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      if (it.type === 'point') {
        var dx = gx - (it.coords.x + 0.5);
        var dy = gy - (it.coords.y + 0.5);
        // Hit-radius ~ 2 cells in mini-grid
        if (dx * dx + dy * dy < 4) return it;
      } else if (it.type === 'horizontal_line') {
        if (Math.floor(gy) === it.coords.position) return it;
      } else if (it.type === 'vertical_line') {
        if (Math.floor(gx) === it.coords.position) return it;
      } else if (it.type === 'rectangle') {
        var x1 = Math.min(it.coords.x1, it.coords.x2);
        var x2 = Math.max(it.coords.x1, it.coords.x2);
        var y1 = Math.min(it.coords.y1, it.coords.y2);
        var y2 = Math.max(it.coords.y1, it.coords.y2);
        if (gx >= x1 && gx <= x2 + 1 && gy >= y1 && gy <= y2 + 1) return it;
      }
    }
    return null;
  };

  // ---------------------------------------------------------------------------
  // HISTORY OVERLAY (legacy time-weighted — retained for backward compat)
  // ---------------------------------------------------------------------------

  /**
   * Helper: convert an hsl string to hsla with the given alpha.
   */
  function withAlpha(color, alpha) {
    if (!color) return 'rgba(41, 98, 255, ' + alpha + ')';
    if (color.indexOf('hsl(') === 0) {
      return color.replace('hsl(', 'hsla(').replace(')', ', ' + alpha + ')');
    }
    if (color.indexOf('rgb(') === 0) {
      return color.replace('rgb(', 'rgba(').replace(')', ', ' + alpha + ')');
    }
    return color;
  }

  /**
   * Draw all past queries on the grid, each colored by its value.
   * Oldest first, so newest renders on top. NOT time-weighted.
   * Kept for backward compatibility — most call sites should use
   * drawHistoryOverlayWeighted instead.
   */
  GridRenderer.prototype.drawHistoryOverlay = function (queryHistory) {
    if (!queryHistory || queryHistory.length === 0) return;
    var valueToColor = Utils.valueToColor;

    for (var i = 0; i < queryHistory.length; i++) {
      var q = queryHistory[i];
      var color = valueToColor(q.value);

      if (q.type === 'point') {
        this.highlightPoint(q.coords.x, q.coords.y, color, 6);
      } else if (q.type === 'horizontal_line') {
        this.highlightLine('horizontal', q.coords.position, withAlpha(color, 0.35));
      } else if (q.type === 'vertical_line') {
        this.highlightLine('vertical', q.coords.position, withAlpha(color, 0.35));
      } else if (q.type === 'rectangle') {
        this.highlightRectOutline(
          q.coords.x1, q.coords.y1, q.coords.x2, q.coords.y2,
          color, q.value.toFixed(1)
        );
      }
    }
  };

  /**
   * Time-weighted history overlay.
   * For each entry: alpha = exp(-(currentRound - entry.round) / 4).
   * Drawing rules:
   *   point     → filled circle, color = valueToColor(value), opacity = alpha
   *   line      → semi-transparent band, opacity = alpha * 0.4
   *   rectangle → OUTLINE only, lineWidth=2, opacity = alpha
   *   most-recent rectangle (roundsAgo===0) gets ALSO a faint fill (0.15) for emphasis
   */
  GridRenderer.prototype.drawHistoryOverlayWeighted = function (queryHistory, currentRound) {
    if (!queryHistory || queryHistory.length === 0) return;
    var valueToColor = window.valueToColor || Utils.valueToColor;
    var getOpacity = window.getHistoryOpacity || Utils.getHistoryOpacity;

    for (var i = 0; i < queryHistory.length; i++) {
      var q = queryHistory[i];
      var roundsAgo = currentRound - q.round;
      if (roundsAgo < 0) roundsAgo = 0;
      var alpha = getOpacity(roundsAgo);
      var color = valueToColor(q.value);

      if (q.type === 'point') {
        this.highlightPoint(q.coords.x, q.coords.y, withAlpha(color, alpha), 6);
      } else if (q.type === 'horizontal_line') {
        this.highlightLine('horizontal', q.coords.position, withAlpha(color, alpha * 0.4));
      } else if (q.type === 'vertical_line') {
        this.highlightLine('vertical', q.coords.position, withAlpha(color, alpha * 0.4));
      } else if (q.type === 'rectangle') {
        // Outline only (avoid muddy fill stacking)
        this.highlightRectOutline(
          q.coords.x1, q.coords.y1, q.coords.x2, q.coords.y2,
          withAlpha(color, alpha),
          null
        );
        // Most recent rectangle: faint fill emphasis
        if (roundsAgo === 0) {
          this.highlightRectFill(
            q.coords.x1, q.coords.y1, q.coords.x2, q.coords.y2,
            color, 0.15
          );
        }
      }
    }
  };

  /**
   * One-stop redraw helper used by feedback / guess / continue-decision plugins.
   * Layer order: base → history overlay → currentSelection → guessDot → crosshair on top.
   *
   * @param {Object} opts
   * @param {Array}  opts.queryHistory
   * @param {number} opts.currentRound
   * @param {Object} [opts.currentSelection] — full-opacity highlight for in-progress selection
   * @param {Object} [opts.guessDot] — { x, y } for orange guess dot
   * @param {Array}  [opts.guessHistory] — past guess dots (faded orange)
   * @param {Object} [opts.crosshairPos] — { x, y } in grid coords
   */
  GridRenderer.prototype.redrawAll = function (opts) {
    opts = opts || {};
    this.drawGrid();

    if (opts.queryHistory && opts.queryHistory.length > 0) {
      this.drawHistoryOverlayWeighted(opts.queryHistory, opts.currentRound || 1);
    }

    // Past guesses (faint orange)
    if (opts.guessHistory && opts.guessHistory.length > 0) {
      for (var i = 0; i < opts.guessHistory.length; i++) {
        var g = opts.guessHistory[i];
        this.highlightPoint(g.x, g.y, 'rgba(255, 107, 53, 0.45)', 5);
      }
    }

    // Current in-progress selection (full opacity)
    if (opts.currentSelection) {
      var sel = opts.currentSelection;
      if (sel.type === 'point') {
        this.highlightPoint(sel.x, sel.y, 'rgba(41, 98, 255, 0.95)', 7);
      } else if (sel.type === 'horizontal_line') {
        this.highlightLine('horizontal', sel.position, 'rgba(41, 98, 255, 0.45)');
      } else if (sel.type === 'vertical_line') {
        this.highlightLine('vertical', sel.position, 'rgba(41, 98, 255, 0.45)');
      } else if (sel.type === 'rectangle') {
        this.highlightRectFill(sel.x1, sel.y1, sel.x2, sel.y2, 'hsl(220,90%,50%)', 0.18);
        this.highlightRectOutline(sel.x1, sel.y1, sel.x2, sel.y2, 'rgba(41, 98, 255, 0.85)');
      } else if (sel.type === 'corner1') {
        // Single corner placed (rect plugin between clicks)
        this.highlightPoint(sel.x, sel.y, 'rgba(41, 98, 255, 0.9)', 6);
      }
    }

    // Current guess dot (orange, full opacity)
    if (opts.guessDot) {
      this.highlightPoint(opts.guessDot.x, opts.guessDot.y, 'rgba(255, 107, 53, 0.95)', 8);
    }

    // ALWAYS draw crosshair LAST so it's never blocked by accumulated history
    if (opts.crosshairPos) {
      this._drawCrosshair(opts.crosshairPos.x, opts.crosshairPos.y);
    } else if (this._crosshairPos) {
      this._drawCrosshair(this._crosshairPos.x, this._crosshairPos.y);
    }
  };

  /**
   * Draw guess history markers (orange dots).
   */
  GridRenderer.prototype.drawGuessOverlay = function (guessHistory) {
    if (!guessHistory || guessHistory.length === 0) return;
    for (var i = 0; i < guessHistory.length; i++) {
      var g = guessHistory[i];
      this.highlightPoint(g.x, g.y, 'rgba(255, 107, 53, 0.55)', 5);
    }
  };

  /**
   * Full redraw: base grid + history + additional draw callback + crosshair.
   */
  GridRenderer.prototype.redrawWithHistory = function (queryHistory, additionalDraw) {
    this.drawGrid();
    if (queryHistory && queryHistory.length > 0) {
      this.drawHistoryOverlay(queryHistory);
    }
    if (typeof additionalDraw === 'function') {
      additionalDraw(this);
    }
    if (this._crosshairPos) {
      this._drawCrosshair(this._crosshairPos.x, this._crosshairPos.y);
    }
  };

  // ---------------------------------------------------------------------------
  // CROSSHAIR
  // ---------------------------------------------------------------------------

  GridRenderer.prototype._drawCrosshair = function (gridX, gridY) {
    var ctx = this.ctx;
    var ox = this.originX;
    var oy = this.originY;
    var gw = this.gridWidth * this.cellSize;
    var gh = this.gridHeight * this.cellSize;
    var cellCx = ox + gridX * this.cellSize + this.cellSize / 2;
    var cellCy = oy + gridY * this.cellSize + this.cellSize / 2;

    ctx.save();
    ctx.strokeStyle = this._crosshairColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);

    ctx.beginPath();
    ctx.moveTo(ox, cellCy);
    ctx.lineTo(ox + gw, cellCy);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cellCx, oy);
    ctx.lineTo(cellCx, oy + gh);
    ctx.stroke();
    ctx.restore();

    // Axis indicator chips
    ctx.save();
    ctx.fillStyle = 'rgba(41, 98, 255, 0.9)';
    ctx.fillRect(cellCx - 14, oy + gh + 2, 28, 16);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(gridX), cellCx, oy + gh + 10);

    ctx.fillStyle = 'rgba(41, 98, 255, 0.9)';
    ctx.fillRect(ox - 32, cellCy - 8, 28, 16);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(gridY), ox - 18, cellCy);
    ctx.restore();
  };

  GridRenderer.prototype.setCrosshair = function (gridX, gridY) {
    this._crosshairPos = { x: gridX, y: gridY };
  };

  GridRenderer.prototype.clearCrosshair = function () {
    this._crosshairPos = null;
  };

  // ---------------------------------------------------------------------------
  // MOUSE INTERACTION
  // ---------------------------------------------------------------------------

  GridRenderer.prototype.canvasToGrid = function (canvasX, canvasY) {
    var gx = (canvasX - this.originX) / this.cellSize;
    var gy = (canvasY - this.originY) / this.cellSize;
    var x = Math.floor(gx);
    var y = Math.floor(gy);
    if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) {
      return null;
    }
    return { x: x, y: y };
  };

  GridRenderer.prototype.getMousePos = function (event) {
    var rect = this.canvas.getBoundingClientRect();
    var scaleX = this.canvas.width / rect.width;
    var scaleY = this.canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    };
  };

  /**
   * Enable mouse tracking: crosshair on hover + click callback.
   */
  GridRenderer.prototype.enableMouseTracking = function (opts) {
    opts = opts || {};
    var self = this;
    this._clickCallback = opts.onClick || null;
    this._hoverCallback = opts.onHover || null;
    this._redrawCallback = opts.redraw || null;

    this.canvas.style.cursor = 'crosshair';

    this._mouseMoveHandler = function (e) {
      var pos = self.getMousePos(e);
      var gridPos = self.canvasToGrid(pos.x, pos.y);
      if (!gridPos) {
        if (self._crosshairPos) {
          self._crosshairPos = null;
          self._requestRedraw();
        }
        return;
      }
      if (!self._crosshairPos || self._crosshairPos.x !== gridPos.x || self._crosshairPos.y !== gridPos.y) {
        self._crosshairPos = gridPos;
        self._requestRedraw();
        if (self._hoverCallback) self._hoverCallback(gridPos, e);
      }
    };

    this._mouseLeaveHandler = function () {
      if (self._crosshairPos) {
        self._crosshairPos = null;
        self._requestRedraw();
      }
    };

    this._clickHandler = function (e) {
      var pos = self.getMousePos(e);
      var gridPos = self.canvasToGrid(pos.x, pos.y);
      if (gridPos && self._clickCallback) {
        self._clickCallback(gridPos, e);
      }
    };

    this.canvas.addEventListener('mousemove', this._mouseMoveHandler);
    this.canvas.addEventListener('mouseleave', this._mouseLeaveHandler);
    this.canvas.addEventListener('click', this._clickHandler);
  };

  GridRenderer.prototype._requestRedraw = function () {
    if (this._rafPending) return;
    var self = this;
    this._rafPending = true;
    requestAnimationFrame(function () {
      self._rafPending = false;
      if (self._redrawCallback) {
        self._redrawCallback(self);
      } else {
        self.drawGrid();
        if (self._crosshairPos) {
          self._drawCrosshair(self._crosshairPos.x, self._crosshairPos.y);
        }
      }
    });
  };

  GridRenderer.prototype.disableMouseTracking = function () {
    if (this._mouseMoveHandler) this.canvas.removeEventListener('mousemove', this._mouseMoveHandler);
    if (this._mouseLeaveHandler) this.canvas.removeEventListener('mouseleave', this._mouseLeaveHandler);
    if (this._clickHandler) this.canvas.removeEventListener('click', this._clickHandler);
    this._mouseMoveHandler = null;
    this._mouseLeaveHandler = null;
    this._clickHandler = null;
    this._clickCallback = null;
    this._hoverCallback = null;
    this._redrawCallback = null;
  };

  // Export to global namespace
  window.GridRenderer = GridRenderer;
})();
