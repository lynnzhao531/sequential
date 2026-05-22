// =============================================================================
// plugin-attention-check.js — Comprehension check after training block
// =============================================================================

(function () {
  'use strict';

  var info = {
    name: 'attention-check',
    parameters: {}
  };

  function Plugin(jsPsych) { this.jsPsych = jsPsych; }
  Plugin.info = info;

  Plugin.prototype.trial = function (display_element, trial) {
    var jsPsych = this.jsPsych;
    var state = window.experimentState;
    var startTime = performance.now();

    // Take the last 3 queries from this training block
    var history = state.queryHistory.slice(-3);
    if (history.length < 3) {
      // Shouldn't happen, but safe exit
      jsPsych.finishTrial({ correct: null, skipped: true });
      return;
    }

    // Determine which option is which type (in order)
    var options = history.map(function (q, idx) {
      var typeLabel;
      var broadType;
      if (q.type === 'point') { typeLabel = 'Point'; broadType = 'point'; }
      else if (q.type === 'horizontal_line' || q.type === 'vertical_line') { typeLabel = 'Line'; broadType = 'line'; }
      else if (q.type === 'rectangle') { typeLabel = 'Area'; broadType = 'area'; }
      else { typeLabel = q.type; broadType = q.type; }
      return {
        scan: idx + 1,
        label: typeLabel,
        broadType: broadType,
        value: q.value
      };
    });

    // Find which has the highest value
    var correctIdx = 0;
    for (var i = 1; i < options.length; i++) {
      if (options[i].value > options[correctIdx].value) correctIdx = i;
    }

    // --- Build HTML ---
    var html = '<div class="exp-container attention-check-screen">';
    html += '<h2>Let\'s check what you\'ve learned!</h2>';
    html += '<div class="attn-scan-list">';
    options.forEach(function (o) {
      html += '<div class="attn-scan-line">Scan ' + o.scan + ': ' + o.label + ' \u2014 <strong>' + o.value.toFixed(1) + '</strong></div>';
    });
    html += '</div>';

    html += '<p class="attn-question">Which scan found the highest average richness?</p>';

    html += '<div class="attn-radio-group">';
    options.forEach(function (o, idx) {
      html += '<label class="attn-radio">' +
        '<input type="radio" name="attn-answer" value="' + idx + '"> ' +
        'Scan ' + o.scan + ': ' + o.label +
        '</label>';
    });
    html += '</div>';

    html += '<div class="nav-row">' +
      '<button class="next-btn" id="btn-submit" disabled>Submit &rarr;</button>' +
      '</div>';

    html += '<div id="attn-feedback" class="attn-feedback-area"></div>';
    html += '</div>';

    display_element.innerHTML = html;

    var submitBtn = document.getElementById('btn-submit');
    var radios = display_element.querySelectorAll('input[name="attn-answer"]');
    var selectedIdx = null;

    radios.forEach(function (r) {
      r.addEventListener('change', function () {
        selectedIdx = parseInt(r.value, 10);
        submitBtn.disabled = false;
      });
    });

    submitBtn.addEventListener('click', function () {
      if (selectedIdx === null) return;
      var isCorrect = selectedIdx === correctIdx;
      var fbDiv = document.getElementById('attn-feedback');

      if (isCorrect) {
        fbDiv.innerHTML = '<div class="attn-correct">\u2713 Correct! You\'re getting the hang of it.</div>';
      } else {
        var detail = options.map(function (o) {
          return o.label + ' found ' + o.value.toFixed(1);
        }).join(', ');
        fbDiv.innerHTML = '<div class="attn-wrong">The correct answer was Scan ' + (correctIdx + 1) + '. ' +
          detail + '. Higher values mean richer areas!</div>';
      }

      // Disable further input
      radios.forEach(function (r) { r.disabled = true; });
      submitBtn.textContent = 'Continue \u2192';
      submitBtn.disabled = false;

      submitBtn.onclick = function () {
        jsPsych.finishTrial({
          correct: isCorrect,
          selected: options[selectedIdx].broadType,
          correct_answer: options[correctIdx].broadType,
          rt: Math.round(performance.now() - startTime)
        });
      };
    });
  };

  window.jsPsychAttentionCheck = Plugin;
})();
