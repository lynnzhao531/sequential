// =============================================================================
// landscape.js — 2D Gaussian richness function generator
// =============================================================================
// Phase 3+: also computes rowMeans, colMeans, and 2D prefix sum for O(1)
// line/rectangle mean queries. Stores everything on window.experimentState.
// =============================================================================

(function () {
  'use strict';

  var Utils = window.ExperimentUtils;

  /**
   * Generate a 2D landscape (100×50 array) with a Gaussian peak + noise.
   * Stores the landscape and precomputed aggregates on window.experimentState.
   *
   * @param {Object} [params] — optional overrides (cx, cy, sx, sy, amplitude, noiseSd)
   * @returns {{ grid: number[][], params: Object, peakLocation: {x,y} }}
   */
  function generateLandscape(params) {
    params = params || {};

    var W = Utils.GRID_WIDTH;
    var H = Utils.GRID_HEIGHT;

    // Allow specifying ranges (e.g., training A: cxRange=[15,35]) or fixed values.
    var cxRange = params.cxRange || [20, 79];
    var cyRange = params.cyRange || [10, 39];
    var sxRange = params.sxRange || [10, 25];
    var syRange = params.syRange || [10, 25];

    var cx = params.cx !== undefined ? params.cx : Utils.randInt(cxRange[0], cxRange[1]);
    var cy = params.cy !== undefined ? params.cy : Utils.randInt(cyRange[0], cyRange[1]);
    var sx = params.sx !== undefined ? params.sx : Utils.randFloat(sxRange[0], sxRange[1]);
    var sy = params.sy !== undefined ? params.sy : Utils.randFloat(syRange[0], syRange[1]);
    var amplitude = params.amplitude !== undefined ? params.amplitude : Utils.DEFAULT_AMPLITUDE;
    var noiseSd = params.noiseSd !== undefined ? params.noiseSd : Utils.DEFAULT_NOISE_SD;

    // --- Build grid ---
    var grid = new Array(W);
    for (var x = 0; x < W; x++) {
      grid[x] = new Array(H);
      for (var y = 0; y < H; y++) {
        var exponent = -((x - cx) * (x - cx) / (2 * sx * sx) +
                         (y - cy) * (y - cy) / (2 * sy * sy));
        var value = amplitude * Math.exp(exponent);
        value += Utils.gaussRandom(0, noiseSd);
        grid[x][y] = Utils.clamp(value, 0, 100);
      }
    }

    var landscape = {
      grid: grid,
      params: { cx: cx, cy: cy, sx: sx, sy: sy, amplitude: amplitude, noiseSd: noiseSd },
      peakLocation: { x: cx, y: cy }
    };

    // --- Precompute aggregates ---
    computeAggregates(landscape);

    return landscape;
  }

  /**
   * Precompute rowMeans, colMeans, prefixSum, gridMeanRichness on experimentState.
   */
  function computeAggregates(landscape) {
    var W = Utils.GRID_WIDTH;
    var H = Utils.GRID_HEIGHT;
    var grid = landscape.grid;

    // rowMeans[y] = average of grid[0..W-1][y]
    var rowMeans = new Array(H);
    for (var y = 0; y < H; y++) {
      var rowSum = 0;
      for (var x = 0; x < W; x++) rowSum += grid[x][y];
      rowMeans[y] = rowSum / W;
    }

    // colMeans[x] = average of grid[x][0..H-1]
    var colMeans = new Array(W);
    for (var xi = 0; xi < W; xi++) {
      var colSum = 0;
      for (var yi = 0; yi < H; yi++) colSum += grid[xi][yi];
      colMeans[xi] = colSum / H;
    }

    // prefixSum[x][y] = sum of grid[0..x][0..y]
    // prefixSum has dimensions (W+1) x (H+1), with prefixSum[0][*] = prefixSum[*][0] = 0
    // stored with 1-based indexing for convenience
    var prefixSum = new Array(W + 1);
    for (var px = 0; px <= W; px++) {
      prefixSum[px] = new Array(H + 1);
      for (var py = 0; py <= H; py++) prefixSum[px][py] = 0;
    }
    for (var qx = 1; qx <= W; qx++) {
      for (var qy = 1; qy <= H; qy++) {
        prefixSum[qx][qy] = grid[qx - 1][qy - 1]
          + prefixSum[qx - 1][qy]
          + prefixSum[qx][qy - 1]
          - prefixSum[qx - 1][qy - 1];
      }
    }

    var totalSum = prefixSum[W][H];
    var gridMean = totalSum / (W * H);

    // Store on experimentState
    var state = window.experimentState;
    if (state) {
      state.landscape = landscape;
      state.rowMeans = rowMeans;
      state.colMeans = colMeans;
      state.prefixSum = prefixSum;
      state.gridMeanRichness = gridMean;
      state.peakLocation = landscape.peakLocation;
    }
  }

  /**
   * Get the richness value at a single point. Reads from experimentState.
   */
  function getPointValue(x, y) {
    var state = window.experimentState;
    var W = Utils.GRID_WIDTH;
    var H = Utils.GRID_HEIGHT;
    x = Utils.clamp(Math.round(x), 0, W - 1);
    y = Utils.clamp(Math.round(y), 0, H - 1);
    return state.landscape.grid[x][y];
  }

  /**
   * Get the mean richness of a full row or column. Reads from precomputed aggregates.
   * @param {string} orientation — 'horizontal' (fixed y) or 'vertical' (fixed x)
   * @param {number} position — the y (horizontal) or x (vertical) index
   */
  function getLineMean(orientation, position) {
    var state = window.experimentState;
    var W = Utils.GRID_WIDTH;
    var H = Utils.GRID_HEIGHT;
    if (orientation === 'horizontal') {
      var y = Utils.clamp(Math.round(position), 0, H - 1);
      return state.rowMeans[y];
    } else {
      var x = Utils.clamp(Math.round(position), 0, W - 1);
      return state.colMeans[x];
    }
  }

  /**
   * Get the mean richness within a rectangular region (inclusive).
   * Uses the 2D prefix sum for O(1) computation.
   */
  function getRectMean(x1, y1, x2, y2) {
    var state = window.experimentState;
    var W = Utils.GRID_WIDTH;
    var H = Utils.GRID_HEIGHT;
    var minX = Utils.clamp(Math.min(x1, x2), 0, W - 1);
    var maxX = Utils.clamp(Math.max(x1, x2), 0, W - 1);
    var minY = Utils.clamp(Math.min(y1, y2), 0, H - 1);
    var maxY = Utils.clamp(Math.max(y1, y2), 0, H - 1);

    var ps = state.prefixSum;
    var total = ps[maxX + 1][maxY + 1]
              - ps[minX][maxY + 1]
              - ps[maxX + 1][minY]
              + ps[minX][minY];
    var area = (maxX - minX + 1) * (maxY - minY + 1);
    return area > 0 ? total / area : 0;
  }

  /**
   * Get the mean richness across the entire grid (precomputed).
   */
  function getGridMean() {
    var state = window.experimentState;
    return state && state.gridMeanRichness !== undefined ? state.gridMeanRichness : 0;
  }

  // Export to global namespace
  window.Landscape = {
    generate: generateLandscape,
    getPointValue: getPointValue,
    getLineMean: getLineMean,
    getRectMean: getRectMean,
    getGridMean: getGridMean
  };
})();
