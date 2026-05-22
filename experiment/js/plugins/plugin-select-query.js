// =============================================================================
// plugin-select-query.js — Choose query type (point / line / area)
// Two modes: training (forced + visual guidance) and experiment (free choice).
// IMPORTANT: the main grid on this screen is NON-INTERACTIVE (no crosshair,
// no clicks). Mini-grids below show history.
// =============================================================================

(function () {
  'use strict';

  var info = {
    name: 'select-query',
    parameters: {}
  };

  function Plugin(jsPsych) { this.jsPsych = jsPsych; }
  Plugin.info = info;

  Plugin.prototype.trial = function (display_element, trial) {
    var jsPsych = this.jsPsych;
    var state = window.experimentState;
    var startTime = performance.now();
    var pageTracker = window.startPageTracker();

    var isTraining = !!state.trainingForcedType;
    var forcedType = state.trainingForcedType;
    var forcedOrient = state.trainingForcedOrientation;

    // --- Round label ---
    var roundLabel;
    if (isTraining) {
      roundLabel = 'Practice Round ' + state.currentRound + ' of 3';
    } else {
      var scansUsed = state.queryHistory.length;
      roundLabel = 'Round ' + state.currentRound + ' | Scans used: ' + scansUsed + ' of ' + state.maxRounds;
    }

    // --- Coaching text by forced type/orientation ---
    var coachingText = '';
    if (isTraining) {
      if (forcedType === 'point') {
        coachingText = "For this round, you'll use the Point scanner. Click the button above to confirm.";
      } else if (forcedType === 'line' && forcedOrient === 'horizontal') {
        coachingText = "For this round, you'll use the Line scanner with a horizontal direction. Click the Line button above.";
      } else if (forcedType === 'line' && forcedOrient === 'vertical') {
        coachingText = "For this round, you'll use the Line scanner with a vertical direction. Click the Line button above.";
      } else if (forcedType === 'rectangle') {
        coachingText = "For this round, you'll use the Area scanner. Click the Area button above.";
      }
    }

    // --- Build HTML ---
    var html = '<div class="exp-container select-query-container">';
    html += '<div class="exp-header"><span class="round-label">' + roundLabel + '</span></div>';

    // Training banner (prominent yellow strip with arrow)
    if (isTraining) {
      html += '<div class="scanner-banner">';
      html += '<span class="scanner-banner-icon">⚠️</span> ';
      html += '<span class="scanner-banner-text">STEP 1: Click the highlighted scanner button below ↓</span>';
      html += '</div>';
    }

    // Main grid (non-interactive). In Option C, NO history overlay here —
    // history lives on mini-grids only. Main grid is for the upcoming scan.
    html += '<div class="grid-area' + (isTraining ? ' grid-dimmed' : '') + '">';
    html += '<canvas id="exp-canvas"></canvas>';
    html += '</div>';

    html += '<div class="grid-info">';
    html += 'Map average richness: <strong>' + state.gridMeanRichness.toFixed(1) + '</strong>';
    html += '</div>';

    // Scanner-choice section
    var promptText = isTraining ? 'Choose your scanner:' : 'Choose a scanner first:';
    html += '<p class="instruction-text">' + promptText + '</p>';

    html += '<div class="query-buttons">';
    var lockedClass = function (type) {
      if (!isTraining) return '';
      if (type === forcedType) return ' scanner-button locked pulsing';
      return ' scanner-button disabled';
    };
    html += '<button class="query-btn' + lockedClass('point') + '" data-type="point"' +
            (isTraining && forcedType !== 'point' ? ' disabled' : '') + '>🔵 Point</button>';
    html += '<button class="query-btn' + lockedClass('line') + '" data-type="line"' +
            (isTraining && forcedType !== 'line' ? ' disabled' : '') + '>📏 Line</button>';
    html += '<button class="query-btn' + lockedClass('rectangle') + '" data-type="rectangle"' +
            (isTraining && forcedType !== 'rectangle' ? ' disabled' : '') + '>⬜ Area</button>';
    html += '</div>';

    if (coachingText) {
      html += '<p class="coaching-text">' + coachingText + '</p>';
    }

    html += '<div class="nav-row">';
    html += '<button class="action-btn next-btn" id="btn-next" disabled>Use this scanner →</button>';
    html += '</div>';

    // History mini-grids row (always rendered if there's any history)
    html += '<div id="select-history-row"></div>';

    html += '</div>';
    display_element.innerHTML = html;

    // --- Render base grid only — NO history overlay, NO interactivity ---
    var canvas = document.getElementById('exp-canvas');
    var renderer = new window.GridRenderer(canvas);
    renderer.drawGrid();
    renderer.setInteractive(false);

    // --- Render mini-grids of past history (if any) ---
    if (state.queryHistory && state.queryHistory.length > 0 && window.renderHistoryMiniGrids) {
      window.renderHistoryMiniGrids('select-history-row', state.queryHistory);
    }

    // --- Button logic ---
    var selectedType = null;
    var nextBtn = document.getElementById('btn-next');
    var queryBtns = display_element.querySelectorAll('.query-btn');

    queryBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        pageTracker.registerClick();
        if (btn.disabled) return;
        queryBtns.forEach(function (b) {
          b.classList.remove('selected');
        });
        btn.classList.add('selected');
        selectedType = btn.getAttribute('data-type');
        nextBtn.disabled = false;
        // In training, stop the pulsing animation once clicked
        if (isTraining) btn.classList.remove('pulsing');
      });
    });

    nextBtn.addEventListener('click', function () {
      pageTracker.registerClick();
      if (!selectedType) return;
      state.currentQueryType = selectedType;
      var trialData = {
        trial_kind: 'select-query',
        query_type: selectedType,
        phase: state.phase,
        round: state.currentRound,
        rt: Math.round(performance.now() - startTime)
      };
      Object.assign(trialData, window.endPageTracker(pageTracker));
      jsPsych.finishTrial(trialData);
    });
  };

  window.jsPsychSelectQuery = Plugin;
})();
