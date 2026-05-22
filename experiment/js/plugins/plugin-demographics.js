// =============================================================================
// plugin-demographics.js — Post-experiment demographics form
// =============================================================================

(function () {
  'use strict';

  var info = {
    name: 'demographics',
    parameters: {}
  };

  function Plugin(jsPsych) { this.jsPsych = jsPsych; }
  Plugin.info = info;

  Plugin.prototype.trial = function (display_element, trial) {
    var jsPsych = this.jsPsych;
    var startTime = performance.now();
    var pageTracker = window.startPageTracker();

    var html = '<div class="exp-container demographics-screen">';
    html += '<h2>A few questions to wrap up</h2>';

    // Gender
    html += '<div class="demo-field">';
    html += '<label class="demo-label">Gender:</label>';
    html += '<div class="demo-radio-row">';
    ['Male', 'Female', 'Non-binary', 'Prefer not to say'].forEach(function (g) {
      html += '<label class="demo-radio"><input type="radio" name="gender" value="' + g + '"> ' + g + '</label>';
    });
    html += '</div></div>';

    // Age
    html += '<div class="demo-field">';
    html += '<label class="demo-label" for="demo-age">Age:</label>';
    html += '<input type="number" id="demo-age" class="demo-input" min="13" max="100" placeholder="e.g., 25">';
    html += '</div>';

    // Education
    html += '<div class="demo-field">';
    html += '<label class="demo-label" for="demo-edu">Education:</label>';
    html += '<select id="demo-edu" class="demo-input">';
    html += '<option value="">-- Select --</option>';
    ['Less than high school', 'High school diploma', 'Some college', "Bachelor's degree", 'Graduate degree'].forEach(function (e) {
      html += '<option value="' + e + '">' + e + '</option>';
    });
    html += '</select></div>';

    // Clarity rating
    html += '<div class="demo-field">';
    html += '<label class="demo-label">How clear were the instructions?</label>';
    html += '<div class="demo-radio-row demo-rating-row">';
    html += '<span class="demo-rating-end">Very unclear</span>';
    for (var i = 1; i <= 5; i++) {
      html += '<label class="demo-radio"><input type="radio" name="clarity" value="' + i + '"> ' + i + '</label>';
    }
    html += '<span class="demo-rating-end">Very clear</span>';
    html += '</div></div>';

    // Fun rating
    html += '<div class="demo-field">';
    html += '<label class="demo-label">How fun was this game?</label>';
    html += '<div class="demo-radio-row demo-rating-row">';
    html += '<span class="demo-rating-end">Not fun at all</span>';
    for (var j = 1; j <= 5; j++) {
      html += '<label class="demo-radio"><input type="radio" name="fun" value="' + j + '"> ' + j + '</label>';
    }
    html += '<span class="demo-rating-end">Very fun</span>';
    html += '</div></div>';

    // Comments
    html += '<div class="demo-field">';
    html += '<label class="demo-label" for="demo-comments">Any comments?</label>';
    html += '<textarea id="demo-comments" class="demo-input demo-textarea" rows="4" placeholder="Optional"></textarea>';
    html += '</div>';

    html += '<div class="nav-row">';
    html += '<button class="next-btn" id="btn-submit" disabled>Submit &rarr;</button>';
    html += '</div>';
    html += '</div>';

    display_element.innerHTML = html;

    var ageInput = document.getElementById('demo-age');
    var eduSelect = document.getElementById('demo-edu');
    var commentsInput = document.getElementById('demo-comments');
    var submitBtn = document.getElementById('btn-submit');

    function getChecked(name) {
      var els = display_element.querySelectorAll('input[name="' + name + '"]:checked');
      return els.length > 0 ? els[0].value : null;
    }

    function validate() {
      var age = parseInt(ageInput.value, 10);
      var valid = getChecked('gender') &&
                  !isNaN(age) && age >= 13 && age <= 100 &&
                  eduSelect.value &&
                  getChecked('clarity') &&
                  getChecked('fun');
      submitBtn.disabled = !valid;
    }

    // Wire up all inputs
    display_element.querySelectorAll('input, select, textarea').forEach(function (el) {
      el.addEventListener('change', function () { pageTracker.registerClick(); validate(); });
      el.addEventListener('input', function () { pageTracker.registerClick(); validate(); });
    });

    submitBtn.addEventListener('click', function () {
      pageTracker.registerClick();
      var data = {
        gender: getChecked('gender'),
        age: parseInt(ageInput.value, 10),
        education: eduSelect.value,
        instruction_clarity: parseInt(getChecked('clarity'), 10),
        fun_rating: parseInt(getChecked('fun'), 10),
        comments: commentsInput.value || '',
        rt: Math.round(performance.now() - startTime)
      };
      window.experimentState.demographics = data;
      Object.assign(data, window.endPageTracker(pageTracker));
      jsPsych.finishTrial(data);
    });
  };

  window.jsPsychDemographics = Plugin;
})();
