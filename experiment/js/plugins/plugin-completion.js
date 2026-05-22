// =============================================================================
// plugin-completion.js — Final completion code + redirect screen
// Triggers data save (behavior_data + demographics) to OSF via DataPipe.
// =============================================================================

(function () {
  'use strict';

  var info = {
    name: 'completion',
    parameters: {
      completionCode: { type: 'STRING', default: 'COMPLETED' },
      prolificCompletionUrl: { type: 'STRING', default: '' }
    }
  };

  function Plugin(jsPsych) { this.jsPsych = jsPsych; }
  Plugin.info = info;

  Plugin.prototype.trial = function (display_element, trial) {
    var jsPsych = this.jsPsych;
    var state = window.experimentState;
    var code = trial.completionCode || 'COMPLETED';
    var redirectUrl = trial.prolificCompletionUrl || '';
    if (!redirectUrl) {
      redirectUrl = 'https://app.prolific.com/submissions/complete?cc=' + encodeURIComponent(code);
    }

    // --- Build HTML ---
    var html = '<div class="exp-container completion-container">';
    html += '<h2 class="completion-header">Thank you for completing the experiment!</h2>';

    html += '<div class="completion-code-section">';
    html +=   '<div class="completion-code-label">Your completion code:</div>';
    html +=   '<div class="completion-code-box" id="completion-code-box">' + escapeHtml(code) + '</div>';
    html +=   '<button class="copy-code-btn" id="btn-copy-code">📋 Copy code</button>';
    html += '</div>';

    html += '<p class="completion-instructions">' +
            'Please return to Prolific (or CloudResearch) and paste this code to confirm completion.' +
            '</p>';

    html += '<p class="completion-status" id="completion-status">Saving your responses…</p>';

    html += '<div class="nav-row completion-nav-row">';
    html +=   '<button class="action-btn next-btn" id="btn-return-prolific">' +
              '← Return to Prolific</button>';
    html += '</div>';
    html += '</div>';

    display_element.innerHTML = html;

    // --- Data save (behavior + demographics) ---
    var statusEl = document.getElementById('completion-status');
    var copyBtn = document.getElementById('btn-copy-code');
    var returnBtn = document.getElementById('btn-return-prolific');

    var allData = jsPsych.data.get().values();
    var ts = new Date().toISOString().replace(/[:.]/g, '-');
    var pid = state.participantId || 'unknown';

    // BEHAVIOR rows — every non-demographics, non-completion trial.
    var behaviorRows = buildBehaviorRows(allData, state);
    var demoRow = buildDemographicsRow(state);

    var behaviorCSV = window.exportCSV(behaviorRows, 'behavior.csv');
    var demoCSV = window.exportCSV([demoRow], 'demographics.csv');

    var behaviorFilename = 'behavior_' + pid + '_' + ts + '.csv';
    var demoFilename = 'demographics_' + pid + '_' + ts + '.csv';

    // Save both to OSF
    var saveBehavior = window.saveDataToOSF(behaviorCSV, behaviorFilename);
    var saveDemo = window.saveDataToOSF(demoCSV, demoFilename);

    Promise.allSettled([saveBehavior, saveDemo]).then(function (results) {
      var anyFailed = results.some(function (r) { return r.status === 'rejected'; });
      if (anyFailed) {
        statusEl.textContent = '⚠ Data save had an issue. Your responses downloaded as a backup file — please contact the researcher.';
        statusEl.classList.add('completion-status-error');
      } else {
        statusEl.textContent = '✓ Your data has been saved.';
        statusEl.classList.add('completion-status-success');
      }
    });

    // --- Copy code button ---
    copyBtn.addEventListener('click', function () {
      function flashSuccess() {
        var orig = copyBtn.textContent;
        copyBtn.textContent = '✓ Copied!';
        setTimeout(function () { copyBtn.textContent = orig; }, 1500);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(flashSuccess, function () {
          fallbackCopy();
        });
      } else {
        fallbackCopy();
      }
      function fallbackCopy() {
        var box = document.getElementById('completion-code-box');
        var range = document.createRange();
        range.selectNode(box);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        try { document.execCommand('copy'); flashSuccess(); } catch (e) { /* noop */ }
        sel.removeAllRanges();
      }
    });

    // --- Return to Prolific button ---
    returnBtn.addEventListener('click', function () {
      window.location.href = redirectUrl;
    });
  };

  // ---------------------------------------------------------------------------
  function buildBehaviorRows(allData, state) {
    var rows = [];
    allData.forEach(function (d, idx) {
      // Skip demographics and completion meta-trials; only include experimental rounds
      if (d.trial_kind === 'demographics' || d.trial_kind === 'completion') return;
      rows.push({
        participant_id: state.participantId || '',
        study_id: state.studyId || '',
        session_id: state.sessionId || '',
        id_source: state.idSource || '',
        trial_index: idx,
        trial_kind: d.trial_kind || d.trial_type || '',
        phase: d.phase || state.phase || '',
        landscape_id: state.landscapeId || '',
        round: d.round !== undefined ? d.round : '',
        query_type: d.query_type || '',
        orientation: d.orientation || '',
        position: d.position !== undefined ? d.position : '',
        x: d.x !== undefined ? d.x : '',
        y: d.y !== undefined ? d.y : '',
        x1: d.x1 !== undefined ? d.x1 : '',
        y1: d.y1 !== undefined ? d.y1 : '',
        x2: d.x2 !== undefined ? d.x2 : '',
        y2: d.y2 !== undefined ? d.y2 : '',
        area: d.area !== undefined ? d.area : '',
        query_value: d.query_value !== undefined ? d.query_value : '',
        feedback_value: d.feedback_value !== undefined ? d.feedback_value : '',
        guess_x: d.guess_x !== undefined ? d.guess_x : '',
        guess_y: d.guess_y !== undefined ? d.guess_y : '',
        guess_value: d.guess_value !== undefined ? d.guess_value : '',
        is_final: d.is_final !== undefined ? d.is_final : '',
        choice: d.choice || '',
        round_at_decision: d.round_at_decision !== undefined ? d.round_at_decision : '',
        correct: d.correct !== undefined ? d.correct : '',
        rt: d.rt !== undefined ? d.rt : '',
        page_time_ms: d.page_time_ms !== undefined ? d.page_time_ms : '',
        time_to_first_click_ms: d.time_to_first_click_ms !== undefined ? d.time_to_first_click_ms : '',
        click_count: d.click_count !== undefined ? d.click_count : '',
        all_clicks: d.all_clicks ? JSON.stringify(d.all_clicks) : '',
        timestamp: new Date().toISOString()
      });
    });
    return rows;
  }

  function buildDemographicsRow(state) {
    var d = state.demographics || {};
    return {
      participant_id: state.participantId || '',
      study_id: state.studyId || '',
      session_id: state.sessionId || '',
      id_source: state.idSource || '',
      gender: d.gender || '',
      age: (d.age !== undefined ? d.age : ''),
      education: d.education || '',
      instruction_clarity: (d.instruction_clarity !== undefined ? d.instruction_clarity : ''),
      fun_rating: (d.fun_rating !== undefined ? d.fun_rating : ''),
      comments: d.comments || '',
      completed_at: new Date().toISOString()
    };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  window.jsPsychCompletion = Plugin;
})();
