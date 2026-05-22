// =============================================================================
// main.js — jsPsych timeline builder, full experiment runner (v4)
// =============================================================================
// Flow: Instructions → Training 1 (landscape A) → Training 2 (landscape B) →
//       Experiment (landscape C, up to 50 rounds, with continue-decision
//       between every two rounds) → Final guess → Demographics → Thank you
// =============================================================================

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var state = window.experimentState;

    // --- Initialize jsPsych ---
    var jsPsych = initJsPsych({
      on_finish: function () {
        // v7: Data save is now handled by the completion plugin, not here.
        // The default jsPsych ending no longer matters because the completion
        // plugin keeps the participant on its screen until they click the
        // "Return to Prolific" button.
      }
    });

    // ======================================================================
    // v7: URL parameter capture for participant identifiers.
    //   Use jsPsych's data.getURLVariable so we work whether the experiment is
    //   embedded on Prolific, CloudResearch, or any static host.
    // ======================================================================
    var urlPid = jsPsych.data.getURLVariable('PROLIFIC_PID')
      || jsPsych.data.getURLVariable('workerId')
      || jsPsych.data.getURLVariable('participant_id');
    state.participantId = urlPid || null;
    state.studyId = jsPsych.data.getURLVariable('STUDY_ID')
      || jsPsych.data.getURLVariable('studyId')
      || 'unknown';
    state.sessionId = jsPsych.data.getURLVariable('SESSION_ID')
      || jsPsych.data.getURLVariable('sessionId')
      || window.generateUUID();
    state.idSource = urlPid ? 'url_param' : 'pending_manual';

    var timeline = [];

    // ======================================================================
    // v7: PARTICIPANT-ID ENTRY (conditional — only if no URL ID captured)
    // ======================================================================
    timeline.push({
      timeline: [{ type: jsPsychParticipantIdEntry }],
      conditional_function: function () {
        return window.experimentState.participantId === null;
      }
    });

    // ======================================================================
    // 1. INSTRUCTIONS (Welcome → comic-strip tutorial → How it works)
    // ======================================================================
    timeline.push({ type: jsPsychInstructions });

    // ======================================================================
    // 2. TRAINING 1 — Landscape A (upper-left peak, wide spread)
    // ======================================================================
    timeline.push({
      type: jsPsychTransition,
      message: '<h2>Practice round 1</h2><p>Let\'s try each scanner once. Follow the instructions on each screen.</p>',
      button_text: 'Start practice →',
      on_start: function () {
        state.phase = 'training1';
        state.landscapeId = 1;
        window.resetForNewLandscape();
        // Training A: peak in upper-left, wide spread
        window.Landscape.generate({
          cxRange: [15, 35],
          cyRange: [8, 18],
          sxRange: [18, 25],
          syRange: [18, 25]
        });
      }
    });

    pushTrainingRound(timeline, 'point',     null,         'training1');
    // Landscape A → forced HORIZONTAL line
    pushTrainingRound(timeline, 'line',      'horizontal', 'training1');
    pushTrainingRound(timeline, 'rectangle', null,         'training1');

    timeline.push({ type: jsPsychAttentionCheck });
    timeline.push({
      type: jsPsych3dReveal,
      colorScheme: 'warm',
      message: "Here's the actual richness across the map you just explored:"
    });

    // ======================================================================
    // 3. TRAINING 2 — Landscape B (lower-right peak, narrow spread)
    // ======================================================================
    timeline.push({
      type: jsPsychTransition,
      message: '<h2>Let\'s practice with a different map!</h2><p>This time you\'ll try the vertical line scanner.</p>',
      button_text: 'Start →',
      on_start: function () {
        state.phase = 'training2';
        state.landscapeId = 2;
        window.resetForNewLandscape();
        // Training B: peak in lower-right, narrow spread
        window.Landscape.generate({
          cxRange: [65, 85],
          cyRange: [32, 42],
          sxRange: [10, 16],
          syRange: [10, 16]
        });
      }
    });

    pushTrainingRound(timeline, 'point',     null,       'training2');
    // Landscape B → forced VERTICAL line
    pushTrainingRound(timeline, 'line',      'vertical', 'training2');
    pushTrainingRound(timeline, 'rectangle', null,       'training2');

    timeline.push({ type: jsPsychAttentionCheck });
    timeline.push({
      type: jsPsych3dReveal,
      colorScheme: 'cool',
      message: "Here's the actual richness on this second map:",
      appendAfter: 'Each map has its own pattern. Ready for the real challenge?'
    });

    // ======================================================================
    // 4. TRANSITION TO EXPERIMENT
    // ======================================================================
    timeline.push({
      type: jsPsychTransition,
      message:
        '<h2>Now it\'s the real challenge!</h2>' +
        '<ul class="transition-bullets">' +
          '<li>Choose <strong>ANY</strong> scanner type each round</li>' +
          '<li>Scan up to <strong>50</strong> times</li>' +
          '<li>After each round you\'ll decide whether to keep scanning or make your final guess</li>' +
        '</ul>',
      button_text: 'Start exploring! →',
      // v6: only this transition embeds the LLM-agent prompt-injection trap.
      includeLLMTrap: true,
      on_start: function () {
        state.phase = 'experiment';
        state.landscapeId = 3;
        window.resetForNewLandscape();
        state.trainingForcedType = null;
        state.trainingForcedOrientation = null;
        // Experiment: default ranges
        window.Landscape.generate();
      }
    });

    // ======================================================================
    // 5. EXPERIMENT LOOP
    //    Each iteration: select-query → query (conditional) → feedback → guess
    //    → continue-decision (only if currentRound < maxRounds)
    //    Loop ends when quitRequested OR currentRound > maxRounds.
    // ======================================================================
    var experimentRound = {
      timeline: [
        { type: jsPsychSelectQuery },

        // Conditional routing — re-read currentQueryType FRESH each iteration
        {
          timeline: [{ type: jsPsychQueryPoint }],
          conditional_function: function () {
            return !state.quitRequested && state.currentQueryType === 'point';
          }
        },
        {
          timeline: [{ type: jsPsychQueryLine }],
          conditional_function: function () {
            return !state.quitRequested && state.currentQueryType === 'line';
          }
        },
        {
          timeline: [{ type: jsPsychQueryRect }],
          conditional_function: function () {
            return !state.quitRequested && state.currentQueryType === 'rectangle';
          }
        },

        { type: jsPsychFeedback },
        { type: jsPsychGuess },

        // Continue-decision — ONLY when we still have rounds left.
        // After round 50, skip directly to final guess (handled below).
        {
          timeline: [{ type: jsPsychContinueDecision }],
          conditional_function: function () {
            return state.currentRound < state.maxRounds;
          }
        }
      ],
      loop_function: function () {
        if (state.quitRequested) return false;
        if (state.currentRound > state.maxRounds) return false;
        return true;
      }
    };
    timeline.push(experimentRound);

    // ======================================================================
    // 6. FINAL GUESS — shown when quitRequested OR currentRound > maxRounds
    // ======================================================================
    timeline.push({
      timeline: [{ type: jsPsychGuess, is_final: true }],
      conditional_function: function () {
        return state.quitRequested || state.currentRound > state.maxRounds;
      }
    });

    // ======================================================================
    // 6b. FINAL REVEAL — shows the experiment landscape with the participant's
    //     final guess marked as a red sphere. Uses 'final' (green) color scheme
    //     to visually distinguish it from training reveals.
    // ======================================================================
    timeline.push({
      type: jsPsych3dReveal,
      colorScheme: 'final',
      message: "Here was the actual richness map you explored. Your final guess is shown in red.",
      // markerPoint is resolved dynamically at trial-start by jsPsych because
      // we pass a function. To support that, we keep markerPoint as a function
      // that returns the latest guess from state.guessHistory.
      markerPoint: function () {
        var s = window.experimentState;
        if (!s.guessHistory || s.guessHistory.length === 0) return null;
        var lastGuess = s.guessHistory[s.guessHistory.length - 1];
        return { x: lastGuess.x, y: lastGuess.y, value: lastGuess.value };
      }
    });

    // ======================================================================
    // 7. DEMOGRAPHICS
    // ======================================================================
    timeline.push({ type: jsPsychDemographics });

    // ======================================================================
    // 8. v7: COMPLETION — completion-code screen + DataPipe save + redirect
    // ======================================================================
    timeline.push({
      type: jsPsychCompletion,
      completionCode: 'TERIYAKI',
      prolificCompletionUrl: 'https://app.prolific.com/submissions/complete?cc=TERIYAKI'
    });

    // --- Run ---
    jsPsych.run(timeline);
  });

  // ---------------------------------------------------------------------------
  // HELPER: push one forced-type training round (NO continue-decision)
  // ---------------------------------------------------------------------------
  function pushTrainingRound(timeline, forcedType, forcedOrientation, phaseName) {
    timeline.push({
      type: jsPsychSelectQuery,
      on_start: function () {
        window.experimentState.trainingForcedType = forcedType;
        window.experimentState.trainingForcedOrientation = forcedOrientation;
        window.experimentState.phase = phaseName;
      }
    });

    if (forcedType === 'point') timeline.push({ type: jsPsychQueryPoint });
    else if (forcedType === 'line') timeline.push({ type: jsPsychQueryLine });
    else if (forcedType === 'rectangle') timeline.push({ type: jsPsychQueryRect });

    timeline.push({ type: jsPsychFeedback });

    // Advance currentRound on guess on_finish (training-only — continue-decision
    // does this in experiment phase).
    timeline.push({
      type: jsPsychGuess,
      on_finish: function () {
        window.experimentState.currentRound++;
      }
    });
  }

  // v7: showEndScreen REMOVED — completion plugin now owns the final screen
  // (completion code + DataPipe save + Prolific redirect button).

  // v7: buildBehaviorRows REMOVED — moved into plugin-completion.js
})();
