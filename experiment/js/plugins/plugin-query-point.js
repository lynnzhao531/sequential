// =============================================================================
// plugin-query-point.js — Execute a point scan
// =============================================================================

(function () {
  'use strict';

  var info = {
    name: 'query-point',
    parameters: {}
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

    // --- Build HTML ---
    var html = '<div class="exp-container">';
    html += '<div class="exp-header">';
    html += '<span class="round-label">Round ' + state.currentRound + '</span>';
    html += '</div>';

    html += '<p class="instruction-text">Click anywhere on the map to scan that spot.</p>';

    html += '<div class="grid-area">';
    html += '<canvas id="exp-canvas"></canvas>';
    html += '</div>';

    html += '<div class="coord-display" id="coord-display">You selected: \u2014</div>';
    html += '<div class="subtle-hint">Click again to change your selection</div>';

    html += '<div class="nav-row">';
    html += '<button class="next-btn" id="btn-next" disabled>Scan this spot &rarr;</button>';
    html += '</div>';
    html += '</div>';

    display_element.innerHTML = html;

    // --- Setup grid + history + crosshair ---
    var canvas = document.getElementById('exp-canvas');
    var renderer = new window.GridRenderer(canvas);
    var coordDisplay = document.getElementById('coord-display');
    var nextBtn = document.getElementById('btn-next');

    function redrawAll(r) {
      r.drawGrid();
      r.drawHistoryOverlay(state.queryHistory);
      if (selectedPoint) {
        r.highlightPoint(selectedPoint.x, selectedPoint.y, 'rgba(41, 98, 255, 0.9)', 6);
      }
      if (r._crosshairPos) {
        r._drawCrosshair(r._crosshairPos.x, r._crosshairPos.y);
      }
    }

    renderer.enableMouseTracking({
      onClick: function (gridPos) {
        pageTracker.registerClick();
        allClicks.push({
          x: gridPos.x,
          y: gridPos.y,
          time: Math.round(performance.now() - startTime)
        });
        selectedPoint = gridPos;
        coordDisplay.textContent = 'You selected: Column ' + gridPos.x + ', Row ' + gridPos.y;
        nextBtn.disabled = false;
        redrawAll(renderer);
      },
      redraw: redrawAll
    });

    redrawAll(renderer);

    // --- Next button ---
    nextBtn.addEventListener('click', function () {
      pageTracker.registerClick();
      if (!selectedPoint) return;
      var value = window.Landscape.getPointValue(selectedPoint.x, selectedPoint.y);
      state.currentQueryResult = {
        type: 'point',
        x: selectedPoint.x,
        y: selectedPoint.y,
        value: value,
        area: 1
      };
      renderer.disableMouseTracking();
      var trialData = {
        // v10.2: stamp phase at SAVE time (the builder's fallback resolves to
        // whatever phase is current at extraction, which is always 'experiment').
        phase: state.phase,
        query_type: 'point',
        x: selectedPoint.x,
        y: selectedPoint.y,
        query_value: Math.round(value * 10) / 10,
        rt: Math.round(performance.now() - startTime),
        all_clicks: allClicks
      };
      Object.assign(trialData, window.endPageTracker(pageTracker));
      jsPsych.finishTrial(trialData);
    });
  };

  window.jsPsychQueryPoint = Plugin;
})();
