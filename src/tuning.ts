// ─────────────────────────────────────────────────────────────────────────────
// TUNING — every number that shapes feel lives here. Never hardcode these
// elsewhere. Objects are mutable on purpose so the debug overlay (and F3) can
// poke values live.
// Each module owns its section; add new knobs inside your own section only.
// ─────────────────────────────────────────────────────────────────────────────

export const tuning = {
  // ── App / rendering ───────────────────────────────────────────────────────
  app: {
    maxProfiles: 6,
    defaultProfileNames: ['Star', 'Moon'],
    maxPixelRatio: 2,          // DPR cap (iPad is 2; lower = faster)
    townPixelRatio: 1.5,       // DPR cap used in big town scenes
    adaptiveFpsFloor: 50,      // if fps stays below this, resolution steps down
    adaptiveSeconds: 2.5,      // ...for this long
    adaptiveStep: 0.25,        // DPR reduction per step
    adaptiveMinRatio: 1,       // never below this DPR
    sceneFadeMs: 260,
    autosaveDebounceMs: 400,
    minTouchTarget: 56,        // px — every button is at least this
    threeFingerTapMs: 350,     // three fingers down within this window toggles debug
  },

  // ── Art / palette ─────────────────────────────────────────────────────────
  art: {
    // Main candy palette offered in every color picker (16 swatches).
    palette: [
      '#ff8fb1', '#ff5d8f', '#ffb38a', '#ffd166', '#fff3a3', '#b8f2a6',
      '#5fd3a5', '#7fd8ff', '#5aa9ff', '#9d8cff', '#c9a7ff', '#f2f2f7',
      '#ffffff', '#3d3a4b', '#8a5a44', '#e0b48a',
    ],
    skinTones: ['#ffe0cc', '#f6c9a8', '#e0a87e', '#c58a5f', '#93603d', '#5e3b27'],
    clearcoat: 0.6,
    clearcoatRoughness: 0.25,
    roughness: 0.42,
    envIntensity: 0.9,
    exposure: 1.05,
    shadowMapSize: 1024,
    skyTop: '#9fd8ff',
    skyBottom: '#ffe6f0',
    fogNear: 60,
    fogFar: 140,
  },

  // ── Audio ─────────────────────────────────────────────────────────────────
  audio: {
    master: 0.9,
    sfx: 0.9,
    music: 0.35,
    musicInWorkshop: false,
    pitchVariation: 0.08,      // ± fraction of pitch randomization per event
    volumeVariation: 0.15,     // ± fraction of volume randomization per event
    engineBaseHz: 55,
    engineTopHz: 150,
    engineVolume: 0.14,
    pourVolume: 0.35,
    minRepeatMs: 28,           // the same sound won't retrigger faster than this
  },

  // ── Profiles ──────────────────────────────────────────────────────────────
  profiles: {
    waveSeconds: 1.6,
    pickerSpin: 0.35,
  },

  // ── Dress-up ──────────────────────────────────────────────────────────────
  dressup: {
    rotateSpeed: 0.012,        // radians per px dragged
    rotateInertia: 0.92,
    zoomMin: 3.2,              // camera distance
    zoomMax: 7.5,
    zoomDefault: 5.4,
    poseSeconds: 0.9,
    sparkleCount: 26,
    // character animation
    waveSeconds: 1.5,
    hopSeconds: 0.5,
    hopHeight: 0.28,           // world units
    idleSway: 0.02,            // radians of body roll
    breath: 0.018,             // body squash amount while breathing
    // dress-up stage
    zoomButtonStep: 1.25,      // distance multiplier per +/- tap
    zoomWheel: 0.0015,         // distance change per wheel delta
    zoomSmooth: 9,             // camera glide (higher = snappier)
    lookYWide: 1.08,           // camera look-at height when zoomed out
    lookYClose: 1.5,           // ... and when zoomed in (upper body)
    fov: 34,
    faceFrontDelay: 6,         // seconds idle before the character turns back to the front
    faceFrontSpeed: 3.2,
    autoFocus: true,           // tapping a category glides the camera to that body part
    focusDist: { hair: 3.7, accessory: 3.7, skin: 4.1, top: 4.7, bottom: 5.0, shoes: 4.4 } as Record<string, number>,
    focusLookBias: { hair: 0.1, accessory: 0.1, skin: 0, top: 0, bottom: -0.4, shoes: -0.8 } as Record<string, number>,
    spinSoundEvery: 0.16,      // seconds between swish sounds while spinning
    surpriseStaggerMs: 120,    // delay between pieces when rolling a random outfit
    undoMax: 40,
  },

  // ── Driving ───────────────────────────────────────────────────────────────
  drive: {
    topSpeed: 16,              // units / s
    reverseSpeed: 6,
    acceleration: 9,
    brakeForce: 22,
    coastDrag: 2.2,
    turnRate: 2.3,             // rad / s at full steer
    turnSpeedFull: 4,          // speed at which steering reaches full authority
    bounceRestitution: 0.45,
    cameraFollowDistance: 11,
    cameraHeight: 6.5,
    cameraLag: 4.5,
    controlSize: 132,          // px, on-screen control diameter
    hornCooldownMs: 250,
    jobTriggerRadius: 3.2,
    doorTriggerRadius: 3.0,
    passengerHopSeconds: 0.6,

    // ── added by the drive module ──
    // handling
    grip: 10,                  // sideways grip (1/s): higher = less drift
    steerResponse: 9,          // how fast the steering wheel follows the stick (1/s)
    turnMinAuthority: 0.22,    // fraction of turnRate available at a standstill (helps get unstuck)
    turnSpeedLoss: 0.3,        // fraction of turnRate lost at top speed
    joyDeadzone: 0.12,         // joystick steering deadzone (0..1)
    joyGasZone: 0.5,           // joystick vertical push (0..1) needed before it acts as gas / reverse
    // collisions
    carRadius: 1.05,           // the car is two circles (front + rear) of this radius
    carCircleOffset: 0.95,     // distance of each circle from the car center
    collideCooldownMs: 280,    // min gap between carCollide events
    collideMinSpeed: 2.2,      // softer bumps are silent and don't rebound
    // camera
    cameraLookAhead: 5,        // look this far in front of the car
    cameraLookHeight: 1.2,
    cameraPosLag: 1.7,         // position follow speed = cameraLag * this
    cameraMinDistance: 4.5,    // closest the camera is pulled in when a building is in the way
    cameraFov: 54,
    cameraFovBoost: 8,         // extra FOV at top speed
    shadowSize: 26,            // half-extent of the sun shadow box that follows the car
    shadowAhead: 9,            // shadow box is centered this far in front of the car
    // car look
    carLean: 0.11,             // body roll in turns (rad at full steer + full speed)
    carPitch: 0.05,            // nose lift / dive on accel / brake (rad)
    carSquash: 0.045,          // vertical squash on accel / brake
    carBounceKick: 2.4,        // bounce impulse of a bump
    wheelSteerAngle: 0.5,      // max front wheel angle (rad)
    driverScale: 0.7,          // size of the seated characters in the car
    driverY: 1.17,             // seat cushion height: the character's butt (Character.SEAT_Y) rests here
    driverYaw: Math.PI,        // characters are built facing +z; the car faces -z
    // jobs (pickup / drop-off — optional, no timer, no penalty)
    jobRespawnSeconds: 4,      // pause before the next passenger appears
    jobFirstSeconds: 1.5,      // delay before the very first passenger
    jobMinDistance: 32,        // destination is at least this far from the pickup
    jobWaveRadius: 16,         // a waiting passenger waves when the car is this close
    jobWaveEverySeconds: 6,
    jobCelebrateSeconds: 2.8,  // how long a dropped-off passenger waves before leaving
    // hud
    minimapSize: 150,          // px
    minimapRadius: 66,         // world units shown from the center of the map to the edge of the dial
    nameTagDistance: 45,       // owner tags fade in inside this distance
    // world
    cloudSpeed: 0.0035,        // rad / s around the town
    sceneryTrees: 50,
    sceneryPines: 40,
    sceneryBushes: 56,
    sceneryFlowerPatches: 44,
    scenerySeed: 20261016,
  },

  // ── House & village building ──────────────────────────────────────────────
  build: {
    gridSize: 1,               // world units per cell
    plotCells: 8,              // each house plot is plotCells × plotCells
    plotsPerTown: 8,
    snapTolerance: 0.5,        // cells — drag release snaps to the nearest cell within this
    wallHeight: 1.6,
    wallThickness: 0.14,
    placeBounceSeconds: 0.35,
    maxUndo: 60,
    orbitMinDistance: 8,       // town view: closest the camera may get
    orbitMaxDistance: 70,      // town view: farthest
    orbitRotateSpeed: 0.006,   // radians per px dragged
    // — added by the build module —
    floorHeight: 0.12,         // thickness of a floor tile (keep a bit above the plot pad)
    roofPitch: 0.55,           // gable rise per unit of run
    roofMaxRise: 1.5,          // tallest a gable may get (wide houses get a flatter pitch)
    roofThickness: 0.1,
    roofOverhang: 0.14,
    houseDistance: 15,         // camera distance when editing a house
    houseMinDistance: 5,
    houseMaxDistance: 30,
    townPitch: 0.85,           // camera elevation (radians) in town / house mode
    housePitch: 1.0,
    pitchMin: 0.32,            // never lets the camera sink near the ground
    pitchMax: 1.4,
    zoomWheelSpeed: 0.0014,    // mouse wheel zoom (per wheel unit)
    cameraRate: 14,            // camera smoothing (per second) while the player moves it
    glideRate: 4.2,            // camera smoothing while gliding to a house
    ghostLerp: 26,             // ghost preview position smoothing (per second)
    touchLift: 70,             // px the palette-drag ghost floats above a finger
    dragStartPx: 8,            // palette tile drag threshold
    tapMaxPx: 12,              // pointer travel still counted as a tap
    tapMaxMs: 650,
    wallLowScale: 0.3,         // height of walls in "low walls" view
    tagHeight: 3.6,            // owner name tag height above the plot
    undoMergeMs: 4000,         // recolors of one piece within this window share one undo step
  },

  // ── Workshop: squishy ─────────────────────────────────────────────────────
  squishy: {
    softness: 0.75,            // how far the surface gives per unit of drag/pressure
    falloffRadius: 0.42,       // world units, gaussian radius around the finger
    recoverySpeed: 1.1,        // slow-rise rate (per second, exponential)
    maxDent: 0.7,              // world units max inward displacement
    pressDepth: 0.4,           // dent depth on a static press (no drag)
    holdDeepenRate: 0.35,      // extra depth per second while holding
    popThreshold: 0.02,        // max remaining dent at which the "pop" fires
    meshDetail: 26,            // icosphere edge subdivisions (26 ≈ 7.3k verts)
    bodyRadius: 1.25,
    squashPerFinger: 0.22,     // whole-body squash added per pressing finger (squishy station)
    jiggleStiffness: 140,      // jelly wobble spring (higher = faster wobble)
    jiggleDamping: 7,          // how quickly the wobble dies out
    jigglePress: 2.2,          // wobble kick when a finger lands
    jiggleRelease: 3.2,        // wobble kick when a finger lifts
    bulgeRing: 0.34,           // how much the surface puffs up around a dent (volume)
  },

  // ── Workshop: slime ───────────────────────────────────────────────────────
  slime: {
    stretchLimit: 3.2,         // world units the grabbed point can travel (soft rubber-band after ~60 %)
    snapBackSpeed: 12,         // release spring frequency in rad/s (higher = snappier return)
    viscosity: 0.86,           // 0..1, higher = gooier: more damped, calmer, slower-settling jiggle
    plasticity: 0.12,          // fraction of a pull that stays behind (soft peaks, folds)…
    relaxSpeed: 0.25,          // …and how fast that memory relaxes back to the dome (per second)
    grabRadius: 0.9,           // world units of slime that follow a fingertip
    pokeDepth: 0.35,           // dent depth of a tap
    glitterDensity: 0.6,       // 0..1 glitter amount (1 = a flake in half the cells)
    clickDistance: 0.18,       // world units of finger travel per wet click sound
    radius: 1.9,               // blob footprint radius (mesh / tray knobs are read once at startup)
    // mesh / shape
    domeHeight: 0.6,           // dome height as a fraction of radius
    gridN: 88,                 // mesh is (gridN + 1)² vertices (88 → 7.9k, max 250)
    // stretch shaping
    grabReach: 1.25,           // slime within grabRadius × this follows the finger
    thinning: 1.4,             // how quickly a strand thins as it stretches
    bulbRadius: 0.13,          // gooey drop at the end of a strand
    droop: 0.12,               // sag of a sideways strand
    strandLag: 16,             // how fast the strand body trails the fingertip (rad/s, lower = whippier)
    // feel
    followSpeed: 36,           // how tightly the fingertip drags the slime (rad/s)
    followDamping: 0.9,        // 1 = no overshoot when the finger stops
    vertexFollow: 22,          // per-vertex spring toward its target (rad/s)
    gripFollow: 42,            // same, for slime held by a finger
    slipDistance: 1.5,         // sideways pull beyond this drags the strand's root along
    slipRate: 3,
    rippleSpeed: 1.6,          // world units / s that pokes and landings ripple outward
    rippleDamping: 3.2,        // how fast ripples die
    jiggleFreq: 13,            // whole-blob wobble after a release (rad/s)
    breath: 0.02,              // idle breathing amplitude
    pickRadius: 0.07,          // how close to a surface point a touch must be to grab it
    // tray
    trayMargin: 0.16,
    trayRim: 0.22,
    trayFloor: 0.09,
    trayZ: 0.1,
    // add-ins
    sprinkleCount: 80,
    starCount: 40,
    pearlCount: 54,
    extraColors: ['#caff8a', '#8affd9', '#ffa6e7', '#a6b8ff', '#ffe66d', '#ff8a8a', '#d6a2ff', '#7df9ff'],
  },

  // ── Workshop: wax cracking ────────────────────────────────────────────────
  wax: {
    waxColors: ['#ff6f91', '#ffc75f', '#f9f871', '#7be0ad', '#4ec5ff', '#a78bfa', '#ffffff', '#ff9671', '#2d2a4a', '#ffb3d1'],
    maxLayers: 6,
    layerThickness: 0.055,     // world units added per layer
    shellGap: 0.012,
    hardenTime: 4.0,           // seconds glossy → matte
    coolSpeedMultiplier: 4,
    crackSpreadRate: 2.6,      // world units / s cracks travel
    stressThreshold: 1.0,
    stressRate: 2.4,           // stress per second at the press point
    stressRadius: 0.5,
    pieceCount: 46,            // voronoi pieces in the shell
    flakeGravity: 9.0,
    flakeLife: 7,              // seconds flakes stay on the table before fading
    chainStress: 0.16,         // fraction of the threshold a falling piece passes to its neighbours
    flakeSize: 1.0,            // scale multiplier on detached flakes
    peelHingeSeconds: 0.18,
    pourRate: 0.55,            // coverage per second while pouring
    dipDepth: 1.6,             // how far down the squishy must go to dip
    bulgeAmount: 0.18,
    crackWidth: 0.018,
  },

  // ── Debug ─────────────────────────────────────────────────────────────────
  debug: {
    overlayKey: '`',
  },
};

export type Tuning = typeof tuning;
