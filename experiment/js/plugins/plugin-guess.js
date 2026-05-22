// =============================================================================
// plugin-guess.js — Click to guess where the richest spot is.
// Option C: clean main grid (interactive, no history overlay) + heatmap legend
// + history mini-grids row + numbered list. Two modes: normal and final.
// =============================================================================

(function () {
  'use strict';

  var info = {
    name: 'guess',
    parameters: {
      is_final: { type: 'BOOL', default: false }
    }
  };

  function Plugin(jsPsych) { this.jsPsych = jsPsych; }
  Plugin.info = info;

  Plugin.prototype.trial = function (display_element, trial) {
    var jsPsych = this.jsPsych;
    var state = window.experimentState;
    var startTime = performance.now();
    var pageTracker = window.startPageTracker();
    var allClicks = [];
    var selectedPoint = null;

    var isFinal = trial.is_final ||
                  state.quitRequested ||
                  state.currentRound > state.maxRounds;

    var instructionText = isFinal
      ? 'This is your FINAL answer. Click the spot you believe has the highest richness.'
      : 'Based on your scans, click where you think the HIGHEST richness is.';
    var warningText = isFinal
      ? '<div class="final-warning">⚠ Your answer cannot be changed after you submit.</div>'
      : '';
    var buttonText = isFinal ? 'Submit final answer →' : 'Confirm guess →';
    var roundLabel = isFinal ? 'Final guess' : 'Round ' + state.currentRound;

    // --- Build HTML ---
    var html = '<div class="exp-container guess-container">';
    html += '<div class="exp-header"><span class="round-label">' + roundLabel + '</span></div>';

    html += '<p class="instruction-text">' + instructionText + '</p>';
    html += warningText;

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

    html += '<div class="coord-display" id="coord-display">Your guess: —</div>';
    if (!isFinal) html += '<div class="subtle-hint">Click again to change</div>';

    // Heatmap legend
    html += '<div class="heatmap-legend">';
    html +=   '<span class="legend-end">0</span>';
    html +=   '<div class="legend-bar"></div>';
    html +=   '<span class="legend-end">100</span>';
    html +=   '<span class="legend-label">Richness scale →</span>';
    html += '</div>';

    html += '<div id="mini-grids-host"></div>';

    html += '<div class="nav-row">';
    html +=   '<button class="action-btn confirm-btn" id="btn-confirm" disabled>' + buttonText + '</button>';
    html += '</div>';
    html += '</div>';

    display_element.innerHTML = html;

    // --- Render numbered list ---
    var listEntryRefs = renderHistoryList('history-list', state.queryHistory);
    Object.keys(listEntryRefs).forEach(function (sn) {
      var li = listEntryRefs[sn];
      li.addEventListener('mouseenter', function () { li.classList.add('highlighted'); });
      li.addEventListener('mouseleave', function () { li.classList.remove('highlighted'); });
    });

    // --- Render mini-grids history ---
    window.renderHistoryMiniGrids('mini-grids-host', state.queryHistory, {
      withTooltips: true,
      listEntryRefs: listEntryRefs
    });

    // --- Setup interactive main grid (clean, no history overlay) ---
    var canvas = document.getElementById('main-grid');
    var renderer = new window.GridRenderer(canvas);
    var coordDisplay = document.getElementById('coord-display');
    var confirmBtn = document.getElementById('btn-confirm');

    function redraw(r) {
      r.drawGrid();
      // Past guesses faintly (orange)
      if (state.guessHistory && state.guessHistory.length > 0) {
        for (var i = 0; i < state.guessHistory.length; i++) {
          var g = state.guessHistory[i];
          r.highlightPoint(g.x, g.y, 'rgba(255, 107, 53, 0.45)', 5);
        }
      }
      if (selectedPoint) {
        r.highlightPoint(selectedPoint.x, selectedPoint.y, 'rgba(255, 107, 53, 0.95)', 8);
      }
      if (r._crosshairPos) {
        r._drawCrosshair(r._crosshairPos.x, r._crosshairPos.y);
      }
    }

    renderer.enableMouseTracking({
      onClick: function (gridPos) {
        pageTracker.registerClick();
        allClicks.push({ x: gridPos.x, y: gridPos.y, time: Math.round(performance.now() - startTime) });
        selectedPoint = gridPos;
        coordDisplay.textContent = 'Your guess: Column ' + gridPos.x + ', Row ' + gridPos.y;
        confirmBtn.disabled = false;
        redraw(renderer);
      },
      redraw: redraw
    });
    redraw(renderer);

    // --- Confirm ---
    confirmBtn.addEventListener('click', function () {
      pageTracker.registerClick();
      if (!selectedPoint) return;
      var guessValue = window.Landscape.getPointValue(selectedPoint.x, selectedPoint.y);
      state.guessHistory.push({
        round: state.currentRound,
        x: selectedPoint.x,
        y: selectedPoint.y,
        value: guessValue
      });
      renderer.disableMouseTracking();
      var trialData = {
        trial_kind: 'guess',
        guess_x: selectedPoint.x,
        guess_y: selectedPoint.y,
        guess_value: Math.round(guessValue * 10) / 10,
        is_final: isFinal,
        rt: Math.round(performance.now() - startTime),
        all_clicks: allClicks
      };
      Object.assign(trialData, window.endPageTracker(pageTracker));
      jsPsych.finishTrial(trialData);
    });
  };

  // ---------------------------------------------------------------------------
  // Helpers (same as feedback)
  // ---------------------------------------------------------------------------

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

  window.jsPsychGuess = Plugin;
})();
