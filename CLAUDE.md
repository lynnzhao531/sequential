# Sequential Information Search Experiment — Richness Explorer (Option C variant)

## Project Overview
Browser-based cognitive experiment built with jsPsych 7.
Participants explore a 100×50 grid to find the spot with the highest hidden "richness score."
Each round, they scan a region (point, line, or rectangle), see the average richness in that region,
then guess where the peak is. Between rounds, they actively choose whether to continue scanning or make their final guess. The experiment measures sequential information query strategies and stopping decisions.

**Framing for participants:** "Every spot on this map has a richness score from 0 to 100. Some areas are richer than others. There is one area that is the richest. Your goal: find the single richest spot."

**Never use the word "utility" in any participant-facing text.** Always say "richness" or "richness score."
**Never describe the underlying function shape** (no "smooth hill", "Gaussian", "single peak"). Let participants infer the pattern from the 3D training reveals.

## Tech Stack
- **jsPsych 7.3.4** via CDN (https://unpkg.com/jspsych@7.3.4) — NO npm, NO build tools
- **Vanilla JavaScript** (ES6, no modules/import — use script tags in order)
- **HTML5 Canvas** for grid rendering and interaction
- **Pure CSS** for styling (no Tailwind, no frameworks)
- **Static files only** — runs via `python3 -m http.server 8000` in experiment/ folder
- **Three.js** via CDN (https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js) for 3D surface reveal in training only

## Platform Compatibility
The experiment must work with ANY hosting + recruitment combination:
- **Hosting:** Cognition.run, GitHub Pages, Pavlovia, or any static file server
- **Recruitment:** Prolific, CloudResearch Connect, or direct URL

**URL parameter capture** (in main.js at startup):
```js
var participantId = jsPsych.data.getURLVariable('PROLIFIC_PID')
  || jsPsych.data.getURLVariable('workerId')
  || jsPsych.data.getURLVariable('participant_id')
  || generateUUID();
var studyId = jsPsych.data.getURLVariable('STUDY_ID') || jsPsych.data.getURLVariable('studyId') || 'local';
var sessionId = jsPsych.data.getURLVariable('SESSION_ID') || jsPsych.data.getURLVariable('sessionId') || 'local';
```

**Data saving** (in utils.js):
```js
window.DATA_CONFIG = { mode: 'download', endpoint: null };
```

**Completion redirect** (in thank-you screen):
```js
// window.location = "https://app.prolific.co/submissions/complete?cc=XXXXXXX";
// window.location = "https://connect.cloudresearch.com/participant/project/complete?code=XXXXXXX";
```

## File Structure
```
experiment/
├── index.html
├── css/
│   └── experiment.css
├── js/
│   ├── landscape.js
│   ├── grid-renderer.js
│   ├── experiment-state.js
│   ├── plugins/
│   │   ├── plugin-instructions.js
│   │   ├── plugin-select-query.js
│   │   ├── plugin-query-point.js
│   │   ├── plugin-query-line.js
│   │   ├── plugin-query-rect.js
│   │   ├── plugin-feedback.js
│   │   ├── plugin-guess.js
│   │   ├── plugin-continue-decision.js
│   │   ├── plugin-3d-reveal.js
│   │   ├── plugin-attention-check.js
│   │   ├── plugin-transition.js
│   │   └── plugin-demographics.js
│   ├── main.js
│   └── utils.js
```

## Architecture Rules
1. **No ES6 modules / no import statements** — use `<script>` tags in index.html loaded in dependency order. Each file attaches to a global namespace.
2. **Each jsPsych plugin** is a self-contained class using the `jsPsychPlugin` pattern with an `info` object and `trial()` method.
3. **Shared state** lives in `window.experimentState`:
   ```js
   window.experimentState = {
     landscape: null,
     prefixSum: null,
     rowMeans: null,
     colMeans: null,
     gridMeanRichness: 0,
     peakLocation: {x: 0, y: 0},
     queryHistory: [],
     guessHistory: [],
     currentRound: 1,
     maxRounds: 50,
     currentQueryType: null,
     phase: 'training1',
     trainingForcedType: null,
     participantId: null,
     studyId: null,
     sessionId: null,
     landscapeId: null,
     quitRequested: false
   };
   ```
4. **Grid coordinate system**: x in [0, 99], y in [0, 49], integers. Axis labels every 10 units.
5. **Canvas sizes**:
   - **Main grid**: 800×400px (8×8px per cell). All 5000 cells visible.
   - **History mini-grids**: 270×135px (~2.7×2.7px per cell). Same logical 100×50 grid, displayed compact. No mouse interaction on mini-grids.
   - GridRenderer accepts configurable display dimensions.
6. **GridRenderer** is instantiated fresh in each plugin's `trial()` method.
7. **Cleanup**: Every plugin must remove event listeners and clear DOM in on_finish.
8. **State reset**: queryHistory and guessHistory CLEAR when switching landscapes. currentRound resets to 1.
9. **Dynamic routing**: main.js reads experimentState.currentQueryType FRESH on each loop iteration.
10. **Layer order on MAIN grid (always)**: base grid → current selection (if any) → guess dot (if any) → crosshair on top. Crosshair MUST always be visible.
11. **Layer order on MINI grids**: base grid → all history items of that group/type drawn at full opacity. No crosshair, no interactivity.
12. **Active-selection enforcement (NEW)**: To prevent participants from skipping setup steps:
    - **plugin-select-query**: the main grid is **NON-INTERACTIVE** on this screen — no crosshair appears, clicks register nothing. Participants MUST click a scanner button first. In TRAINING phase, prominent visual guidance (banner: "STEP 1: Click a scanner type below to begin", pulsing button border, dimmed grid). In EXPERIMENT phase, lighter guidance (text only, no animation).
    - **plugin-query-line**: NO default H/V selection. Both Horizontal and Vertical buttons start UNSELECTED (gray). The grid is non-interactive until participants click one direction. Status text: "First choose a direction: Horizontal or Vertical?"
    - **plugin-query-rect**: requires two-click sequence (already enforced in v3 design — first click then second click).

## Landscape (landscape.js)
- 2D Gaussian: `U(x,y) = A * exp(-((x-cx)²/(2*sx²) + (y-cy)²/(2*sy²))) + noise`
- Parameters: amplitude A: ~100, noise: Gaussian sd=2 per cell, clamp to [0, 100]; sx, sy: random in [10, 25]
- **Training landscape constraints (visually very different):**
  - Training A: cx in [15, 35], cy in [8, 18] (upper-left), sx,sy in [18, 25] (wide spread)
  - Training B: cx in [65, 85], cy in [32, 42] (lower-right), sx,sy in [10, 16] (narrow spread)
- **Experiment landscape**: cx random in [20, 79], cy random in [10, 39], sx,sy in [10, 25]
- **Pre-compute at generation time** (all stored on experimentState): landscape array, rowMeans, colMeans, prefixSum, gridMeanRichness, peakLocation
- Functions: `generateLandscape(params)`, `getPointValue(x,y)`, `getLineMean(orientation, position)`, `getRectMean(x1,y1,x2,y2)` — all O(1).

## Grid Renderer (grid-renderer.js)

### Constructor:
`new GridRenderer(canvasElement, gridWidth=100, gridHeight=50, displayWidth=800, displayHeight=400)`
- Same class instantiated at different sizes for main grid (800×400) and mini-grids (270×135).

### Drawing methods:
- `drawGrid(showLabels=true)`: white background, faint cell borders. For main grid: full axis labels every 10 units. For mini-grids: showLabels=false (no axis numbers — too small to read), but keep the every-10 heavier lines for spatial reference.
- `drawCrosshair(gridX, gridY)`: only used on main grid. **Always drawn LAST.**
- `highlightPoint(x, y, color, size=6)`: filled circle.
- `highlightLine(orientation, position, color, opacity=0.5)`: semi-transparent band.
- `highlightRectFill(x1, y1, x2, y2, color, opacity=0.7, label=null)`: semi-transparent FILLED rectangle with optional value label centered inside (white text with subtle shadow for readability).
- `highlightRectOutline(x1, y1, x2, y2, color, lineWidth=2, label=null)`: border only.
- `clearHighlights()`: redraw base grid.
- `canvasToGrid(canvasX, canvasY)` → `{x, y}`.

### Type-specific history drawing methods:

- `drawPointHistory(pointEntries)`: for each entry, draw `highlightPoint(x, y, valueToColor(value), size=5)` at full opacity. Optionally draw small value label next to each dot if there's room (e.g., 6px font, only if cell is uncrowded — implementation detail: skip labels if dot density too high).

- `drawLineHistory(lineEntries)`: for each entry, draw `highlightLine(orientation, position, valueToColor(value), opacity=0.5)`. Add a value label at the edge of each band (right edge for horizontal at "Row Y → XX.X"; top edge for vertical at "Col X → XX.X"). Use small text (~9px). H+V crossings are visually informative — bands are semi-transparent so crossings show both colors blended.

- `drawRectangleGroup(rectEntries)`: each entry rendered as `highlightRectFill(x1, y1, x2, y2, valueToColor(value), opacity=0.7)` with the value label drawn in the center. **Within each group, rectangles never overlap (guaranteed by bin-packing in utils)**, so solid fills are safe.

### Performance:
- Draw base grid to offscreen canvas once. Copy as base layer before each redraw.
- Crosshair uses separate top layer; mousemove redraws only crosshair.

## Heatmap Color Scale
Single-hue magnitude scale defined in utils.js as `valueToColor(value)`:
- 0: pale cream (#FFF5EB) → 25: light orange → 50: orange → 75: dark orange → 100: deep red
- HSL: hue from 35 (orange) to 0 (red), saturation 90-100%, lightness 95% → 35%.
- **Darker = higher richness.**

A small **legend bar** shown once near the mini-grids: a horizontal gradient from pale to dark with labels "0" and "100" at the ends and "Richness →" above. This helps participants interpret the heatmap.

## History Display — Disjoint-Group Mini-Grids (Option C)

The history display uses several small mini-grids, each showing a non-overlapping subset of past queries. Within each mini-grid, no two queries overlap, so solid fills are safe and value labels are clearly readable.

### Layout (on feedback / guess / continue-decision / final-guess screens):
```
┌─────────────────────────────────────┐ ┌──────────────┐
│       MAIN GRID (800×400)            │ │ Scan list    │
│   shows ONLY current query +         │ │ (numbered)   │
│   crosshair on top                   │ │              │
│                                       │ │ 1. ● 67.3    │
└─────────────────────────────────────┘ │ 2. ═ Row 25  │
  Map average richness: XX.X              │       — 41.8 │
                                          │ 3. ▢ 30×20  │
  ━━━━ Your Scan History (heatmap key: pale=low, dark=high) ━━━━
  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐
  │ Points    │ │ Lines     │ │ Areas — 1 │ │ Areas — 2 │
  │ (N pts)   │ │ (N lines) │ │ (M rects) │ │ (K rects) │
  │ 270×135   │ │ 270×135   │ │ 270×135   │ │ 270×135   │
  └───────────┘ └───────────┘ └───────────┘ └───────────┘
                                          (wraps to next row if more groups)
```

### Mini-grid: "Points"
- Single mini-grid showing all past point queries.
- Each query: filled circle, color = valueToColor(value), size 5px.
- No overlap problem (small dots, large grid).
- Title: `Points (N=X)` where X = count.

### Mini-grid: "Lines"
- Single mini-grid showing all past line queries.
- Horizontal lines: semi-transparent colored bands across the full row width.
- Vertical lines: semi-transparent colored bands across the full column height.
- H+V crossings produce blended colors at intersections — informative, not confusing.
- Each band has a small value label at its edge: e.g., "y=25 — 41.8" at right end of horizontal bands.
- Title: `Lines (N=X)`.

### Mini-grids: "Areas — 1", "Areas — 2", ... (one or more)
- Each mini-grid in this group contains a set of NON-OVERLAPPING rectangles.
- Rectangles are colored fills (heatmap color, opacity 0.7) with value labels in the center (e.g., "48.1" in white text).
- New rectangles are bin-packed: when a new rectangle is added, the algorithm places it in the first existing area-grid where it doesn't overlap any existing rectangle. If no such grid exists, a new grid is created.
- Titles: `Areas — Set 1 (M)`, `Areas — Set 2 (K)`, etc.
- Layout wraps if many groups (flexbox flex-wrap).

### Bin-packing algorithm (in utils.js):
```js
window.packRectanglesIntoGroups = function(rectEntries) {
  // rectEntries: array of {x1, y1, x2, y2, value, round, ...}
  // Returns: array of groups, each group is an array of non-overlapping rectangles
  function rectsOverlap(r1, r2) {
    return !(r1.x2 < r2.x1 || r2.x2 < r1.x1 || r1.y2 < r2.y1 || r2.y2 < r1.y1);
  }
  var groups = [];
  for (var i = 0; i < rectEntries.length; i++) {
    var rect = rectEntries[i];
    var placed = false;
    for (var g = 0; g < groups.length; g++) {
      var hasOverlap = false;
      for (var j = 0; j < groups[g].length; j++) {
        if (rectsOverlap(rect, groups[g][j])) { hasOverlap = true; break; }
      }
      if (!hasOverlap) {
        groups[g].push(rect);
        placed = true;
        break;
      }
    }
    if (!placed) groups.push([rect]);
  }
  return groups;
};
```

Group order: chronological (oldest rectangle assigned to group 1; new groups created when needed). Within a group, ordering preserved chronologically.

### Numbered list panel (right of main grid):
- Scrollable, max-height ~400px.
- Each entry: number + colored square indicator + type icon + value:
  - "1. ● Point — 67.3"
  - "2. ═ Row 25 — 41.8"
  - "3. ║ Col 47 — 55.2"
  - "4. ▢ Area 30×20 — 48.1"
- Auto-scrolls to bottom when new entry added.

### Why this is "visual friendly":
1. **Main grid stays clean** — only current query + crosshair, mouse never blocked.
2. **Solid rectangle fills with values inside** — possible because bin-packing guarantees no overlap within any group. Direct readability of every past area scan.
3. **Color encoding consistent** — same heatmap everywhere, with prominent legend bar above the mini-grids row showing "0 (pale) → 100 (dark) richness".
4. **Type segregation reduces cognitive load** — points/lines/areas separated visually rather than overlaid.
5. **Numbered list always available** — exact values + chronological order in case mini-grids feel busy.
6. **Compact layout fits laptop screens** — 270×135 mini-grids let 3-4 fit per row.

### Additional visual aids (Option C-final):
7. **Scan number badges**: each rectangle in the area mini-grids has a small badge in its top-left corner showing its scan number (e.g., "#7"). This connects spatial display to the numbered list.
8. **Hover tooltips on every history item**: hovering any point/line/rectangle in any mini-grid shows a tooltip with: scan number, full coordinates, and exact value. (Implementation: mousemove on mini-grid canvases checks hit-test against drawn items and shows a positioned div.)
9. **Bidirectional highlighting**: hovering an item on a mini-grid highlights the matching entry in the numbered list (background color) — and vice versa. Helps participants connect "this rectangle on the map" ↔ "scan #7 in the timeline."
10. **Heatmap legend bar**: a horizontal gradient (~200×20px) shown ONCE above the mini-grids row with axis labels "0 — Richness — 100". Pale at left, dark at right. This anchors the color scale interpretation.
11. **No ambiguous overlap by design**: within each mini-grid, bin-packing guarantees zero rectangle overlap, so every rectangle's value is unambiguous. Two rectangles that overlap in real space are placed in DIFFERENT mini-grids — each shows its own clear value, and participants don't need to mentally combine them.

## Crosshair Behavior (Main Grid Only)
- Mouse move → faint dotted lines to both axes; axis numbers nearest mouse get colored highlight.
- On click → crosshair locks (solid lines), label "Column XX, Row YY" appears.
- **Always drawn last on the main grid.** Mini-grids do not have crosshair (read-only display).

## 3D Reveal (Training Only) — Static with Preset Angles

### Visual design:
- **Starts as flat top-down grid** with coordinate labels (0, 10, 20...) on x and y axes.
- **Animates into 3D**: over ~2 seconds, camera lerps from top-down (90° elevation) to default angled view (35° elevation, 30° azimuth). Surface vertices simultaneously lerp from z=0 to actual z values. After this entrance, camera is **STATIC**.
- **Surface is semi-transparent** (opacity ~0.6) so grid lines and coord labels remain visible beneath.
- **Detailed axis labels on the 3D coordinate plane**: numbers every 10 units (text sprites or HTML overlay), tick marks every 10 units. Clearly readable.
- **Three preset angle buttons** below the canvas:
  - **"Front view"**: low elevation (~15°), azimuth 0° — emphasizes peak height.
  - **"Top-angle view"**: 35° elevation, 30° azimuth — default after entrance, balanced perspective.
  - **"Side view"**: 35° elevation, 90° azimuth — landscape from y-axis side.
- Switching triggers ~0.8s smooth camera lerp. Surface stays in place.
- **NO auto-rotation.** Camera static until participant clicks a button.

### Color schemes (must be VERY different):
- **Training A**: warm — pale yellow → orange → deep red.
- **Training B**: cool — light cyan → blue → deep purple.

### Participant-facing text (NO shape descriptions):
- Training A: "Here's the actual richness across the map you just explored:"
- Training B: "Here's the actual richness on this second map:"
- After Training B view: "Each map has its own pattern. Ready for the real challenge?"
- **DO NOT say**: "smooth hill", "single peak", "Gaussian", "gradually decreasing", etc.

### Three.js r128 implementation notes:
- PlaneGeometry(100, 50, 99, 49). DO NOT use CapsuleGeometry.
- DO NOT import OrbitControls. Implement camera angle switching with trigonometry.
- LineSegments wireframe on z=0 plane for grid coords. Text sprites or HTML overlay for axis numbers.
- Camera position from elevation/azimuth: `(d*cos(el)*sin(az), d*sin(el), d*cos(el)*cos(az))` looking at center.

## Experiment Flow

### Phase 0: Welcome + Instructions (plugin-instructions.js)
3 screens: welcome → comic-strip scanner tutorial (3 panels) → how-it-works → "Start practice →"

### Phase 1: Training — Landscape A (3 forced rounds, NO continue-decision)
Generate landscape A. trainingForcedType set in sequence: 'point', 'horizontal_line', 'rectangle'.
- Round 1 (Point): select(locked to Point) → query-point → feedback → guess
- Round 2 (Horizontal Line): select(locked to Line) → query-line locked to Horizontal → feedback → guess
- Round 3 (Rectangle): select(locked to Rectangle) → query-rect → feedback → guess
- Attention check
- 3D reveal A (warm colors)

Training rounds NEVER show continue-decision.

### Phase 2: Training — Landscape B (3 forced rounds)
Transition: "Let's practice with a different map! This time you'll try the vertical line scanner." → resetForNewLandscape → generate landscape B.
trainingForcedType set in sequence: 'point', 'vertical_line', 'rectangle'.
- Round 1 (Point): select(locked) → query-point → feedback → guess
- Round 2 (Vertical Line): select(locked to Line) → query-line locked to Vertical → feedback → guess
- Round 3 (Rectangle): select(locked) → query-rect → feedback → guess
- Attention check
- 3D reveal B (cool colors) → "Each map has its own pattern. Ready for the real challenge?"

**Why split H/V across landscapes:** This way participants experience BOTH horizontal and vertical line scans during training without adding extra rounds. They learn the line scanner takes a direction choice.

### Phase 3: Experiment (1 landscape, up to 50 free rounds, WITH continue-decision)

Transition: "Now it's the real challenge! Choose ANY scanner type each round. After each round you'll decide whether to keep scanning or make your final guess. You have up to 50 scans."

**Each round:**
1. **plugin-select-query** (free choice mode): grid clean (current query only) + 3 scanner buttons. **NO "I've found it!" button.**
2. **Query plugin** (point/line/rect via dynamic routing).
3. **plugin-feedback**: result + history mini-grids + numbered list.
4. **plugin-guess** (normal mode): guess with history mini-grids visible.
5. **plugin-continue-decision**: between every two rounds.
   - "Keep scanning →" → loops back to step 1, currentRound++
   - "🏆 I have enough — make my final guess" → confirmation → if confirmed, sets quitRequested=true → final guess

**Loop ends when:** quitRequested=true OR currentRound > 50.

### Final Guess Screen (plugin-guess.js in final mode):
History mini-grids visible. "This is your FINAL answer. Click the spot you believe has the highest richness. Your answer cannot be changed after you submit." Button: "Submit final answer →"

### Demographics + Thank You: as before.

## plugin-continue-decision (between every 2 experiment rounds)

### Display:
- Header: "Round X complete — Scans used: X of 50"
- Main grid (800×400): clean, only crosshair (no current query, no history overlay).
- "Map average richness: XX.X" below grid.
- History mini-grids row + numbered list panel.
- Two side-by-side buttons:
  - "Keep scanning →" (primary blue)
  - "🏆 I have enough — make my final guess" (gold/amber #F5A623)

### Confirmation flow on "I have enough":
Modal: "Are you sure? You'll make your final guess and the game will end. [Yes, I'm ready] [No, keep scanning]"

### Data: `{ choice, round_at_decision, rt }`. Sets quitRequested if final_guess confirmed.

### NEVER appears during training. NEVER appears after round 50.

## Data Format

### behavior_data.csv:
```
participant_id, study_id, session_id, phase, landscape_id, round_number, query_type, query_area, query_coords, query_mean_value, guess_x, guess_y, guess_value, continue_decision, rt_select_ms, rt_query_ms, rt_feedback_ms, rt_guess_ms, rt_decision_ms, timestamp
```

### demographics.csv:
```
participant_id, study_id, session_id, gender, age, education, instruction_clarity, fun_rating, comments
```

## Visual Design
- White background, centered, system sans-serif font.
- Main grid: white fill, faint cell borders (all 5000 visible), heavier every 10 units, black labels.
- Mini-grids: same look but compact, no axis labels (too small to read).
- **Heatmap color**: single-hue (pale cream → orange → deep red). Darker = higher.
- **Heatmap legend bar**: shown once above the mini-grids row.
- Point in mini-grid: 5px filled circle, full opacity.
- Line in mini-grid: 0.5 opacity colored band, value label at edge.
- Rectangle in mini-grid: 0.7 opacity colored fill, value label centered in white text.
- Guess dot (main grid): orange #FF6B35, 8px.
- Buttons: rounded 8px, subtle shadow, blue highlight when active.
- "I have enough — make my final guess" button: gold/amber #F5A623, larger.
- Mini-grid container: 270×135 canvas + small title above ("Points (N=7)" etc.).
- Mini-grids row: flexbox row, flex-wrap, gap ~12px.
- History list panel: right of main grid, fixed width ~200px, scrollable max-height 400px.
- Progress: "Round X | Scans used: X of 50" at top of select-query screens.
- 3D angle buttons: small button row below 3D canvas, active highlighted.

## Build Status
- **Phase 1** ✅: Skeleton + landscape + grid + point query — 3 rounds end-to-end
- **Phase 2 (Option C variant)**: Full game — all query types + training + experiment + continue-decision + disjoint-group mini-grid history + demographics
- **Phase 3**: Polish, platform integration

## Current Status
**→ Phase 1 complete. Building Phase 2 (Option C-final: disjoint-group mini-grid history + scanner-first guidance + active H/V choice + visual aids).**
