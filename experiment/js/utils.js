// =============================================================================
// utils.js — Constants and helper functions
// =============================================================================

(function () {
  'use strict';

  // Grid dimensions
  var GRID_WIDTH = 100;   // x: 0..99
  var GRID_HEIGHT = 50;   // y: 0..49
  var CELL_SIZE = 8;      // pixels per cell
  var CANVAS_WIDTH = GRID_WIDTH * CELL_SIZE;   // 800
  var CANVAS_HEIGHT = GRID_HEIGHT * CELL_SIZE; // 400

  // Landscape generation defaults
  var DEFAULT_AMPLITUDE = 100;
  var DEFAULT_NOISE_SD = 2;

  // Experiment defaults
  var MAX_ROUNDS = 3; // Phase 1: 3 rounds

  /**
   * Generate a random number from a Gaussian distribution (Box-Muller).
   */
  function gaussRandom(mean, sd) {
    var u1 = Math.random();
    var u2 = Math.random();
    var z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + sd * z;
  }

  /**
   * Clamp a value between min and max.
   */
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * Random integer between min and max (inclusive).
   */
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Random float between min and max.
   */
  function randFloat(min, max) {
    return Math.random() * (max - min) + min;
  }

  /**
   * Generate a unique participant ID.
   */
  function generateParticipantId() {
    return 'P' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
  }

  /**
   * Format trial data row for CSV export.
   */
  function formatTrialRow(data) {
    return {
      participant_id: data.participant_id || '',
      phase: data.phase || '',
      landscape_id: data.landscape_id || '',
      round_number: data.round_number || '',
      query_type: data.query_type || '',
      query_coords: data.query_coords ? JSON.stringify(data.query_coords) : '',
      query_area: data.query_area || '',
      query_mean_utility: data.query_mean_utility || '',
      guess_x: data.guess_x !== undefined ? data.guess_x : '',
      guess_y: data.guess_y !== undefined ? data.guess_y : '',
      guess_actual_utility: data.guess_actual_utility !== undefined ? data.guess_actual_utility : '',
      rt_query_select: data.rt_query_select || '',
      rt_query_execute: data.rt_query_execute || '',
      rt_guess: data.rt_guess || '',
      all_clicks: data.all_clicks ? JSON.stringify(data.all_clicks) : '',
      timestamp: data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Single-hue heatmap color: pale cream (low) → orange → deep red (high).
   * 0: hsl(35, 90%, 95%) ≈ pale cream
   * 50: hsl(17, 95%, 65%) ≈ orange
   * 100: hsl(0, 100%, 35%) ≈ deep red
   */
  function valueToColor(value) {
    var v = clamp(value, 0, 100);
    var t = v / 100;
    var hue = 35 - t * 35;          // 35 → 0
    var sat = 90 + t * 10;          // 90 → 100
    var light = 95 - t * 60;        // 95 → 35
    return 'hsl(' + hue.toFixed(1) + ',' + sat.toFixed(0) + '%,' + light.toFixed(1) + '%)';
  }

  /**
   * Time-weighted opacity for history overlay: exp(-roundsAgo / 4).
   * Most recent (roundsAgo=0) → 1.0; ~5 most recent visible; older fades.
   */
  function getHistoryOpacity(roundsAgo) {
    return Math.exp(-roundsAgo / 4);
  }

  /**
   * Helper: append alpha to an hsl(...) color string.
   */
  function withAlpha(hslColor, alpha) {
    if (!hslColor) return 'rgba(41, 98, 255, ' + alpha + ')';
    if (hslColor.indexOf('hsl(') === 0) {
      return hslColor.replace('hsl(', 'hsla(').replace(')', ',' + alpha + ')');
    }
    if (hslColor.indexOf('rgb(') === 0) {
      return hslColor.replace('rgb(', 'rgba(').replace(')', ',' + alpha + ')');
    }
    return hslColor;
  }

  /**
   * Generate a random UUID v4.
   */
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Serialize an array of objects to a CSV string. Returns the string;
   * does NOT auto-download. (Pre-v7 used to trigger a download — that's
   * now handled by saveDataToOSF as a fallback only.)
   */
  function exportCSV(data, filename) {
    if (!data || data.length === 0) {
      return '';
    }
    var keys = Object.keys(data[0]);
    var lines = [keys.join(',')];
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var values = keys.map(function (k) {
        var v = row[k];
        if (v === null || v === undefined) return '';
        var s = typeof v === 'object' ? JSON.stringify(v) : String(v);
        // Escape quotes and wrap if it contains comma/quote/newline
        if (s.indexOf('"') !== -1 || s.indexOf(',') !== -1 || s.indexOf('\n') !== -1) {
          s = '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      });
      lines.push(values.join(','));
    }
    return lines.join('\n');
  }

  /**
   * Numbered history list label with type icon.
   *   point        → "1. ● Point — 67.3"
   *   horiz line   → "2. ═ Row 25 — 41.8"
   *   vert line    → "3. ║ Col 47 — 55.2"
   *   rectangle    → "4. ▢ Area 30×20 — 48.1"
   */
  function formatQueryLabel(entry, index) {
    var num = (index + 1) + '.';
    var val = (entry.value !== undefined && entry.value !== null) ? entry.value.toFixed(1) : '—';
    if (entry.type === 'point') return num + ' ● Point — ' + val;
    if (entry.type === 'horizontal_line') return num + ' ═ Row ' + entry.coords.position + ' — ' + val;
    if (entry.type === 'vertical_line')   return num + ' ║ Col ' + entry.coords.position + ' — ' + val;
    if (entry.type === 'rectangle') {
      var w = entry.coords.x2 - entry.coords.x1 + 1;
      var h = entry.coords.y2 - entry.coords.y1 + 1;
      return num + ' ▢ Area ' + w + '×' + h + ' — ' + val;
    }
    return num + ' ' + (entry.type || 'unknown') + ' — ' + val;
  }

  /**
   * Bin-pack rectangle history entries into non-overlapping groups (greedy first-fit).
   * Each entry is { coords: {x1,y1,x2,y2}, ... }. Returns array of arrays of entries.
   * Within each returned group, no two rectangles overlap, so they can be filled
   * with solid colors safely on a single mini-grid.
   */
  function packRectanglesIntoGroups(rectEntries) {
    function rectsOverlap(r1, r2) {
      return !(r1.coords.x2 < r2.coords.x1 || r2.coords.x2 < r1.coords.x1
            || r1.coords.y2 < r2.coords.y1 || r2.coords.y2 < r1.coords.y1);
    }
    var groups = [];
    for (var i = 0; i < rectEntries.length; i++) {
      var rect = rectEntries[i];
      var placed = false;
      for (var g = 0; g < groups.length; g++) {
        var hasOverlap = false;
        for (var j = 0; j < groups[g].length; j++) {
          if (rectsOverlap(rect, groups[g][j])) { hasOverlap = true; break; }
        }
        if (!hasOverlap) {
          groups[g].push(rect);
          placed = true;
          break;
        }
      }
      if (!placed) groups.push([rect]);
    }
    return groups;
  }

  /**
   * Capture a URL parameter (returns null if absent).
   */
  function getUrlParam(name) {
    var params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  /**
   * Capture participant identifiers from URL or generate a UUID fallback.
   */
  function captureUrlIdentifiers() {
    var participantId = getUrlParam('PROLIFIC_PID')
      || getUrlParam('workerId')
      || getUrlParam('participant_id')
      || generateUUID();
    var studyId = getUrlParam('STUDY_ID')
      || getUrlParam('studyId')
      || 'local';
    var sessionId = getUrlParam('SESSION_ID')
      || getUrlParam('sessionId')
      || 'local';
    return { participantId: participantId, studyId: studyId, sessionId: sessionId };
  }

  // v7: DataPipe experiment ID for OSF storage
  window.DATAPIPE_EXPERIMENT_ID = '3zBjDGYni5L6';

  /**
   * v7: Save CSV data to OSF via DataPipe (POST). Returns a Promise.
   * On failure (HTTP error, network error), falls back to a local file
   * download so participant data is never lost.
   *
   * v8 (richer logging): when the request fails we now log:
   *   - the HTTP status + statusText
   *   - the full response body (text)
   *   - a short request summary: URL, key names, experimentID, filename,
   *     CSV column header (1st line), CSV size (bytes + line count)
   * URL/headers/payload format are unchanged.
   */
  /**
   * v10: Core DataPipe POST. Same URL/headers/body keys as always.
   * Throws a rich Error (status, statusText, responseBody, responseJson)
   * on any non-2xx. NO fallback download here — callers decide that.
   */
  function postToDataPipe(csvString, filename) {
    var ENDPOINT = 'https://pipe.jspsych.org/api/data/';
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': '*/*'
      },
      body: JSON.stringify({
        experimentID: window.DATAPIPE_EXPERIMENT_ID,
        filename: filename,
        data: csvString
      })
    }).then(function (response) {
      return response.text().then(function (txt) {
        if (!response.ok) {
          var err = new Error('DataPipe HTTP ' + response.status + ' ' + response.statusText);
          err.status = response.status;
          err.statusText = response.statusText;
          err.responseBody = txt;
          try { err.responseJson = txt ? JSON.parse(txt) : null; }
          catch (e) { err.responseJson = null; }
          throw err;
        }
        try { return txt ? JSON.parse(txt) : {}; }
        catch (e) { return { raw: txt }; }
      });
    });
  }

  /**
   * v10: Local CSV download (used ONLY as fallback for failed CRITICAL files).
   */
  function downloadCSVLocal(csvString, filename) {
    var blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function saveDataToOSF(csvString, filename) {

    // Build a non-sensitive request summary used for diagnostic logs.
    function buildRequestSummary() {
      var firstLine = (csvString || '').split('\n', 1)[0];
      var lineCount = (csvString || '').split('\n').length;
      return {
        url: 'https://pipe.jspsych.org/api/data/',
        method: 'POST',
        contentType: 'application/json',
        bodyKeys: ['experimentID', 'filename', 'data'],
        experimentID: window.DATAPIPE_EXPERIMENT_ID,
        filename: filename,
        dataType: typeof csvString,
        dataByteLength: (csvString || '').length,
        dataLineCount: lineCount,
        csvHeader: firstLine
      };
    }

    return postToDataPipe(csvString, filename).catch(function (err) {
      // ---- v8: Richer error logging ----
      console.groupCollapsed(
        '%c[DataPipe] Save failed — %s',
        'color:#c62828;font-weight:bold;',
        err && err.message ? err.message : String(err)
      );
      console.error('Error object:', err);
      if (err && err.status !== undefined) {
        console.error('HTTP status:', err.status, err.statusText || '');
      }
      if (err && err.responseBody !== undefined) {
        console.error('Response body (raw):', err.responseBody);
      }
      if (err && err.responseJson) {
        console.error('Response body (parsed):', err.responseJson);
      }
      console.error('Request summary:', buildRequestSummary());
      console.groupEnd();

      // Fallback: trigger local download so data is not lost.
      try {
        downloadCSVLocal(csvString, filename);
      } catch (e) {
        console.warn('[DataPipe] Local fallback download also failed', e);
      }
      throw err;
    });
  }

  /**
   * Legacy alias — old code paths may still call window.saveData.
   * Now delegates to saveDataToOSF.
   */
  function saveData(csvString, filename) {
    return saveDataToOSF(csvString, filename);
  }

  // ===========================================================================
  // v10: INCREMENTAL CHECKPOINT SAVING — sequential queue with retry/backoff
  // ===========================================================================

  window.SAVE_CONFIG = {
    checkpointEveryNRounds: 1,   // raise to 2-3 if rate limits ever appear
    maxRetries: 3,
    retryDelaysMs: [1000, 2000, 4000],
    interRequestDelayMs: 500
  };

  function _sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /**
   * Sequential save queue. Items are POSTed to DataPipe ONE AT A TIME
   * (never parallel), with interRequestDelayMs between requests and up to
   * maxRetries retries per item using retryDelaysMs backoff.
   *
   * Checkpoint items (critical=false) NEVER trigger a fallback download —
   * fallback downloads are reserved for CRITICAL files at completion and
   * are triggered by the completion plugin via criticalFailures().
   *
   * Duplicate handling (probed live): DataPipe returns
   *   400 {"error":"OSF_FILE_EXISTS","message":"The OSF file already exists..."}
   * when a filename was already saved. If we see this on any attempt, the
   * file IS on OSF (an earlier attempt landed), so we mark the item 'ok'.
   */
  window.saveQueue = {
    items: [],        // {filename, csvString, critical, status, attempts, lastError}
    processing: false,
    _waiters: [],

    enqueue: function (filename, csvString, critical) {
      if (!csvString) {
        console.warn('[saveQueue] skipping empty CSV for', filename);
        return;
      }
      this.items.push({
        filename: filename,
        csvString: csvString,
        critical: !!critical,
        status: 'pending',
        attempts: 0,
        lastError: null
      });
      console.log('[saveQueue] enqueued', filename,
        '(' + csvString.length + ' bytes, critical=' + !!critical + ')');
      this._kick();
    },

    _kick: function () {
      if (this.processing) return;
      this.processing = true;
      var self = this;
      (function loop() {
        var item = null;
        for (var i = 0; i < self.items.length; i++) {
          if (self.items[i].status === 'pending') { item = self.items[i]; break; }
        }
        if (!item) {
          self.processing = false;
          self._notify();
          // Items may have been enqueued while we were finishing up
          if (self.items.some(function (it) { return it.status === 'pending'; })) {
            self._kick();
          }
          return;
        }
        item.status = 'sending';
        self._sendWithRetry(item).then(function () {
          return _sleep(window.SAVE_CONFIG.interRequestDelayMs);
        }).then(loop, loop);
      })();
    },

    _sendWithRetry: function (item) {
      var cfg = window.SAVE_CONFIG;
      var attempt = 0;
      function tryOnce() {
        item.attempts = attempt + 1;
        return postToDataPipe(item.csvString, item.filename).then(function (res) {
          item.status = 'ok';
          console.log('[saveQueue] OK', item.filename,
            '(attempt ' + item.attempts + ')', res);
        }, function (err) {
          // Duplicate filename → an earlier attempt landed on OSF; treat as ok
          if (err && err.responseJson && err.responseJson.error === 'OSF_FILE_EXISTS') {
            item.status = 'ok';
            console.log('[saveQueue] OK (OSF_FILE_EXISTS — earlier attempt landed)',
              item.filename, '(attempt ' + item.attempts + ')');
            return;
          }
          item.lastError = err;
          console.warn('[saveQueue] attempt ' + item.attempts + ' failed for',
            item.filename, '| status:', err && err.status,
            '| body:', (err && err.responseBody) || (err && err.message));
          if (attempt < cfg.maxRetries) {
            var delay = cfg.retryDelaysMs[Math.min(attempt, cfg.retryDelaysMs.length - 1)];
            attempt++;
            return _sleep(delay).then(tryOnce);
          }
          item.status = 'failed';
          console.error('[saveQueue] FAILED after ' + item.attempts + ' attempts:',
            item.filename);
        });
      }
      return tryOnce();
    },

    /**
     * Resolves when no items are pending or sending. Resolves with a snapshot
     * of all items.
     */
    allSettled: function () {
      var self = this;
      var busy = self.items.some(function (it) {
        return it.status === 'pending' || it.status === 'sending';
      });
      if (!busy) return Promise.resolve(self.items.slice());
      return new Promise(function (resolve) { self._waiters.push(resolve); });
    },

    _notify: function () {
      var busy = this.items.some(function (it) {
        return it.status === 'pending' || it.status === 'sending';
      });
      if (busy) return;
      var waiters = this._waiters.splice(0);
      var snapshot = this.items.slice();
      waiters.forEach(function (w) { w(snapshot); });
    },

    criticalFailures: function () {
      return this.items.filter(function (it) {
        return it.critical && it.status === 'failed';
      });
    }
  };

  // ===========================================================================
  // v10: SHARED ROW BUILDERS (moved from plugin-completion.js so checkpoint
  // code and the completion plugin use the SAME builders)
  // ===========================================================================

  /**
   * Behavior rows — one per non-demographics/non-completion trial.
   * v10: all_clicks column REMOVED (isolated into buildClicksRows so behavior
   * payloads stay small). click_count / page_time_ms / time_to_first_click_ms
   * and all other columns retained.
   */
  // v11: fixed phase -> landscape id mapping (mirrors main.js assignments).
  var PHASE_TO_LANDSCAPE_ID = { training1: 1, training2: 2, experiment: 3 };

  function buildBehaviorRows(allData, state) {
    var rows = [];
    allData.forEach(function (d, idx) {
      // Skip demographics and completion meta-trials; only include experimental rounds
      if (d.trial_kind === 'demographics' || d.trial_kind === 'completion') return;
      rows.push({
        trial_type: d.query_type || d.trial_kind || d.trial_type || 'behavior',
        participant_id: state.participantId || '',
        study_id: state.studyId || '',
        session_id: state.sessionId || '',
        id_source: state.idSource || '',
        trial_index: idx,
        trial_kind: d.trial_kind || d.trial_type || '',
        phase: d.phase || state.phase || '',
        // v11: derive from the row's OWN stamped phase, not from state at
        // extraction time (which is always the last landscape, id 3).
        // Fixed design mapping, matching main.js: training1->1, training2->2,
        // experiment->3. A row that never stamped a phase gets '' — never guess.
        landscape_id: PHASE_TO_LANDSCAPE_ID[d.phase] || '',
        round: d.round !== undefined ? d.round : '',
        query_type: d.query_type || '',
        orientation: d.orientation || '',
        position: d.position !== undefined ? d.position : '',
        x: d.x !== undefined ? d.x : '',
        y: d.y !== undefined ? d.y : '',
        x1: d.x1 !== undefined ? d.x1 : '',
        y1: d.y1 !== undefined ? d.y1 : '',
        x2: d.x2 !== undefined ? d.x2 : '',
        y2: d.y2 !== undefined ? d.y2 : '',
        area: d.area !== undefined ? d.area : '',
        query_value: d.query_value !== undefined ? d.query_value : '',
        feedback_value: d.feedback_value !== undefined ? d.feedback_value : '',
        guess_x: d.guess_x !== undefined ? d.guess_x : '',
        guess_y: d.guess_y !== undefined ? d.guess_y : '',
        guess_value: d.guess_value !== undefined ? d.guess_value : '',
        is_final: d.is_final !== undefined ? d.is_final : '',
        choice: d.choice || '',
        round_at_decision: d.round_at_decision !== undefined ? d.round_at_decision : '',
        correct: d.correct !== undefined ? d.correct : '',
        rt: d.rt !== undefined ? d.rt : '',
        page_time_ms: d.page_time_ms !== undefined ? d.page_time_ms : '',
        time_to_first_click_ms: d.time_to_first_click_ms !== undefined ? d.time_to_first_click_ms : '',
        click_count: d.click_count !== undefined ? d.click_count : '',
        timestamp: new Date().toISOString()
      });
    });
    return rows;
  }

  /**
   * Clicks rows — one per trial that has all_clicks data. Isolates the only
   * large field into its own file.
   */
  function buildClicksRows(allData, state) {
    var rows = [];
    allData.forEach(function (d, idx) {
      if (!d.all_clicks || d.all_clicks.length === 0) return;
      rows.push({
        trial_type: 'clicks',
        participant_id: state.participantId || '',
        study_id: state.studyId || '',
        session_id: state.sessionId || '',
        trial_index: idx,
        phase: d.phase || '',
        round: d.round !== undefined ? d.round : '',
        all_clicks: JSON.stringify(d.all_clicks)
      });
    });
    return rows;
  }

  function buildDemographicsRow(state) {
    var d = state.demographics || {};
    return {
      trial_type: 'demographics',
      participant_id: state.participantId || '',
      study_id: state.studyId || '',
      session_id: state.sessionId || '',
      id_source: state.idSource || '',
      gender: d.gender || '',
      age: (d.age !== undefined ? d.age : ''),
      education: d.education || '',
      instruction_clarity: (d.instruction_clarity !== undefined ? d.instruction_clarity : ''),
      fun_rating: (d.fun_rating !== undefined ? d.fun_rating : ''),
      comments: d.comments || '',
      completed_at: new Date().toISOString()
    };
  }

  /**
   * Short stable per-session token for filenames (first 8 chars of sessionId,
   * sanitized). Groups files by session; never collides across sessions.
   */
  function getSessShort() {
    var s = String((window.experimentState && window.experimentState.sessionId) || 'nosess');
    s = s.replace(/[^A-Za-z0-9_-]/g, '');
    return s.substring(0, 8) || 'nosess';
  }

  /** Sanitize an ID for use inside a filename. */
  function sanitizeForFilename(id) {
    return String(id || 'unknown').replace(/[^A-Za-z0-9_-]/g, '');
  }

  /** Zero-pad to 2 digits. */
  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  /**
   * Build a CSV string from an array of objects (no download).
   */
  function buildCSV(data) {
    if (!data || data.length === 0) return '';
    var keys = Object.keys(data[0]);
    var lines = [keys.join(',')];
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var values = keys.map(function (k) {
        var v = row[k];
        if (v === null || v === undefined) return '';
        var s = typeof v === 'object' ? JSON.stringify(v) : String(v);
        if (s.indexOf('"') !== -1 || s.indexOf(',') !== -1 || s.indexOf('\n') !== -1) {
          s = '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      });
      lines.push(values.join(','));
    }
    return lines.join('\n');
  }

  // Data save configuration (set in main.js via window.DATA_CONFIG override)
  window.DATA_CONFIG = window.DATA_CONFIG || { mode: 'download', endpoint: null };

  // Export to global namespace
  window.ExperimentUtils = {
    GRID_WIDTH: GRID_WIDTH,
    GRID_HEIGHT: GRID_HEIGHT,
    CELL_SIZE: CELL_SIZE,
    CANVAS_WIDTH: CANVAS_WIDTH,
    CANVAS_HEIGHT: CANVAS_HEIGHT,
    DEFAULT_AMPLITUDE: DEFAULT_AMPLITUDE,
    DEFAULT_NOISE_SD: DEFAULT_NOISE_SD,
    MAX_ROUNDS: MAX_ROUNDS,
    gaussRandom: gaussRandom,
    clamp: clamp,
    randInt: randInt,
    randFloat: randFloat,
    generateParticipantId: generateParticipantId,
    formatTrialRow: formatTrialRow,
    valueToColor: valueToColor,
    getHistoryOpacity: getHistoryOpacity,
    withAlpha: withAlpha,
    packRectanglesIntoGroups: packRectanglesIntoGroups,
    generateUUID: generateUUID,
    exportCSV: exportCSV,
    formatQueryLabel: formatQueryLabel,
    getUrlParam: getUrlParam,
    captureUrlIdentifiers: captureUrlIdentifiers,
    saveData: saveData,
    buildCSV: buildCSV
  };

  // Also expose the spec-named functions at window scope per CLAUDE.md
  window.valueToColor = valueToColor;
  window.getHistoryOpacity = getHistoryOpacity;
  window.packRectanglesIntoGroups = packRectanglesIntoGroups;
  window.saveData = saveData;
  window.saveDataToOSF = saveDataToOSF;
  window.postToDataPipe = postToDataPipe;
  window.downloadCSVLocal = downloadCSVLocal;
  window.buildBehaviorRows = buildBehaviorRows;
  window.buildClicksRows = buildClicksRows;
  window.buildDemographicsRow = buildDemographicsRow;
  window.getSessShort = getSessShort;
  window.sanitizeForFilename = sanitizeForFilename;
  window.pad2 = pad2;
  window.generateUUID = generateUUID;
  window.exportCSV = exportCSV;
  window.formatQueryLabel = formatQueryLabel;

  // ---------------------------------------------------------------------------
  // SHARED HISTORY MINI-GRIDS RENDERER (Option C)
  // Used by: select-query, feedback, guess, continue-decision plugins.
  //
  // Renders the disjoint-group history layout into a container element:
  //   - 1 mini-grid for Points
  //   - 1 mini-grid for Lines
  //   - N mini-grids for Areas (bin-packed via packRectanglesIntoGroups)
  //
  // @param {string} containerId — DOM id of the wrapper element to populate
  // @param {Array}  queryHistory — entries with scanNumber, type, coords, value
  // @param {Object} [opts]
  //   - withTooltips: boolean (true) — attach hover tooltips
  //   - withListSync: HTMLElement (optional) — when set, hovering a mini-grid
  //                   item adds .highlighted to the list <li> with same scanNumber
  //   - listEntryRefs: object map {scanNumber: HTMLElement}
  // ---------------------------------------------------------------------------
  function renderHistoryMiniGrids(containerId, queryHistory, opts) {
    opts = opts || {};
    var container = (typeof containerId === 'string')
      ? document.getElementById(containerId)
      : containerId;
    if (!container) return;
    container.innerHTML = '';
    if (!queryHistory || queryHistory.length === 0) return;

    // Wrap in a row container if needed
    var row = document.createElement('div');
    row.className = 'mini-grids-row';
    container.appendChild(row);

    var pointEntries = [];
    var lineEntries = [];
    var rectEntries = [];
    queryHistory.forEach(function (e) {
      if (e.type === 'point') pointEntries.push(e);
      else if (e.type === 'horizontal_line' || e.type === 'vertical_line') lineEntries.push(e);
      else if (e.type === 'rectangle') rectEntries.push(e);
    });

    function makeMini(title, drawFn, items) {
      var box = document.createElement('div');
      box.className = 'mini-grid-container';
      box.innerHTML = '<div class="mini-grid-title">' + title + '</div>';
      var canvas = document.createElement('canvas');
      box.appendChild(canvas);
      row.appendChild(box);

      var renderer = new window.GridRenderer(canvas, GRID_WIDTH, GRID_HEIGHT, 270, 135);
      renderer.drawGrid();
      drawFn(renderer);

      // Tooltips on hover
      if (opts.withTooltips !== false && items && items.length > 0) {
        attachMiniGridTooltips(canvas, renderer, items, drawFn, opts);
      }
      return { box: box, canvas: canvas, renderer: renderer };
    }

    if (pointEntries.length > 0) {
      makeMini('Points (N=' + pointEntries.length + ')',
        function (r) { r.drawPointHistory(pointEntries); },
        pointEntries);
    }

    if (lineEntries.length > 0) {
      makeMini('Lines (N=' + lineEntries.length + ')',
        function (r) { r.drawLineHistory(lineEntries); },
        lineEntries);
    }

    if (rectEntries.length > 0) {
      var groups = packRectanglesIntoGroups(rectEntries);
      groups.forEach(function (group, idx) {
        var setLabel = groups.length === 1
          ? 'Areas (N=' + group.length + ')'
          : 'Areas — Set ' + (idx + 1) + ' (N=' + group.length + ')';
        makeMini(setLabel,
          function (r) { r.drawRectangleGroup(group); },
          group);
      });
    }
  }

  function attachMiniGridTooltips(canvas, renderer, items, drawFn, opts) {
    var tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);

    var lastHoveredScan = null;

    canvas.addEventListener('mousemove', function (e) {
      var rect = canvas.getBoundingClientRect();
      var scaleX = canvas.width / rect.width;
      var scaleY = canvas.height / rect.height;
      var cx = (e.clientX - rect.left) * scaleX;
      var cy = (e.clientY - rect.top) * scaleY;
      var item = renderer.getItemAtPosition(cx, cy, items);
      if (item) {
        if (item.scanNumber !== lastHoveredScan) {
          lastHoveredScan = item.scanNumber;
          updateListHighlight(opts, item.scanNumber);
          // Redraw with highlighted ring
          renderer.drawGrid();
          drawFn(renderer, { highlightedScan: item.scanNumber });
        }
        tooltip.innerHTML = formatTooltip(item);
        tooltip.style.left = (e.clientX + 12) + 'px';
        tooltip.style.top = (e.clientY + 12) + 'px';
        tooltip.style.display = 'block';
      } else {
        if (lastHoveredScan !== null) {
          lastHoveredScan = null;
          updateListHighlight(opts, null);
          renderer.drawGrid();
          drawFn(renderer);
        }
        tooltip.style.display = 'none';
      }
    });
    canvas.addEventListener('mouseleave', function () {
      if (lastHoveredScan !== null) {
        lastHoveredScan = null;
        updateListHighlight(opts, null);
        renderer.drawGrid();
        drawFn(renderer);
      }
      tooltip.style.display = 'none';
    });
  }

  // Patched drawFn signature: drawPointHistory/drawLineHistory/drawRectangleGroup all
  // accept opts.highlightedScan as the second arg in our methods. The wrapper here
  // calls drawFn(renderer, opts) but the wrapper passed in only takes (renderer).
  // We bridge by re-invoking drawFn with a wrapped renderer that applies the highlight.
  // (Simpler: keep drawFn taking just renderer; the highlight ring is drawn separately.)

  function formatTooltip(item) {
    var num = '#' + item.scanNumber;
    var v = item.value.toFixed(1);
    if (item.type === 'point') {
      return num + ' Point (Col ' + item.coords.x + ', Row ' + item.coords.y + ')<br>Richness: ' + v;
    }
    if (item.type === 'horizontal_line') {
      return num + ' Row ' + item.coords.position + '<br>Avg richness: ' + v;
    }
    if (item.type === 'vertical_line') {
      return num + ' Column ' + item.coords.position + '<br>Avg richness: ' + v;
    }
    if (item.type === 'rectangle') {
      var w = item.coords.x2 - item.coords.x1 + 1;
      var h = item.coords.y2 - item.coords.y1 + 1;
      return num + ' Area ' + w + '×' + h +
        '<br>(' + item.coords.x1 + ',' + item.coords.y1 + ') to (' + item.coords.x2 + ',' + item.coords.y2 + ')' +
        '<br>Avg richness: ' + v;
    }
    return num + ' Richness: ' + v;
  }

  function updateListHighlight(opts, scanNumber) {
    if (!opts.listEntryRefs) return;
    Object.keys(opts.listEntryRefs).forEach(function (k) {
      opts.listEntryRefs[k].classList.remove('highlighted');
    });
    if (scanNumber && opts.listEntryRefs[scanNumber]) {
      opts.listEntryRefs[scanNumber].classList.add('highlighted');
    }
  }

  window.renderHistoryMiniGrids = renderHistoryMiniGrids;

  // ---------------------------------------------------------------------------
  // Per-plugin time + click tracker (v6)
  // ---------------------------------------------------------------------------
  window.startPageTracker = function () {
    return {
      startTime: Date.now(),
      firstClickTime: null,
      clickCount: 0,
      registerClick: function () {
        if (this.firstClickTime === null) this.firstClickTime = Date.now();
        this.clickCount++;
      }
    };
  };

  window.endPageTracker = function (tracker) {
    var endTime = Date.now();
    return {
      page_time_ms: endTime - tracker.startTime,
      time_to_first_click_ms: tracker.firstClickTime
        ? (tracker.firstClickTime - tracker.startTime)
        : null,
      click_count: tracker.clickCount
    };
  };
})();
