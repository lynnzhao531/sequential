// =============================================================================
// plugin-feedback.js — Option C: clean main grid (current query only) +
// heatmap legend + history mini-grids row + numbered list with bidirectional
// hover highlighting and tooltips.
// =============================================================================

(function () {
  'use strict';

  var info = {
    name: 'feedback',
    parameters: {}
  };

  function Plugin(jsPsych) { this.jsPsych = jsPsych; }
  Plugin.info = info;

  Plugin.prototype.trial = function (display_element, trial) {
    var jsPsych = this.jsPsych;
    var state = window.experimentState;
    var startTime = performance.now();
    var pageTracker = window.startPageTracker();
    var result = state.currentQueryResult;

    if (!result) {
      jsPsych.finishTrial({ feedback_value: null, rt: 0 });
      return;
    }

    // --- Push current query into queryHistory NOW (with scanNumber) ---
    var currentEntry = buildHistoryEntry(result, state.currentRound,
      state.queryHistory.length + 1);
    state.queryHistory.push(currentEntry);

    // --- Result text ---
    var resultText = '';
    if (result.type === 'point') {
      resultText = 'Richness at your spot: <strong>' + result.value.toFixed(1) + '</strong>';
    } else if (result.type === 'horizontal_line') {
      resultText = 'Average richness across Row ' + result.position + ': <strong>' + result.value.toFixed(1) + '</strong>';
    } else if (result.type === 'vertical_line') {
      resultText = 'Average richness across Column ' + result.position + ': <strong>' + result.value.toFixed(1) + '</strong>';
    } else if (result.type === 'rectangle') {
      var w = result.x2 - result.x1 + 1;
      var h = result.y2 - result.y1 + 1;
      resultText = 'Average richness in this area (' + w + ' × ' + h + ' = ' + (w * h) + ' spots): <strong>' + result.value.toFixed(1) + '</strong>';
    }

    // --- Build HTML ---
    var html = '<div class="exp-container feedback-container">';
    html += '<div class="exp-header"><span class="round-label">Round ' + state.currentRound + '</span></div>';

    // Main grid + scan history list (numbered)
    html += '<div class="grid-and-list-row">';
    html +=   '<div class="main-grid-section">';
    html +=     '<div class="grid-area"><canvas id="main-grid"></canvas></div>';
    html +=     '<div class="grid-mean">Map average richness: <strong>' +
                  state.gridMeanRichness.toFixed(1) + '</strong></div>';
    html +=   '</div>';
    html +=   '<div class="history-list-panel">';
    html +=     '<div class="panel-title">Scan History</div>';
    html +=     '<div id="history-list" class="history-list"></div>';
    html +=   '</div>';
    html += '</div>';

    html += '<div class="result-text">' + resultText + '</div>';

    // Heatmap legend
    html += '<div class="heatmap-legend">';
    html +=   '<span class="legend-end">0</span>';
    html +=   '<div class="legend-bar"></div>';
    html +=   '<span class="legend-end">100</span>';
    html +=   '<span class="legend-label">Richness scale →</span>';
    html += '</div>';

    // Mini-grids row container
    html += '<div id="mini-grids-host"></div>';

    html += '<div class="prompt-text">Where do you think the richest spot is?</div>';
    html += '<div class="nav-row">';
    html +=   '<button class="action-btn next-btn" id="btn-next">Make my guess →</button>';
    html += '</div>';
    html += '</div>';

    display_element.innerHTML = html;

    // --- Render numbered list ---
    var listEntryRefs = renderHistoryList('history-list', state.queryHistory);

    // --- Render main grid: clean base + ONLY the current query at full opacity ---
    var canvas = document.getElementById('main-grid');
    var renderer = new window.GridRenderer(canvas);
    renderer.drawGrid();
    drawCurrentProminent(renderer, currentEntry);
    renderer.setInteractive(false);

    // --- Render mini-grids history row ---
    window.renderHistoryMiniGrids('mini-grids-host', state.queryHistory, {
      withTooltips: true,
      listEntryRefs: listEntryRefs
    });

    // Hover the LIST entries → ring on the matching mini-grid item
    Object.keys(listEntryRefs).forEach(function (sn) {
      var li = listEntryRefs[sn];
      li.addEventListener('mouseenter', function () { li.classList.add('highlighted'); });
      li.addEventListener('mouseleave', function () { li.classList.remove('highlighted'); });
    });

    // --- Next button ---
    document.getElementById('btn-next').addEventListener('click', function () {
      pageTracker.registerClick();
      var trialData = {
        // v10.2: stamp phase at SAVE time (the builder's fallback resolves to
        // whatever phase is current at extraction, which is always 'experiment').
        phase: state.phase,
        trial_kind: 'feedback',
        query_type: result.type,
        feedback_value: Math.round(result.value * 10) / 10,
        rt: Math.round(performance.now() - startTime)
      };
      Object.assign(trialData, window.endPageTracker(pageTracker));
      jsPsych.finishTrial(trialData);
    });
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function buildHistoryEntry(result, round, scanNumber) {
    var entry = {
      round: round,
      scanNumber: scanNumber,
      type: result.type,
      value: result.value,
      area: result.area
    };
    if (result.type === 'point') {
      entry.coords = { x: result.x, y: result.y };
    } else if (result.type === 'horizontal_line' || result.type === 'vertical_line') {
      entry.coords = { position: result.position };
      entry.orientation = result.orientation;
    } else if (result.type === 'rectangle') {
      entry.coords = { x1: result.x1, y1: result.y1, x2: result.x2, y2: result.y2 };
    }
    return entry;
  }

  function renderHistoryList(elementId, queryHistory) {
    var listEl = document.getElementById(elementId);
    listEl.innerHTML = '';
    var refs = {};
    queryHistory.forEach(function (entry, idx) {
      var label = window.formatQueryLabel(entry, idx);
      var color = window.valueToColor(entry.value);
      var div = document.createElement('div');
      div.className = 'history-list-entry';
      div.dataset.scanNumber = entry.scanNumber;
      div.innerHTML = '<span class="history-color-square" style="background:' + color + '"></span>' +
                      '<span class="history-text">' + label + '</span>';
      listEl.appendChild(div);
      refs[entry.scanNumber] = div;
    });
    listEl.scrollTop = listEl.scrollHeight;
    return refs;
  }

  function drawCurrentProminent(renderer, entry) {
    var color = window.valueToColor(entry.value);
    if (entry.type === 'point') {
      renderer.highlightPoint(entry.coords.x, entry.coords.y, color, 8);
    } else if (entry.type === 'horizontal_line') {
      renderer.highlightLine('horizontal', entry.coords.position,
        window.ExperimentUtils.withAlpha(color, 0.55));
    } else if (entry.type === 'vertical_line') {
      renderer.highlightLine('vertical', entry.coords.position,
        window.ExperimentUtils.withAlpha(color, 0.55));
    } else if (entry.type === 'rectangle') {
      renderer.highlightRectFillLabeled(
        entry.coords.x1, entry.coords.y1, entry.coords.x2, entry.coords.y2,
        color, 0.55, entry.value.toFixed(1), '#' + entry.scanNumber);
    }
  }

  window.jsPsychFeedback = Plugin;
})();
