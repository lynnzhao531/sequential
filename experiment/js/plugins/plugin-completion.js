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
    // v10.1: disabled (grayed) until the save queue settles or times out —
    // prevents navigating away while the final POSTs are still in flight.
    html +=   '<button class="action-btn next-btn" id="btn-return-prolific" disabled>' +
              '← Return to Prolific</button>';
    html += '</div>';
    html += '</div>';

    display_element.innerHTML = html;

    // --- v10: Final saves via the sequential save queue + honest status ---
    var statusEl = document.getElementById('completion-status');
    var copyBtn = document.getElementById('btn-copy-code');
    var returnBtn = document.getElementById('btn-return-prolific');

    var allData = jsPsych.data.get().values();
    var pidSafe = window.sanitizeForFilename(state.participantId);
    // v10.1: sessShort + per-page-load token — a refreshed run never collides
    // with an earlier run of the same Prolific session.
    var sess = window.getSessShort() + '_' + (state.loadToken || 'nold');

    // Build the three files with the SHARED builders (utils.js)
    var behaviorCSV = window.exportCSV(window.buildBehaviorRows(allData, state));
    var demoCSV = window.exportCSV([window.buildDemographicsRow(state)]);
    var clicksCSV = window.exportCSV(window.buildClicksRows(allData, state));

    var behaviorFilename = 'behavior_' + pidSafe + '_' + sess + '_final.csv';
    var demoFilename = 'demographics_' + pidSafe + '_' + sess + '.csv';
    var clicksFilename = 'clicks_' + pidSafe + '_' + sess + '.csv';

    // Enqueue in order: behavior (critical) → demographics (critical) →
    // clicks (non-critical). The queue sends them one at a time with retry.
    window.saveQueue.enqueue(behaviorFilename, behaviorCSV, /*critical=*/true);
    window.saveQueue.enqueue(demoFilename, demoCSV, /*critical=*/true);
    if (clicksCSV) {
      window.saveQueue.enqueue(clicksFilename, clicksCSV, /*critical=*/false);
    }

    // Drain the queue (final files + any still-pending checkpoints) with a
    // hard 45-second timeout, then show an HONEST status.
    var SAVE_TIMEOUT_MS = 45000;
    var timedOut = false;
    var timeoutPromise = new Promise(function (resolve) {
      setTimeout(function () { timedOut = true; resolve('timeout'); }, SAVE_TIMEOUT_MS);
    });

    Promise.race([window.saveQueue.allSettled(), timeoutPromise]).then(function () {
      var criticalItems = window.saveQueue.items.filter(function (it) { return it.critical; });
      var failedCritical = window.saveQueue.criticalFailures();
      // On timeout, critical items still pending/sending are NOT confirmed
      // saved — treat them as failures for status + fallback purposes.
      var unconfirmedCritical = timedOut
        ? criticalItems.filter(function (it) {
            return it.status === 'pending' || it.status === 'sending';
          })
        : [];
      var problemItems = failedCritical.concat(unconfirmedCritical);

      // Non-critical clicks failure: console.warn only (click_count survives
      // in the behavior CSV — deliberate tradeoff).
      window.saveQueue.items.forEach(function (it) {
        if (!it.critical && it.status === 'failed') {
          console.warn('[completion] non-critical file failed (no download):', it.filename);
        }
      });

      if (problemItems.length === 0) {
        statusEl.textContent = '✓ Your data has been saved.';
        statusEl.classList.add('completion-status-success');
      } else {
        statusEl.textContent = '⚠ Data save had an issue. Your responses downloaded as a backup file — please contact the researcher.';
        statusEl.classList.add('completion-status-error');
        // Fallback download ONLY for the failed/unconfirmed CRITICAL file(s)
        problemItems.forEach(function (it) {
          try { window.downloadCSVLocal(it.csvString, it.filename); }
          catch (e) { console.warn('[completion] fallback download failed for', it.filename, e); }
        });
      }

      // v10.1: saves settled (or timed out) — the participant may now leave.
      returnBtn.disabled = false;
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

  // v10: buildBehaviorRows / buildDemographicsRow moved to utils.js
  // (shared with checkpoint saving in main.js).

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  window.jsPsychCompletion = Plugin;
})();
