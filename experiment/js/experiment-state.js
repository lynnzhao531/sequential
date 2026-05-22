// =============================================================================
// experiment-state.js — Shared global state object
// =============================================================================

(function () {
  'use strict';

  // URL-derived identifiers captured at module load
  var ids = window.ExperimentUtils.captureUrlIdentifiers();

  window.experimentState = {
    // Persistent across landscapes (NEVER reset by resetForNewLandscape)
    participantId: ids.participantId,
    studyId: ids.studyId,
    sessionId: ids.sessionId,
    phase: 'instructions',     // 'instructions' | 'training1' | 'training2' | 'experiment'
    maxRounds: 50,             // max rounds in experiment phase

    // Per-landscape (reset with resetForNewLandscape)
    landscape: null,
    landscapeId: 0,
    rowMeans: null,
    colMeans: null,
    prefixSum: null,
    gridMeanRichness: 0,
    peakLocation: { x: 0, y: 0 },

    queryHistory: [],          // [{ round, type, coords, value, area, orientation }]
    guessHistory: [],          // [{ round, x, y, value }]
    currentRound: 1,

    // Per-round transient
    currentQueryType: null,           // 'point' | 'line' | 'rectangle'
    currentQueryResult: null,         // filled by query plugins, read by feedback
    trainingForcedType: null,         // if set, select-query is locked to this type
    trainingForcedOrientation: null,  // 'horizontal' | 'vertical' (only for line training)
    quitRequested: false,

    // Extra records
    demographics: null,
    trialRecords: []           // full log of each completed trial
  };

  /**
   * Reset all per-landscape state (call before each new landscape).
   * Preserves: participantId, phase, maxRounds.
   */
  window.resetForNewLandscape = function () {
    var state = window.experimentState;
    state.landscape = null;
    state.rowMeans = null;
    state.colMeans = null;
    state.prefixSum = null;
    state.gridMeanRichness = 0;
    state.peakLocation = { x: 0, y: 0 };
    state.queryHistory = [];
    state.guessHistory = [];
    state.currentRound = 1;
    state.currentQueryType = null;
    state.currentQueryResult = null;
    state.trainingForcedType = null;
    state.trainingForcedOrientation = null;
    state.quitRequested = false;
  };
})();
