// =============================================================================
// plugin-query-rect.js — Execute a rectangular area scan
// =============================================================================

(function () {
  'use strict';

  var info = {
    name: 'query-rect',
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
    var corner1 = null;
    var corner2 = null;
    var clickCount = 0;
    var waitingForDelay = false;

    // --- Build HTML ---
    var html = '<div class="exp-container">';
    html += '<div class="exp-header">';
    html += '<span class="round-label">Round ' + state.currentRound + '</span>';
    html += '</div>';

    html += '<p class="instruction-text">Click two corners to define a rectangular area.</p>';
    html += '<div class="rect-status" id="rect-status">Step 1: Click the first corner</div>';

    html += '<div class="grid-area">';
    html += '<canvas id="exp-canvas"></canvas>';
    html += '</div>';

    html += '<div class="coord-display" id="coord-display">Corner 1: \u2014 | Corner 2: \u2014</div>';
    html += '<div class="coord-display-sub" id="area-display"></div>';

    html += '<div class="nav-row">';
    html += '<button class="secondary-btn" id="btn-restart" style="display:none">Start over</button>';
    html += '<button class="next-btn" id="btn-next" disabled>Scan this area &rarr;</button>';
    html += '</div>';
    html += '</div>';

    display_element.innerHTML = html;

    var canvas = document.getElementById('exp-canvas');
    var renderer = new window.GridRenderer(canvas);
    var coordDisplay = document.getElementById('coord-display');
    var areaDisplay = document.getElementById('area-display');
    var statusDisplay = document.getElementById('rect-status');
    var nextBtn = document.getElementById('btn-next');
    var restartBtn = document.getElementById('btn-restart');

    function updateDisplay() {
      var c1Text = corner1 ? 'Column ' + corner1.x + ', Row ' + corner1.y : '\u2014';
      var c2Text = corner2 ? 'Column ' + corner2.x + ', Row ' + corner2.y : '\u2014';
      coordDisplay.textContent = 'Corner 1: ' + c1Text + ' | Corner 2: ' + c2Text;
    }

    function redrawAll(r) {
      r.drawGrid();
      r.drawHistoryOverlay(state.queryHistory);
      if (corner1 && corner2) {
        var x1 = Math.min(corner1.x, corner2.x);
        var y1 = Math.min(corner1.y, corner2.y);
        var x2 = Math.max(corner1.x, corner2.x);
        var y2 = Math.max(corner1.y, corner2.y);
        r.highlightRect(x1, y1, x2, y2, 'rgba(41, 98, 255, 0.2)');
      } else if (corner1) {
        r.highlightPoint(corner1.x, corner1.y, 'rgba(41, 98, 255, 0.9)', 6);
      }
      if (r._crosshairPos) {
        r._drawCrosshair(r._crosshairPos.x, r._crosshairPos.y);
      }
    }

    function reset() {
      corner1 = null;
      corner2 = null;
      waitingForDelay = false;
      updateDisplay();
      areaDisplay.textContent = '';
      statusDisplay.textContent = 'Step 1: Click the first corner';
      nextBtn.disabled = true;
      restartBtn.style.display = 'none';
      redrawAll(renderer);
    }

    restartBtn.addEventListener('click', function () {
      pageTracker.registerClick();
      reset();
    });

    renderer.enableMouseTracking({
      onClick: function (gridPos) {
        pageTracker.registerClick();
        if (waitingForDelay) return;

        clickCount++;
        allClicks.push({
          x: gridPos.x,
          y: gridPos.y,
          time: Math.round(performance.now() - startTime),
          click_number: clickCount
        });

        if (corner2 !== null) {
          // Rectangle already shown — reset and treat as new first click
          corner1 = { x: gridPos.x, y: gridPos.y };
          corner2 = null;
          updateDisplay();
          areaDisplay.textContent = '';
          statusDisplay.textContent = 'Step 2: Click the opposite corner';
          nextBtn.disabled = true;
          restartBtn.style.display = 'inline-block';
          redrawAll(renderer);
        } else if (corner1 === null) {
          corner1 = { x: gridPos.x, y: gridPos.y };
          updateDisplay();
          statusDisplay.textContent = 'Step 2: Click the opposite corner';
          restartBtn.style.display = 'inline-block';
          redrawAll(renderer);
        } else {
          corner2 = { x: gridPos.x, y: gridPos.y };
          waitingForDelay = true;
          statusDisplay.textContent = 'Drawing area\u2026';

          setTimeout(function () {
            waitingForDelay = false;
            updateDisplay();
            var x1 = Math.min(corner1.x, corner2.x);
            var y1 = Math.min(corner1.y, corner2.y);
            var x2 = Math.max(corner1.x, corner2.x);
            var y2 = Math.max(corner1.y, corner2.y);
            var w = x2 - x1 + 1;
            var h = y2 - y1 + 1;
            areaDisplay.textContent = 'Area: ' + w + ' \u00d7 ' + h + ' = ' + (w * h) + ' spots';
            statusDisplay.textContent = 'Area selected!';
            nextBtn.disabled = false;
            redrawAll(renderer);
          }, 500);
        }
      },
      redraw: redrawAll
    });

    redrawAll(renderer);

    // --- Next button ---
    nextBtn.addEventListener('click', function () {
      pageTracker.registerClick();
      if (!corner1 || !corner2) return;
      var x1 = Math.min(corner1.x, corner2.x);
      var y1 = Math.min(corner1.y, corner2.y);
      var x2 = Math.max(corner1.x, corner2.x);
      var y2 = Math.max(corner1.y, corner2.y);
      var area = (x2 - x1 + 1) * (y2 - y1 + 1);
      var value = window.Landscape.getRectMean(x1, y1, x2, y2);

      state.currentQueryResult = {
        type: 'rectangle',
        x1: x1,
        y1: y1,
        x2: x2,
        y2: y2,
        value: value,
        area: area
      };
      renderer.disableMouseTracking();
      var trialData = {
        query_type: 'rectangle',
        x1: x1,
        y1: y1,
        x2: x2,
        y2: y2,
        area: area,
        query_value: Math.round(value * 10) / 10,
        rt: Math.round(performance.now() - startTime),
        all_clicks: allClicks
      };
      Object.assign(trialData, window.endPageTracker(pageTracker));
      jsPsych.finishTrial(trialData);
    });
  };

  window.jsPsychQueryRect = Plugin;
})();
