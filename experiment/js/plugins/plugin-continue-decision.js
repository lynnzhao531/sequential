// =============================================================================
// plugin-continue-decision.js — Between-rounds active choice (experiment only)
// Option C: clean main grid (informational, with crosshair) + heatmap legend +
// history mini-grids row + numbered list.
// =============================================================================

(function () {
  'use strict';

  var info = {
    name: 'continue-decision',
    parameters: {}
  };

  function Plugin(jsPsych) { this.jsPsych = jsPsych; }
  Plugin.info = info;

  Plugin.prototype.trial = function (display_element, trial) {
    var jsPsych = this.jsPsych;
    var state = window.experimentState;
    var startTime = performance.now();
    var pageTracker = window.startPageTracker();

    var roundJustCompleted = state.currentRound;
    var scansUsed = state.queryHistory.length;

    // --- Build HTML ---
    var html = '<div class="exp-container continue-decision-container">';
    html += '<div class="round-indicator">Round ' + roundJustCompleted +
            ' complete &mdash; Scans used: ' + scansUsed +
            ' of ' + state.maxRounds + '</div>';

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

    // Heatmap legend + mini-grids row (same layout as feedback/guess)
    html += '<div class="heatmap-legend">';
    html +=   '<span class="legend-end">0</span>';
    html +=   '<div class="legend-bar"></div>';
    html +=   '<span class="legend-end">100</span>';
    html +=   '<span class="legend-label">Richness scale →</span>';
    html += '</div>';

    html += '<div id="mini-grids-host"></div>';

    html += '<div class="prompt-text">What would you like to do?</div>';

    html += '<div class="decision-buttons">';
    html +=   '<button class="action-btn primary" id="btn-continue">Keep scanning →</button>';
    html +=   '<button class="action-btn final-guess-btn" id="btn-final-guess">' +
              '🏆 I have enough — make my final guess</button>';
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

    // --- Main grid: clean base, crosshair-only interactivity (informational) ---
    var canvas = document.getElementById('main-grid');
    var renderer = new window.GridRenderer(canvas);

    function redraw(r) {
      r.drawGrid();
      if (r._crosshairPos) {
        r._drawCrosshair(r._crosshairPos.x, r._crosshairPos.y);
      }
    }

    renderer.enableMouseTracking({
      onClick: function () { pageTracker.registerClick(); /* no-op for choice */ },
      redraw: redraw
    });
    redraw(renderer);

    // --- Mini-grids row ---
    window.renderHistoryMiniGrids('mini-grids-host', state.queryHistory, {
      withTooltips: true,
      listEntryRefs: listEntryRefs
    });

    // --- Buttons ---
    document.getElementById('btn-continue').addEventListener('click', function () {
      pageTracker.registerClick();
      var rt = Math.round(performance.now() - startTime);
      state.currentRound++;
      renderer.disableMouseTracking();
      var trialData = {
        // v10.2: stamp phase at SAVE time (the builder's fallback resolves to
        // whatever phase is current at extraction, which is always 'experiment').
        phase: state.phase,
        // v12: stamp round at SAVE time too (was select-query only).
        round: state.currentRound,
        trial_kind: 'continue-decision',
        choice: 'continue',
        round_at_decision: roundJustCompleted,
        rt: rt
      };
      Object.assign(trialData, window.endPageTracker(pageTracker));
      jsPsych.finishTrial(trialData);
    });

    document.getElementById('btn-final-guess').addEventListener('click', function () {
      pageTracker.registerClick();
      showQuitDialog(pageTracker, function (confirmed) {
        if (!confirmed) return;
        var rt = Math.round(performance.now() - startTime);
        state.quitRequested = true;
        renderer.disableMouseTracking();
        var trialData = {
          // v10.2: stamp phase at SAVE time (the builder's fallback resolves to
          // whatever phase is current at extraction, which is always 'experiment').
          phase: state.phase,
          // v12: stamp round at SAVE time too (was select-query only).
          round: state.currentRound,
          trial_kind: 'continue-decision',
          choice: 'final_guess',
          round_at_decision: roundJustCompleted,
          rt: rt
        };
        Object.assign(trialData, window.endPageTracker(pageTracker));
        jsPsych.finishTrial(trialData);
      });
    });
  };

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

  function showQuitDialog(pageTracker, callback) {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal-dialog">' +
        '<p class="modal-text">Are you sure you have enough information to make your final guess now? ' +
        'You will not be able to continue scanning after this.</p>' +
        '<div class="modal-buttons">' +
          // No, keep scanning — MORE PROMINENT (primary blue)
          '<button class="modal-btn modal-btn-keep" id="modal-no">No, keep scanning</button>' +
          // Yes — DE-EMPHASIZED (gray)
          '<button class="modal-btn modal-btn-ready" id="modal-yes">Yes, I\'m ready</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.querySelector('#modal-yes').addEventListener('click', function () {
      if (pageTracker) pageTracker.registerClick();
      document.body.removeChild(overlay);
      callback(true);
    });
    overlay.querySelector('#modal-no').addEventListener('click', function () {
      if (pageTracker) pageTracker.registerClick();
      document.body.removeChild(overlay);
      callback(false);
    });
  }

  window.jsPsychContinueDecision = Plugin;
})();
