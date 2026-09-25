// =============================================================================
// plugin-3d-reveal.js — STATIC 3D landscape reveal with 3 preset angle buttons
// =============================================================================
// Three.js r128. NO auto-rotation, NO OrbitControls (not on r128 CDN).
// Camera lerping is done manually via requestAnimationFrame.
//
// Entrance: ~2s lerp from top-down (90° elevation) flat to default angled view
// (35° elevation, 30° azimuth) with surface vertices lerping z=0 → actual.
// After entrance: STATIC. Three buttons let participant switch presets.
// =============================================================================

(function () {
  'use strict';

  var info = {
    name: '3d-reveal',
    parameters: {
      colorScheme: { type: 'STRING', default: 'warm' },   // 'warm' | 'cool' | 'final'
      message: { type: 'HTML_STRING', default: '' },
      appendAfter: { type: 'HTML_STRING', default: '' },
      // v6: optional red marker for final reveal (the participant's final guess).
      // Shape: { x, y, value }  (grid coords + richness value at that point)
      markerPoint: { type: 'OBJECT', default: null }
    }
  };

  // Preset camera angles (elevation/azimuth in radians)
  var ANGLES = {
    front: { el: 15 * Math.PI / 180, az: 0,                  label: 'Front view' },
    angle: { el: 35 * Math.PI / 180, az: 30 * Math.PI / 180, label: 'Top-angle view' },
    side:  { el: 35 * Math.PI / 180, az: 90 * Math.PI / 180, label: 'Side view' }
  };
  var CAMERA_DISTANCE = 110;

  function camPos(el, az, d) {
    return {
      x: d * Math.cos(el) * Math.sin(az),
      y: d * Math.sin(el),
      z: d * Math.cos(el) * Math.cos(az)
    };
  }

  function Plugin(jsPsych) { this.jsPsych = jsPsych; }
  Plugin.info = info;

  Plugin.prototype.trial = function (display_element, trial) {
    var jsPsych = this.jsPsych;
    var state = window.experimentState;
    var startTime = performance.now();
    var angleClicks = [];

    // --- HTML ---
    var html = '<div class="exp-container reveal-screen">';
    html += '<p class="reveal-intro">' + (trial.message || '') + '</p>';
    html += '<div class="reveal-canvas-wrap">';
    html +=   '<canvas id="reveal-canvas" width="700" height="450"></canvas>';
    html += '</div>';
    html += '<div class="angle-button-row">';
    html +=   '<button class="angle-btn" data-angle="front">' + ANGLES.front.label + '</button>';
    html +=   '<button class="angle-btn active" data-angle="angle">' + ANGLES.angle.label + '</button>';
    html +=   '<button class="angle-btn" data-angle="side">' + ANGLES.side.label + '</button>';
    html += '</div>';
    if (trial.markerPoint) {
      html += '<p class="reveal-marker-legend">🔴 Red dot: your final guess</p>';
    }
    if (trial.appendAfter) {
      html += '<p class="reveal-extra">' + trial.appendAfter + '</p>';
    }
    html += '<div class="nav-row">';
    html +=   '<button class="action-btn next-btn" id="btn-next">Next &rarr;</button>';
    html += '</div>';
    html += '</div>';

    display_element.innerHTML = html;

    // --- Three.js setup ---
    if (typeof THREE === 'undefined') {
      var c = document.getElementById('reveal-canvas').getContext('2d');
      c.fillText('3D reveal unavailable (Three.js not loaded)', 10, 20);
      document.getElementById('btn-next').addEventListener('click', function () {
        jsPsych.finishTrial({ trial_kind: '3d-reveal', phase: state.phase, error: 'three.js not loaded' });
      });
      return;
    }

    var canvas = document.getElementById('reveal-canvas');
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setClearColor(0xf8f9fa);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(45, 700 / 450, 0.1, 1000);

    var GW = window.ExperimentUtils.GRID_WIDTH;
    var GH = window.ExperimentUtils.GRID_HEIGHT;

    // --- Build surface (PlaneGeometry, NOT CapsuleGeometry — r128 lacks it) ---
    var surfaceGeometry = new THREE.PlaneGeometry(100, 50, GW - 1, GH - 1);
    var grid = state.landscape.grid;
    var positions = surfaceGeometry.attributes.position;
    var colors = new Float32Array(positions.count * 3);
    var heightScale = 0.40;  // max richness 100 → 40 scene units

    // Compute target z-values; entrance animation lerps from 0 → these
    var targetZ = new Float32Array(positions.count);

    for (var i = 0; i < positions.count; i++) {
      // PlaneGeometry vertex layout: row-major, (x, y) where y increases downward.
      // We flip y so peak orientation matches the 2D grid.
      var gx = i % GW;
      var gy = Math.floor(i / GW);
      var richness = grid[gx][GH - 1 - gy];
      targetZ[i] = richness * heightScale;
      // Color
      var c = getVertexColor(richness, trial.colorScheme);
      colors[i * 3 + 0] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      // Initial z = 0 (flat)
      positions.setZ(i, 0);
    }
    surfaceGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    surfaceGeometry.computeVertexNormals();

    var surfaceMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide
    });
    var surfaceMesh = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
    surfaceMesh.rotation.x = -Math.PI / 2; // make z-up
    scene.add(surfaceMesh);

    // Wireframe overlay for surface structure
    var wireGeometry = new THREE.EdgesGeometry(surfaceGeometry);
    var wireMaterial = new THREE.LineBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.10 });
    var wireMesh = new THREE.LineSegments(wireGeometry, wireMaterial);
    wireMesh.rotation.x = -Math.PI / 2;
    scene.add(wireMesh);

    // --- Grid plane (z=0 reference grid with coordinate lines every 10 units) ---
    var gridLines = buildReferenceGrid();
    scene.add(gridLines);

    // --- Axis labels (text sprites) ---
    addAxisLabels(scene);

    // --- v6: Red marker sphere for "your final guess" (final-reveal mode) ---
    // Coordinate transform must match the surface:
    //   PlaneGeometry(100, 50) is centered at origin so x∈[-50,+50], y∈[-25,+25]
    //   surface is rotated -π/2 around X, so original y (vertex y) becomes -z (scene)
    //   and z (height) becomes +y (scene).
    //   The surface flips grid y: gridY=0 corresponds to bottom of vertex grid (originalY=+25).
    // For a given grid point (gx, gy):
    //   sceneX = gx - 50
    //   sceneZ = gy - 25  (because gridY=0 is at top in 2D but +25 in plane y after the flip)
    //   sceneY = value * heightScale  (height above the plane)
    var markerMesh = null;
    if (trial.markerPoint) {
      var mp = trial.markerPoint;
      var markerGeometry = new THREE.SphereGeometry(2.5, 16, 16);
      var markerMaterial = new THREE.MeshBasicMaterial({ color: 0xFF0000 });
      markerMesh = new THREE.Mesh(markerGeometry, markerMaterial);
      var sceneX = mp.x - 50;
      var sceneZ = mp.y - 25;
      var sceneY = (mp.value || 0) * heightScale + 2.5; // sit just above the surface
      markerMesh.position.set(sceneX, sceneY, sceneZ);
      markerMesh.userData.targetY = sceneY;
      // Initial: marker starts at z=0 (lerps up with the surface during entrance)
      markerMesh.position.y = 0;
      scene.add(markerMesh);
    }

    // --- Camera animation state ---
    // Start: top-down (90° elevation), looking down
    var startEl = 90 * Math.PI / 180;
    var startAz = 0;
    var entranceStart = performance.now();
    var ENTRANCE_MS = 2000;
    var entranceDone = false;
    var currentEl = startEl;
    var currentAz = startAz;
    var lerpToTarget = null;  // { fromEl, fromAz, toEl, toAz, startMs, durationMs }

    function setCameraFromAngle(el, az) {
      var p = camPos(el, az, CAMERA_DISTANCE);
      camera.position.set(p.x, p.y, p.z);
      camera.lookAt(0, 0, 0);
    }

    // Default end of entrance: angled view
    var entranceEndEl = ANGLES.angle.el;
    var entranceEndAz = ANGLES.angle.az;

    var rafId = null;
    function tick() {
      var now = performance.now();
      // Entrance animation
      if (!entranceDone) {
        var t = Math.min(1, (now - entranceStart) / ENTRANCE_MS);
        var eased = easeInOut(t);
        // Camera lerp
        currentEl = startEl + (entranceEndEl - startEl) * eased;
        currentAz = startAz + (entranceEndAz - startAz) * eased;
        // Surface lerp
        for (var i = 0; i < positions.count; i++) {
          positions.setZ(i, targetZ[i] * eased);
        }
        positions.needsUpdate = true;
        // Marker lerp (rises with the surface)
        if (markerMesh) {
          markerMesh.position.y = markerMesh.userData.targetY * eased;
        }
        if (t >= 1) {
          entranceDone = true;
        }
      } else if (lerpToTarget) {
        var lt = Math.min(1, (now - lerpToTarget.startMs) / lerpToTarget.durationMs);
        var le = easeInOut(lt);
        currentEl = lerpToTarget.fromEl + (lerpToTarget.toEl - lerpToTarget.fromEl) * le;
        currentAz = lerpToTarget.fromAz + (lerpToTarget.toAz - lerpToTarget.fromAz) * le;
        if (lt >= 1) {
          lerpToTarget = null;
        }
      }
      setCameraFromAngle(currentEl, currentAz);
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(tick);
    }
    tick();

    // --- Angle button handlers ---
    var angleBtns = display_element.querySelectorAll('.angle-btn');
    angleBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-angle');
        if (!ANGLES[key]) return;
        // Update active button
        angleBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        // Lerp camera over 0.8s
        lerpToTarget = {
          fromEl: currentEl,
          fromAz: currentAz,
          toEl: ANGLES[key].el,
          toAz: ANGLES[key].az,
          startMs: performance.now(),
          durationMs: 800
        };
        angleClicks.push({ angle: key, time: Math.round(performance.now() - startTime) });
      });
    });

    // --- Next button ---
    document.getElementById('btn-next').addEventListener('click', function () {
      if (rafId) cancelAnimationFrame(rafId);
      jsPsych.finishTrial({
        // v10.2: stamp phase at SAVE time (the builder's fallback resolves to
        // whatever phase is current at extraction, which is always 'experiment').
        phase: state.phase,
        trial_kind: '3d-reveal',
        color_scheme: trial.colorScheme,
        time_spent_viewing: Math.round(performance.now() - startTime),
        angle_clicks: angleClicks
      });
    });

    // ---------------------------------------------------------------------------
    // HELPERS
    // ---------------------------------------------------------------------------

    function easeInOut(t) {
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }

    function getVertexColor(richness, colorScheme) {
      var t = Math.max(0, Math.min(1, richness / 100));
      if (colorScheme === 'cool') {
        // Light cyan → blue → deep purple
        var hue = 180 + t * 100;          // 180 → 280
        var sat = 0.70 + t * 0.0;
        var lit = 0.80 - t * 0.45;        // 0.80 → 0.35
        return hslToRgb(hue / 360, sat, lit);
      }
      if (colorScheme === 'final') {
        // Green gradient: light #D4F4DD → green #5CB85C → dark green #2E7D32
        // Approximated in HSL: low: hsl(130, 60%, 90%) → high: hsl(125, 60%, 33%)
        var hueF = 130 - t * 5;            // 130 → 125
        var satF = 0.50 + t * 0.10;        // 0.50 → 0.60
        var litF = 0.90 - t * 0.57;        // 0.90 → 0.33
        return hslToRgb(hueF / 360, satF, litF);
      }
      // Default: warm — pale yellow → orange → deep red
      var hueW = 60 - t * 60;            // 60 → 0
      var satW = 0.90 + t * 0.10;
      var litW = 0.85 - t * 0.50;        // 0.85 → 0.35
      return hslToRgb(hueW / 360, satW, litW);
    }

    function hslToRgb(h, s, l) {
      var r, g, b;
      if (s === 0) {
        r = g = b = l;
      } else {
        var hue2rgb = function (p, q, t) {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1 / 6) return p + (q - p) * 6 * t;
          if (t < 1 / 2) return q;
          if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
          return p;
        };
        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
      }
      return { r: r, g: g, b: b };
    }

    function buildReferenceGrid() {
      // Grid plane on z=0 with lines every 10 units
      var verts = [];
      // Vertical lines (x = 0..100 step 10) over y=0..50
      for (var x = 0; x <= 100; x += 10) {
        verts.push(x - 50, 0, -25);
        verts.push(x - 50, 0,  25);
      }
      // Horizontal lines (y = 0..50 step 10) over x=0..100
      for (var y = 0; y <= 50; y += 10) {
        verts.push(-50, 0, y - 25);
        verts.push( 50, 0, y - 25);
      }
      var geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      var mat = new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.45 });
      return new THREE.LineSegments(geom, mat);
    }

    function addAxisLabels(scene) {
      // Use canvas-rendered text sprites for each axis label
      function makeTextSprite(text) {
        var size = 64;
        var c = document.createElement('canvas');
        c.width = c.height = size;
        var ctx = c.getContext('2d');
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fillRect(0, 0, size, size);
        ctx.font = 'bold 28px sans-serif';
        ctx.fillStyle = '#222';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, size / 2, size / 2);
        var tex = new THREE.CanvasTexture(c);
        var mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        var sp = new THREE.Sprite(mat);
        sp.scale.set(6, 6, 1);
        return sp;
      }

      // X-axis labels (along the x edge, behind the grid at z = +25)
      for (var x = 0; x <= 100; x += 10) {
        var spX = makeTextSprite(String(x));
        spX.position.set(x - 50, -3, 30);
        scene.add(spX);
      }
      // Y-axis labels (along the y edge, behind the grid at x = -50)
      for (var y = 0; y <= 50; y += 10) {
        var spY = makeTextSprite(String(y));
        spY.position.set(-55, -3, y - 25);
        scene.add(spY);
      }
    }
  };

  window.jsPsych3dReveal = Plugin;
})();
