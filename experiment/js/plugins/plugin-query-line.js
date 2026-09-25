// =============================================================================
// plugin-query-line.js — Execute a line (row/column) scan
// CHANGES (Option C):
//   - NO default H/V — both buttons start unselected
//   - Grid is non-interactive until a direction is chosen
//   - Training mode locks direction per state.trainingForcedOrientation
// =============================================================================

(function () {
  'use strict';

  var info = {
    name: 'query-line',
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
    var selectedOrientation = null;   // NO default
    var selectedPosition = null;

    var forcedOrient = state.trainingForcedOrientation || null;
    var isTraining = !!forcedOrient;

    // --- Build HTML ---
    var html = '<div class="exp-container">';
    html += '<div class="exp-header">';
    html += '<span class="round-label">Round ' + state.currentRound + '</span>';
    html += '</div>';

    html += '<p class="instruction-text">Click the map to scan a row or column.</p>';

    var statusInitial = isTraining
      ? 'Click the locked direction button below to begin.'
      : 'First choose: Horizontal or Vertical?';

    html += '<div class="line-status" id="line-status">' + statusInitial + '</div>';

    // Direction toggle buttons
    var hClass = 'direction-toggle-button';
    var vClass = 'direction-toggle-button';
    if (isTraining) {
      if (forcedOrient === 'horizontal') { hClass += ' locked pulsing'; vClass += ' disabled'; }
      else { vClass += ' locked pulsing'; hClass += ' disabled'; }
    } else {
      hClass += ' unselected';
      vClass += ' unselected';
    }

    html += '<div class="direction-toggle-row">';
    html += '<button class="' + hClass + '" data-orient="horizontal" id="btn-horiz"' +
            (isTraining && forcedOrient !== 'horizontal' ? ' disabled' : '') + '>Horizontal (scan a row ↔)</button>';
    html += '<button class="' + vClass + '" data-orient="vertical" id="btn-vert"' +
            (isTraining && forcedOrient !== 'vertical' ? ' disabled' : '') + '>Vertical (scan a column ↕)</button>';
    html += '</div>';

    html += '<div class="grid-area">';
    html += '<canvas id="exp-canvas"></canvas>';
    html += '</div>';

    html += '<div class="coord-display" id="coord-display">Selected: —</div>';
    html += '<div class="subtle-hint">Click again to change your selection</div>';

    html += '<div class="nav-row">';
    html += '<button class="action-btn next-btn" id="btn-next" disabled>Scan this line →</button>';
    html += '</div>';
    html += '</div>';

    display_element.innerHTML = html;

    // --- Setup grid (initially non-interactive) ---
    var canvas = document.getElementById('exp-canvas');
    var renderer = new window.GridRenderer(canvas);
    var coordDisplay = document.getElementById('coord-display');
    var statusEl = document.getElementById('line-status');
    var nextBtn = document.getElementById('btn-next');
    var btnHoriz = document.getElementById('btn-horiz');
    var btnVert = document.getElementById('btn-vert');

    function redraw(r) {
      r.drawGrid();
      if (selectedPosition !== null) {
        r.highlightLine(selectedOrientation, selectedPosition, 'rgba(41, 98, 255, 0.45)');
      }
      if (r._crosshairPos) {
        r._drawCrosshair(r._crosshairPos.x, r._crosshairPos.y);
      }
    }

    function activateGrid() {
      renderer.enableMouseTracking({
        onClick: function (gridPos) {
          pageTracker.registerClick();
          allClicks.push({
            x: gridPos.x, y: gridPos.y,
            orientation: selectedOrientation,
            time: Math.round(performance.now() - startTime)
          });
          if (selectedOrientation === 'horizontal') {
            selectedPosition = gridPos.y;
            coordDisplay.textContent = 'You selected: Row ' + gridPos.y;
          } else {
            selectedPosition = gridPos.x;
            coordDisplay.textContent = 'You selected: Column ' + gridPos.x;
          }
          nextBtn.disabled = false;
          redraw(renderer);
        },
        redraw: redraw
      });
    }

    function setOrientation(orient) {
      selectedOrientation = orient;
      btnHoriz.classList.toggle('selected', orient === 'horizontal');
      btnVert.classList.toggle('selected', orient === 'vertical');
      btnHoriz.classList.remove('unselected', 'pulsing');
      btnVert.classList.remove('unselected', 'pulsing');
      selectedPosition = null;
      coordDisplay.textContent = 'Selected: —';
      nextBtn.disabled = true;
      statusEl.textContent = 'Now click the map to select a ' +
        (orient === 'horizontal' ? 'row' : 'column') + '.';
      activateGrid();
      redraw(renderer);
    }

    btnHoriz.addEventListener('click', function () {
      pageTracker.registerClick();
      if (btnHoriz.disabled) return;
      setOrientation('horizontal');
    });
    btnVert.addEventListener('click', function () {
      pageTracker.registerClick();
      if (btnVert.disabled) return;
      setOrientation('vertical');
    });

    // Initial render: grid only, NOT interactive
    renderer.drawGrid();
    renderer.setInteractive(false);

    // --- Next button ---
    nextBtn.addEventListener('click', function () {
      pageTracker.registerClick();
      if (selectedPosition === null || !selectedOrientation) return;
      var value = window.Landscape.getLineMean(selectedOrientation, selectedPosition);
      state.currentQueryResult = {
        type: selectedOrientation + '_line',
        orientation: selectedOrientation,
        position: selectedPosition,
        value: value,
        area: (selectedOrientation === 'horizontal') ? 100 : 50
      };
      renderer.disableMouseTracking();
      var trialData = {
        // v10.2: stamp phase at SAVE time (the builder's fallback resolves to
        // whatever phase is current at extraction, which is always 'experiment').
        phase: state.phase,
        // v12: stamp round at SAVE time too (was select-query only).
        round: state.currentRound,
        trial_kind: 'query-line',
        query_type: 'line',
        orientation: selectedOrientation,
        position: selectedPosition,
        query_value: Math.round(value * 10) / 10,
        rt: Math.round(performance.now() - startTime),
        all_clicks: allClicks
      };
      Object.assign(trialData, window.endPageTracker(pageTracker));
      jsPsych.finishTrial(trialData);
    });
  };

  window.jsPsychQueryLine = Plugin;
})();
