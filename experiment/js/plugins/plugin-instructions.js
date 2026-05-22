// =============================================================================
// plugin-instructions.js — 3-screen welcome/tutorial flow
// =============================================================================

(function () {
  'use strict';

  var info = {
    name: 'instructions',
    parameters: {}
  };

  function Plugin(jsPsych) { this.jsPsych = jsPsych; }
  Plugin.info = info;

  Plugin.prototype.trial = function (display_element, trial) {
    var jsPsych = this.jsPsych;
    var rtPerScreen = [];
    var screenStartTime = performance.now();
    var currentScreen = 0;

    var screens = [
      buildWelcome,
      buildScannerTypes,
      buildHowItWorks
    ];

    function render() {
      var html = screens[currentScreen]();
      display_element.innerHTML = html;
      // Render any mini-grids if present
      if (currentScreen === 1) drawComicStrip();
      document.getElementById('btn-next').addEventListener('click', onNext);
    }

    function onNext() {
      var now = performance.now();
      rtPerScreen.push(Math.round(now - screenStartTime));
      screenStartTime = now;
      currentScreen++;
      if (currentScreen >= screens.length) {
        jsPsych.finishTrial({ rt_per_screen: rtPerScreen });
      } else {
        render();
      }
    }

    function buildWelcome() {
      return '<div class="exp-container instructions-screen">' +
        '<h1>Welcome to Richness Explorer!</h1>' +
        '<p class="instructions-body">' +
        "You'll explore a map to find the richest spot. Every location on the map has a richness score from 0 to 100. " +
        'Some areas are richer than others. Your goal: find the single spot with the <strong>HIGHEST</strong> richness score.' +
        '</p>' +
        '<div class="nav-row">' +
        '<button class="next-btn" id="btn-next">Next &rarr;</button>' +
        '</div>' +
        '</div>';
    }

    function buildScannerTypes() {
      return '<div class="exp-container instructions-screen">' +
        '<h1>Your scanning tools</h1>' +
        '<div class="comic-strip">' +
          '<div class="comic-panel">' +
            '<canvas class="mini-grid" id="mini-point" width="200" height="100"></canvas>' +
            '<p class="comic-caption"><strong>Point scan</strong><br>Scan one spot. Get its exact richness.</p>' +
          '</div>' +
          '<div class="comic-panel">' +
            '<canvas class="mini-grid" id="mini-line" width="200" height="100"></canvas>' +
            '<p class="comic-caption"><strong>Line scan</strong><br>Scan a whole row or column. Get the average richness.</p>' +
          '</div>' +
          '<div class="comic-panel">' +
            '<canvas class="mini-grid" id="mini-rect" width="200" height="100"></canvas>' +
            '<p class="comic-caption"><strong>Area scan</strong><br>Scan a rectangular area. Get the average richness.</p>' +
          '</div>' +
        '</div>' +
        '<div class="nav-row">' +
        '<button class="next-btn" id="btn-next">Next &rarr;</button>' +
        '</div>' +
        '</div>';
    }

    function buildHowItWorks() {
      return '<div class="exp-container instructions-screen">' +
        '<h1>How the game works</h1>' +
        '<div class="instructions-body">' +
          '<p>Each round you will:</p>' +
          '<ol class="how-it-works-list">' +
            '<li>Choose a scanner type</li>' +
            '<li>Scan the map</li>' +
            '<li>See your result</li>' +
            '<li>Guess where the richest spot is</li>' +
          '</ol>' +
          "<p>Your past scans will always be shown on the map, so you don't need to memorize anything.</p>" +
          "<p><strong>Let's practice first!</strong></p>" +
        '</div>' +
        '<div class="nav-row">' +
        '<button class="next-btn" id="btn-next">Start practice &rarr;</button>' +
        '</div>' +
        '</div>';
    }

    function drawComicStrip() {
      drawMiniGrid('mini-point', function (ctx, w, h) {
        ctx.beginPath();
        ctx.arc(w * 0.55, h * 0.45, 5, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(41, 98, 255, 0.9)';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
      drawMiniGrid('mini-line', function (ctx, w, h) {
        ctx.fillStyle = 'rgba(41, 98, 255, 0.35)';
        ctx.fillRect(0, h * 0.45, w, 10);
      });
      drawMiniGrid('mini-rect', function (ctx, w, h) {
        ctx.strokeStyle = 'rgba(41, 98, 255, 0.9)';
        ctx.lineWidth = 2;
        ctx.strokeRect(w * 0.2, h * 0.2, w * 0.5, h * 0.55);
      });
    }

    function drawMiniGrid(canvasId, drawOverlay) {
      var canvas = document.getElementById(canvasId);
      if (!canvas) return;
      var ctx = canvas.getContext('2d');
      var w = canvas.width;
      var h = canvas.height;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.lineWidth = 0.5;
      var step = 10;
      for (var x = 0; x <= w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, h);
        ctx.stroke();
      }
      for (var y = 0; y <= h; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(w, y + 0.5);
        ctx.stroke();
      }
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

      if (drawOverlay) drawOverlay(ctx, w, h);
    }

    render();
  };

  window.jsPsychInstructions = Plugin;
})();
