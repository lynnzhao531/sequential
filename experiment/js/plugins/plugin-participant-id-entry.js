// =============================================================================
// plugin-participant-id-entry.js — Manual participant ID entry fallback
// Shown ONLY when no participant_id was captured from URL params.
// =============================================================================

(function () {
  'use strict';

  var info = {
    name: 'participant-id-entry',
    parameters: {}
  };

  function Plugin(jsPsych) { this.jsPsych = jsPsych; }
  Plugin.info = info;

  Plugin.prototype.trial = function (display_element, trial) {
    var jsPsych = this.jsPsych;
    var startTime = performance.now();
    var pageTracker = window.startPageTracker();

    // --- Build HTML ---
    var html = '<div class="exp-container id-entry-container">';
    html += '<h2 class="id-entry-header">Welcome &mdash; Participant Information</h2>';
    html += '<p class="id-entry-body">' +
            'Please enter your Prolific ID or CloudResearch ID below. ' +
            'You can find this on the page that sent you here.' +
            '</p>';
    html += '<div class="id-entry-input-wrap">';
    html +=   '<input type="text" id="participant-id-input" class="id-entry-input" ' +
              'placeholder="Enter your participant ID" autocomplete="off" spellcheck="false" />';
    html += '</div>';
    html += '<p class="id-entry-hint">' +
            "If you don't have an ID, type 'test' to proceed (for testing only)." +
            '</p>';
    html += '<div class="nav-row">';
    html +=   '<button class="action-btn id-entry-submit" id="btn-id-submit" disabled>' +
              'Start the experiment →</button>';
    html += '</div>';
    html += '</div>';

    display_element.innerHTML = html;

    var input = document.getElementById('participant-id-input');
    var submitBtn = document.getElementById('btn-id-submit');

    // Allow only alphanumeric + hyphens/underscores (strip everything else live)
    var VALID_RE = /[^A-Za-z0-9_-]/g;

    function validate() {
      pageTracker.registerClick();
      var cleaned = input.value.replace(VALID_RE, '');
      if (cleaned !== input.value) input.value = cleaned;
      var trimmed = input.value.trim();
      submitBtn.disabled = (trimmed.length === 0);
    }

    input.addEventListener('input', validate);
    input.addEventListener('change', validate);
    input.focus();

    // Enter key submits when valid
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !submitBtn.disabled) {
        submitBtn.click();
      }
    });

    submitBtn.addEventListener('click', function () {
      pageTracker.registerClick();
      var entered = input.value.trim();
      if (!entered) return;
      window.experimentState.participantId = entered;
      window.experimentState.idSource = 'manual';

      var trialData = {
        trial_kind: 'participant-id-entry',
        entered_id: entered,
        rt: Math.round(performance.now() - startTime)
      };
      Object.assign(trialData, window.endPageTracker(pageTracker));
      jsPsych.finishTrial(trialData);
    });
  };

  window.jsPsychParticipantIdEntry = Plugin;
})();
