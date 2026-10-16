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
    // v2 fashion palette (24) offered in every color picker — neutrals, denim,
    // earth tones, jewel tones and a few neons/pastels as *choices*.
    palette: [
      '#16151c', '#3a3a44', '#8d8b96', '#f6f6f4', '#efe6d2', '#b8a07a',
      '#6e4a33', '#3d5a80', '#22304f', '#9fb59a', '#2f6b4f', '#6b7a3c',
      '#7d1f3a', '#e23b3b', '#ff8a3d', '#ffc93c', '#b6ff3b', '#00b3a4',
      '#00d4ff', '#3d6bff', '#7c4dff', '#b9a6ff', '#ff2e88', '#f6b8c8',
    ],
    skinTones: ['#ffe0cc', '#f6c9a8', '#e0a87e', '#c58a5f', '#93603d', '#5e3b27'],
    clearcoat: 0.3,
    clearcoatRoughness: 0.3,
    roughness: 0.45,
    envIntensity: 0.9,
    exposure: 1.0,
    shadowMapSize: 2048,
    // v3: a bright late-morning / afternoon sky (this block used to be the golden hour; same knob names)
    skyTop: '#2a78e4',
    skyMid: '#6bb3f4',
    skyBottom: '#d6ecff',
    sunColor: '#fff0d2',
    sunIntensity: 3.4,
    sunElevation: 56,          // degrees above the horizon
    sunAzimuth: 215,           // degrees (0 = +z / south, 90 = +x / east)
    hemiSky: '#c6e4ff',
    hemiGround: '#8bb26a',
    hemiIntensity: 1.05,
    fogColor: '#cde6fa',
    fogNear: 130,
    fogFar: 400,
    // ── v3 world ── (island look: water, sky, clouds; read by drive/terrain.ts, drive/sky.ts, art/env.ts)
    dayEnvIntensity: 0.7,      // sky reflections on paint / glass
    waterShallow: '#5ee0d0',   // sunlit aqua over sand
    waterMid: '#27b5cf',
    waterDeep: '#1668a8',
    waterSky: '#bfe3ff',       // what the surface reflects at a glancing angle
    waterFoam: '#ffffff',
    waterFoamAmount: 1,        // how far the foam laps up the shore (0 = none)
    cloudCount: 16,            // big stylized cumulus around the horizon
    cloudAlt: [95, 175] as [number, number],
    cloudTop: '#ffffff',
    cloudBottom: '#cfe0f5',
    sunDisc: '#fff6d8',
    shadowRadius: 3,           // soft-edge width of the sun's shadows
    // creator studio (workshop / style)
    studioBg: '#14121c',
    studioKey: 2.4,            // softbox key light intensity
    studioRim: 1.6,            // colored LED rim lights intensity
    studioRimA: '#ff2e88',
    studioRimB: '#00d4ff',
    ringLight: 9,              // brightness of the ring light seen in reflections
    studioEnvIntensity: 1.0,
  },

  // ── Audio ─────────────────────────────────────────────────────────────────
  audio: {
    master: 0.9,
    sfx: 0.9,
    music: 0.35,
    musicInWorkshop: false,
    pitchVariation: 0.08,      // ± fraction of pitch randomization per event
    volumeVariation: 0.15,     // ± fraction of volume randomization per event
    engineBaseHz: 42,
    engineTopHz: 128,
    engineVolume: 0.16,
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
    zoomMin: 2.7,              // camera distance
    zoomMax: 7.5,
    zoomDefault: 5.6,
    poseSeconds: 0.9,          // quick pose (taps, changes)
    poseHold: 1.7,             // the Pose button holds longer for the photo
    sparkleCount: 22,
    // character animation
    waveSeconds: 1.5,
    hopSeconds: 0.5,
    hopHeight: 0.22,           // world units
    idleSway: 0.012,           // radians of body roll
    breath: 0.018,             // chest rise while breathing
    // Style studio camera
    zoomButtonStep: 1.25,      // distance multiplier per +/- tap
    zoomWheel: 0.0015,         // distance change per wheel delta
    zoomSmooth: 9,             // camera glide (higher = snappier)
    lookYWide: 1.0,            // camera look-at height when zoomed out (world y, floor = 0)
    lookYClose: 1.55,          // ... and when zoomed in (head and shoulders)
    fov: 34,
    faceFrontDelay: 7,         // seconds idle before the character turns back to the front
    faceFrontSpeed: 3.2,
    autoFocus: true,           // tapping a category glides the camera to that body part
    focusDist: { hair: 3.0, accessory: 3.0, skin: 4.6, top: 3.9, bottom: 4.5, shoes: 3.6, looks: 5.6, face: 2.7 } as Record<string, number>,
    focusLookY: { hair: 1.66, accessory: 1.66, skin: 1.0, top: 1.28, bottom: 0.62, shoes: 0.3, looks: 0.98, face: 1.62 } as Record<string, number>,
    spinSoundEvery: 0.16,      // seconds between swish sounds while spinning
    surpriseStaggerMs: 120,    // delay between pieces when rolling a random outfit
    undoMax: 40,
    // Looks (saved outfits) + photo moment
    looksMax: 4,
    longPressMs: 550,
    flashDelayMs: 380,         // pose ramp-up before the camera flash
    studio: {
      floorOpacity: 0.84,      // glossy floor over the mirrored reflection
      ledSpeed: 0.18,          // LED color drift (cycles per second)
      beamAlpha: 0.1,          // spotlight cone brightness
    },
    // locomotion (Character.setMove): cycles per second, swing amplitudes in radians
    gait: {
      walkHz: 1.15, runHz: 2.2,
      walkSwing: 0.46, runSwing: 0.85,
      walkKnee: 0.8, runKnee: 1.6,
      walkArm: 0.4, runArm: 0.9,
      walkBob: 0.04, runBob: 0.09,
      walkLean: 0.02, runLean: 0.17,
    },
  },

  // ── v3.3 real motion: CC0 mocap clips (public/anims/moves.glb) retargeted onto the procedural characters (art/mocap.ts) ──
  character: {
    mocap: true,               // false = today's fully procedural motion
    walkRate: 1.35,            // clip playback speed (the game moves faster than the clips were captured)
    jogRate: 1.4,
    sprintRate: 1.2,
    pelvisLift: 0.02,          // m: our legs are 2 cm longer than the clips' rig, so the pelvis rides a bit higher to keep the soles on the ground
    pelvisBob: 1.0,            // scale of the clip's vertical pelvis bob
    leanFix: 0.14,             // rad: stand the chest up (the clips are captured a bit hunched)
    leanFixRun: 0.2,           // rad: extra chest lift at a jog / sprint
    headFix: 0.1,              // rad: lift the head the same way (the face looks ahead, not at the ground)
  },

  // ── v3 locker (W2): the Locker's lobby stage, per-slot cameras, face light, reveal card ──
  locker: {
    /** camera distance / look-at height per Locker slot */
    slotDist: { outfit: 5.3, backBling: 4.2, glider: 12.5, contrail: 7.2, emote: 5.0, wrap: 7.6, custom: 5.6 } as Record<string, number>,
    slotLookY: { outfit: 0.97, backBling: 1.18, glider: 2.7, contrail: 1.15, emote: 1.0, wrap: 1.0, custom: 0.98 } as Record<string, number>,
    /** extra camera height per slot (the glider tab looks down on the canopy) */
    slotElev: { glider: 1.2 } as Record<string, number>,
    /** warm fill so the face is the best-lit thing on screen (+ a soft hair rim from behind) */
    faceLight: { color: '#ffd9bd', intensity: 55, range: 10, angle: 0.32, penumbra: 0.9, x: 1.1, y: 2.7, z: 3.6, rim: 1.4 },
    coolRim: { color: '#9fc4ff', intensity: 40, x: -2.4, y: 2.6, z: -2.2 },
    rayCount: 12,              // lobby light rays behind the player
    raySpeed: 0.045,           // rad/s
    sparkleCount: 70,          // floating dust-sparkles
    glowLerp: 5,               // how fast the stage glow follows the equipped item's rarity colour
    thumbBudgetMs: 7,          // item pictures rendered per frame (ms)
    revealSeconds: 7,          // the unlock card closes itself after this long
    orbitRadius: 1.5,          // contrail preview: the player flies a lazy circle this wide
  },

  // ── Driving + the big world (drive module) ───────────────────────────────
  drive: {
    // handling (units / s)
    topSpeed: 22,
    reverseSpeed: 7,
    acceleration: 11,
    brakeForce: 26,
    coastDrag: 2.0,
    turnRate: 2.4,             // rad / s at full steer
    turnSpeedFull: 4,          // speed at which steering reaches full authority
    bounceRestitution: 0.4,
    grip: 9.5,                 // sideways grip (1/s): higher = less drift
    steerResponse: 9,          // how fast the steering wheel follows the stick (1/s)
    turnMinAuthority: 0.22,    // fraction of turnRate available at a standstill
    turnSpeedLoss: 0.32,       // fraction of turnRate lost at top speed
    joyDeadzone: 0.12,
    joyGasZone: 0.5,           // joystick vertical push needed before it acts as gas / reverse
    // boost (⚡ / Shift): a burst, no score, no penalty
    boostSeconds: 2.0,
    boostCooldown: 3.5,        // the meter refills over this long
    boostSpeed: 1.5,           // top speed multiplier while boosting
    boostAccel: 2.6,           // acceleration multiplier while boosting
    boostFov: 15,              // extra FOV degrees at full boost
    // drift (brake or Space + steer at speed): looser grip, skid marks, tyre squeal
    driftMinSpeed: 9,
    driftGrip: 0.24,           // grip multiplier while drifting
    driftYaw: 1.3,             // steering multiplier while drifting
    driftBrake: 0.28,          // how much of brakeForce still applies while drifting
    skidSlip: 2.6,             // sideways speed that leaves skid marks
    // air + terrain
    gravity: 24,
    climbLimit: 0.95,          // a step taller than this is a wall for the car
    slopeGravity: 9,           // how hard hills slow you down / speed you up
    launchMinVy: 1.2,          // upward speed that counts as a jump (carJump)
    launchMaxVy: 8,            // v3 rides: takeoff speed cap off a player-built ramp (the town's own kickers are not capped)
    landMinVy: 3.5,            // landing speed that counts as a landing (carLand)
    airSteer: 0.35,            // steering authority in the air
    waterLimit: -0.5,          // the car can't enter ground lower than this (the sea, the lake)
    // collisions
    carRadius: 1.0,            // the car is two circles (front + rear) of this radius
    carCircleOffset: 1.0,
    collideCooldownMs: 280,
    collideMinSpeed: 2.4,
    // camera
    cameraFollowDistance: 11,
    cameraHeight: 6.0,
    cameraLag: 4.5,
    cameraLookAhead: 5,
    cameraLookHeight: 1.2,
    cameraPosLag: 1.7,
    cameraMinDistance: 4.5,
    cameraFov: 54,
    cameraFovBoost: 8,         // extra FOV at top speed
    fogNear: 130,              // v3 world: light blue haze, a long view over the island
    fogFar: 400,
    shadowSize: 30,            // half-extent of the sun shadow box that follows the player
    shadowAhead: 10,
    shadowMap: 2048,
    // car look
    carLean: 0.1,
    carPitch: 0.05,
    carSquash: 0.04,
    carBounceKick: 2.2,
    wheelSteerAngle: 0.5,
    driverScale: 0.92,         // size of the seated characters in the car
    driverY: 0.62,             // seat cushion height: the character's seat point (Character.SEAT_Y) rests here
    driverYaw: Math.PI,        // characters are built facing +z; the car faces -z
    // on foot
    walkSpeed: 4.6,
    runSpeed: 8.4,
    runStick: 0.86,            // stick push (0..1) that counts as running
    footAccel: 26,
    jumpSpeed: 7.4,
    footGravity: 24,
    footRadius: 0.42,
    stepUp: 0.62,              // tallest step a walker climbs
    footLedge: 1.0,            // off railed stairs / roof terrace, a walker won't WALK off a drop taller than this
    waterWade: -0.22,          // a car-door spawn / dropped-off car must be on ground at least this high (dry)
    // water: wade the shallows, swim the deep (the surface is WATER_Y plus the waves)
    wadeSpeed: 0.6,            // walk-speed multiplier at the deepest wading (it eases in from the shore)
    swimOn: 0.9,               // water this deep over the floor (units): you swim ...
    swimOff: 0.7,              // ... until it gets shallower than this (hysteresis: no flicker at the edge)
    swimChest: 1.15,           // while swimming the feet hang this far below the surface (the water line sits at the chest)
    swimSpeed: 3.0,
    swimRun: 4.4,              // swimming with the stick fully pushed / Shift
    swimAccel: 4,              // how quickly a stroke gets you moving (1/s)
    swimGlide: 1.4,            // how quickly you coast to a stop when you stop swimming (1/s)
    swimKick: 6.0,             // Jump in the water: a dolphin hop (upward speed)
    swimKickEvery: 0.6,        // seconds between kicks
    swimReach: 0.8,            // a swimmer climbs out onto a deck / bank whose edge is within this of the top of their head
    swimStroke: 0.55,          // seconds between stroke splashes at a swimmer's normal speed
    stuckSeconds: 4,           // last-resort rescue: pushing the stick in the water but going nowhere this long
    // call the car
    callCooldown: 2,           // seconds
    callDistance: 5,           // how far in front of the walker the car appears
    getInRadius: 3.6,          // how close to the car you must be to hop back in
    getOutMaxSpeed: 5,
    footCamDistance: 5.4,
    footCamHeight: 2.5,
    footCamLag: 7,
    footCamLook: 1.25,
    footstepEvery: 0.46,       // seconds between footstep ticks at a walk (shorter when running)
    // doors (walk-in / drive-in triggers)
    doorRadius: 1.6,
    plotDoorRadius: 2.4,
    plotCarSpeed: 6,           // a car below this speed triggers a For Sale mat
    doorPadCarSpeed: 99,       // the Studio / Builder pads trigger at any speed (as before)
    doorTriggerRadius: 4.6,    // the Studio / Builder car pads (a car triggers them 0.9 further out)
    // charms
    charmRadius: 2.3,
    charmBeamRange: 70,
    charmMapRange: 40,
    // jobs (pickup / drop-off, optional, no timer)
    controlSize: 132,          // px, on-screen control diameter
    hornCooldownMs: 250,
    jobTriggerRadius: 3.4,
    passengerHopSeconds: 0.6,
    jobRespawnSeconds: 4,
    jobFirstSeconds: 2.5,
    jobMinDistance: 70,
    jobWaveRadius: 18,
    jobWaveEverySeconds: 6,
    jobCelebrateSeconds: 2.8,
    // hud
    minimapSize: 160,          // px
    minimapRadius: 72,         // world units from the centre to the edge of the dial
    nameTagDistance: 55,
    // world
    cloudSpeed: 0.0035,
    scenerySeed: 20261016,
    cullTerrain: 520,          // terrain chunks farther than this hide (v3: the haze fully hides them by then)
    cullVegetation: 200,
    // ── v3 rides: defaults every ride starts from (tuning.rides.<kind> overrides them) ──
    hover: 0,                  // ride height above the ground (the hoverboard floats)
    hopSpeed: 0,               // Space hops (hoverboard) with this upward speed; 0 = no hop
    waterOnly: 0,              // 1 = a boat: only moves on water
    shoreLimit: -0.6,          // boat: ground higher than this is shore (it noses up to it and stops)
    susK: 170,                 // body spring (higher = stiffer)
    susC: 11,                  // body damping
    bumpKick: 2.2,             // how hard a bump / landing kicks the body
    lean: 0.1,                 // body roll into turns
    wobble: 0,                 // heavy sloshing roll + yaw sway (ice-cream truck)
    pitchK: 0.05,
  },

  // ── v3 rides (W3): overrides of tuning.drive per vehicle kind ──────────────
  // physics: topSpeed, acceleration, brakeForce, reverseSpeed, coastDrag, turnRate, turnSpeedFull, turnMinAuthority, turnSpeedLoss,
  // grip, steerResponse, boostSpeed, boostAccel, drift*, gravity, climbLimit, slopeGravity, airSteer, waterLimit, carRadius, carCircleOffset,
  // hover, hopSpeed, waterOnly, shoreLimit; looks: susK, susC, bumpKick, lean, wobble, pitchK.
  // chase camera: cameraFollowDistance (m behind), cameraHeight (m up), cameraLookHeight (m above the rider), cameraLookAhead (m ahead of the ride),
  // cameraMinDistance (closest it may be pushed in), cameraPosLag (higher = stiffer), cameraFov.
  rides: {
    sports: { cameraFollowDistance: 8.8, cameraHeight: 3.8, cameraLookHeight: 1.2, cameraLookAhead: 4, cameraMinDistance: 3.6, cameraPosLag: 2.3, topSpeed: 25, acceleration: 13, brakeForce: 28, turnRate: 2.5, grip: 8, driftGrip: 0.22, driftYaw: 1.35, boostSpeed: 1.55, boostAccel: 2.8 },
    pickup: {
      cameraFollowDistance: 10.5, cameraHeight: 4.4, cameraLookHeight: 2.0, cameraLookAhead: 4.5, cameraMinDistance: 4.5,
      topSpeed: 19, acceleration: 9.5, brakeForce: 24, turnRate: 2.0, turnSpeedFull: 4.5, grip: 10.5, climbLimit: 1.55, slopeGravity: 3.5, waterLimit: -1.0,
      carRadius: 1.05, carCircleOffset: 1.15, boostSpeed: 1.35, susK: 95, susC: 5, bumpKick: 3.4, lean: 0.17, pitchK: 0.08,
    },
    golfcart: {
      cameraFollowDistance: 5.2, cameraHeight: 2.5, cameraLookHeight: 1.45, cameraLookAhead: 3.2, cameraMinDistance: 3.2, cameraPosLag: 3.2, cameraFov: 58, cameraFovBoost: 3,
      topSpeed: 10.5, acceleration: 8, brakeForce: 22, reverseSpeed: 5, turnRate: 3.1, turnSpeedFull: 1.6, turnMinAuthority: 0.6, turnSpeedLoss: 0.08, grip: 15,
      carRadius: 0.7, carCircleOffset: 0.45, boostSpeed: 1.3, susK: 120, susC: 8, lean: 0.12, collideMinSpeed: 2,
    },
    hoverboard: {
      cameraFollowDistance: 4.5, cameraHeight: 2.2, cameraLookHeight: 1.3, cameraLookAhead: 3, cameraMinDistance: 2.8, cameraPosLag: 3.6, cameraFov: 60, cameraFovBoost: 5,
      topSpeed: 21, acceleration: 15, brakeForce: 20, reverseSpeed: 6, turnRate: 3.0, turnSpeedFull: 3, grip: 5.2, driftGrip: 0.3, hover: 0.42, hopSpeed: 6.6, gravity: 22,
      climbLimit: 1.3, waterLimit: -1.15, airSteer: 0.95, carRadius: 0.55, carCircleOffset: 0.5, boostSpeed: 1.45, lean: 0.34, susK: 80, susC: 6, pitchK: 0.12,
    },
    icecream: {
      cameraFollowDistance: 12.5, cameraHeight: 5.6, cameraLookHeight: 2.2, cameraLookAhead: 4.5, cameraMinDistance: 5,
      topSpeed: 15.5, acceleration: 6.2, brakeForce: 16, turnRate: 1.6, turnSpeedFull: 5, grip: 7, carRadius: 1.1, carCircleOffset: 1.2, boostSpeed: 1.28,
      wobble: 0.22, susK: 60, susC: 3, lean: 0.28, bumpKick: 3, pitchK: 0.07,
    },
    boat: {
      cameraFollowDistance: 8.5, cameraHeight: 3.4, cameraLookHeight: 1.1, cameraLookAhead: 4, cameraMinDistance: 3.8,
      topSpeed: 21, acceleration: 9, brakeForce: 12, reverseSpeed: 4, coastDrag: 0.7, turnRate: 1.9, turnSpeedFull: 3, turnMinAuthority: 0.3, grip: 2.4,
      driftGrip: 0.6, waterOnly: 1, shoreLimit: -0.6, boostSpeed: 1.5, carRadius: 1.0, carCircleOffset: 1.4, lean: 0.22, susK: 70, susC: 4,
    },
  },

  // ── House & village building ──────────────────────────────────────────────
  build: {
    gridSize: 1,               // world units (metres) per cell
    plotCells: 12,             // each house plot is plotCells x plotCells (v2: bigger lots)
    plotsPerTown: 12,
    snapTolerance: 0.5,        // cells: a drag this far outside the plot still snaps to its edge
    wallHeight: 2.6,           // one storey (v2: real proportions; a character is ~1.75 tall)
    wallThickness: 0.2,
    floorHeight: 0.12,         // thickness of a floor tile (keep a bit above the lot's pad)
    placeBounceSeconds: 0.35,
    maxUndo: 80,
    // roofs
    roofPitch: 0.5,            // gable rise per unit of run
    roofMaxRise: 2.4,          // tallest a gable/slant may get (wide houses get a flatter pitch)
    roofThickness: 0.16,
    roofFlatThickness: 0.22,
    roofOverhang: 0.3,
    slantPitch: 0.24,          // modern single-slope roof rise per unit of run
    // camera
    orbitMinDistance: 10,      // town view: closest the camera may get
    orbitMaxDistance: 130,     // town view: farthest (the whole residential district fits)
    orbitRotateSpeed: 0.006,   // radians per px dragged
    houseDistance: 24,         // camera distance when editing a house
    houseMinDistance: 6,
    houseMaxDistance: 52,
    townPitch: 0.85,           // camera elevation (radians) in town / house mode
    housePitch: 1.0,
    pitchMin: 0.32,            // never lets the camera sink near the ground
    pitchMax: 1.4,
    zoomWheelSpeed: 0.0014,    // mouse wheel zoom (per wheel unit)
    cameraRate: 14,            // camera smoothing (per second) while the player moves it
    glideRate: 4.2,            // camera smoothing while gliding to a house
    // placing
    ghostLerp: 26,             // ghost preview position smoothing (per second)
    touchLift: 70,             // px the palette-drag ghost floats above a finger
    dragStartPx: 8,            // palette tile drag threshold
    tapMaxPx: 12,              // pointer travel still counted as a tap
    tapMaxMs: 650,
    wallLowScale: 0.18,        // height of walls in "low walls" view
    tagHeight: 7,              // owner name tag height above the plot
    undoMergeMs: 4000,         // recolors of one piece within this window share one undo step
    fineDetailBelow: 2200,     // town bakes drop tiny details (books, keys...) above this many pieces
    shadowSizeTown: 46,        // half-extent of the sun's shadow box in town view
    shadowSizeHouse: 18,       // ...and when editing a house
    // edit-mode batching: every piece of a storey is baked into a few merged meshes; only pieces
    // that were just placed / changed / are being moved keep their own object for a moment
    liveSeconds: 1.1,          // a changed piece keeps its own object this long (its pop animation), then folds into the bake
    foldQuietSeconds: 0.18,    // ...and the re-bake waits for this long without edits (so a paint stroke bakes once)
    maxLive: 40,               // too many separate piece objects: fold the settled ones even mid-stroke
  },

  // ── v3 build (W5): free building anywhere in the world (Fortnite-style pieces) ──────────
  build3: {
    tile: 4.8,                 // metres: one build cell (x and z)
    storey: 3.6,               // metres: one storey (iy)
    thick: 0.3,                // wall / floor slab thickness
    maxPieces: 3000,           // cap (perf + save size)
    chunk: 8,                  // tiles per render chunk (merged per material; only dirty chunks rebuild)
    rebakeEveryMs: 110,        // at most one chunk re-bake this often (a drag-build run folds in batches)
    reach: 0.62,               // ghost distance in front of the player, in tiles
    animSeconds: 0.38,         // build-in animation (rise + scale + bounce)
    foldSeconds: 0.7,          // an animating piece keeps its own mesh this long, then folds into its chunk
    undoMax: 60,
    holdMs: 220,               // press this long (without moving) = drag-build (a run of pieces)
    placeEveryMs: 70,          // fastest repeat while drag-building
    roofRise: 0.62,            // pyramid roof apex height, in storeys
    rampStrips: 6,             // collider strips along a ramp
    skirtMax: 2.2,             // pieces near the ground extend down to hide gaps on slopes (metres)
    decorReach: 3.6,           // decor ghost distance in front of the player (m)
    decorMax: 600,
    stepUp: 0.62,              // surfaceBelow() tolerance (matches tuning.drive.stepUp)
    // distance detail (build/world3/lod.ts): metres from the CAMERA to the nearest bit of a chunk
    lodFlat: 120,              // builds: farther than this a chunk draws as ONE flat vertex-coloured mesh (textures are too small to see)
    lodHide: 330,              // ...and past this (the fog has swallowed it by then) it is not drawn
    lodShadow: 55,             // builds: only chunks nearer than this cast shadows (the sun's shadow box is ~46 m)
    decorFlat: 30,             // decor: farther than this a chunk draws as one flat mesh (a dozen materials -> 1 draw call)
    decorHide: 70,             // ...and past this it is not drawn
    decorShadow: 40,
    lodHyst: 8,                // a chunk comes this far back inside a range before it changes level again (no flicker on an edge)
  },

  // ── v3 emote (W5): the in-world emote wheel, its camera swing and music ─────────────────
  emote3: {
    camYawOff: 0.42,           // rad: the lens swings to her FRONT, a little off-axis (a three-quarter view)
    camPitch: 0.1,             // rad: lens elevation above the pivot while emoting
    camArm: 0.82,              // arm length x (a bit closer, she fills the frame)
    camShoulder: 0,            // shoulder offset x (0 = she is centred)
    camIn: 4.2,                // 1/s: how fast the view swings round ...
    camOut: 5,                 // ... and back
    camDelay: 0.12,            // s after the tap before the swing starts (the wheel is closing)
    musicVol: 0.85,            // emote music level (x tuning.audio.music)
    duck: 0.22,                // the town music drops to this fraction while an emote plays
    maxLoopSeconds: 60,        // a looping emote tune ends by itself after this long (nobody dances for a minute)
    wheelFade: 0.14,           // s: wheel open / close animation
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
    // ── base slime ("glossy"); the other types override some of these (see `types` below) ──
    stretchLimit: 2.2,         // world units the grabbed point can travel (soft rubber-band beyond bandStart)
    bandStart: 0.75,           // fraction of stretchLimit where the rubber band starts to resist
    snapWidth: 0.12,           // how far past the band (× stretchLimit) the strand is "at its limit"…
    snapRate: 4,               // …and how fast tension builds there; a full tension snaps the strand
    snapBackSpeed: 12,         // release spring frequency in rad/s (higher = snappier return)
    viscosity: 0.86,           // 0..1, higher = gooier: more damped, calmer, slower-settling jiggle
    plasticity: 0.12,          // fraction of a pull that stays behind (soft peaks, folds)…
    relaxSpeed: 0.25,          // …and how fast that memory relaxes back to the dome (per second)
    grabRadius: 0.9,           // world units of slime that follow a fingertip
    pokeDepth: 0.35,           // dent depth of a tap
    glitterDensity: 0.6,       // 0..1 glitter amount (1 = a flake in half the cells)
    clickDistance: 0.18,       // world units of finger travel per wet click at a medium speed
    radius: 1.9,               // blob footprint radius (mesh / tray knobs are read once at startup)
    // mesh / shape
    domeHeight: 0.46,          // dome height as a fraction of radius
    gridN: 88,                 // mesh is (gridN + 1)² vertices (88 → 7.9k, max 250)
    flatten: 0,                // >0 spreads the blob lower and wider, <0 puffs it up
    // stretch shaping
    grabReach: 1.25,           // slime within grabRadius × this follows the finger
    thinning: 1.4,             // how quickly a strand thins as it stretches
    bulbRadius: 0.13,          // gooey drop at the end of a strand
    droop: 0.12,               // sag of a sideways strand
    strandLag: 16,             // how fast the strand body trails the fingertip (rad/s, lower = whippier)
    fiber: 0,                  // 0..1 fibrous fluting along a strand (cloud slime)
    // feel
    followSpeed: 36,           // how tightly the fingertip drags the slime (rad/s)
    followDamping: 0.9,        // 1 = no overshoot when the finger stops
    vertexFollow: 22,          // per-vertex spring toward its target (rad/s)
    gripFollow: 42,            // same, for slime held by a finger
    slipDistance: 1.5,         // sideways pull beyond this drags the strand's root along
    slipRate: 3,
    rippleSpeed: 1.6,          // world units / s that pokes and landings ripple outward
    rippleDamping: 2.4,        // how fast ripples die (lower = they travel farther)
    pokeRipple: 1,             // poke / press ripple strength
    dentDecay: 3.2,            // how fast a poke dent refills (per second)
    pokeMemory: 0.14,          // fraction of a poke dent that lingers as a dimple
    jiggleFreq: 13,            // whole-blob wobble after a release (rad/s)
    breath: 0.02,              // idle breathing amplitude
    pickRadius: 0.07,          // how close to a surface point a touch must be to grab it
    // sound rhythm: clicks come every clickDistance × (clickSlow … clickFast) of finger travel
    clickSlow: 1.5,            // slow drags: sparse clicks
    clickFast: 0.55,           // fast drags: dense crackle
    clickMinMs: 38,
    bigPopChance: 0.05,        // chance a click is a bigger "air" pop (grows with stretch)
    // air bubbles trapped by folds
    bubbleMax: 14,
    bubbleLife: 12,            // seconds before an unpopped bubble pops by itself
    // dark-studio look
    ringLight: 0.3,            // extra analytic ring-light catchlight on the surface (the room env has its own; 0 = off)
    ledRim: 0.3,               // extra pink / cyan LED rim glow on the silhouette (0 = off)
    // tray
    trayMargin: 0.16,
    trayRim: 0.22,
    trayFloor: 0.09,
    trayZ: 0.1,
    // add-ins
    sprinkleCount: 80,
    starCount: 40,
    pearlCount: 54,
    beadCount: 170,            // crunchy beads
    // colors: vivid, not baby pastel (the fashion palette from tuning.art.palette follows these)
    defaultColor: '#ff2e88',
    extraColors: [
      '#ff2e88', '#ff4d4d', '#ff8a3d', '#ffc93c', '#b6ff3b', '#00e5a0', '#00d4ff', '#2b6bff',
      '#7c4dff', '#d946ef', '#14b8a6', '#e11d48',
    ],
    // per-type overrides of the knobs above (glossy = the base values)
    types: {
      glossy: {},
      butter: {
        stretchLimit: 1.8, thinning: 0.55, bulbRadius: 0.2, plasticity: 0.5, relaxSpeed: 0.05, viscosity: 1, snapBackSpeed: 7,
        followSpeed: 30, strandLag: 11, droop: 0.28, jiggleFreq: 9, rippleSpeed: 1.2, rippleDamping: 5.5, dentDecay: 0.7, pokeMemory: 0.55,
        flatten: 0.16, grabRadius: 1.05, snapRate: 2.5, breath: 0.01, clickSlow: 1.9, clickFast: 0.8,
      },
      clear: {
        stretchLimit: 2.7, thinning: 1.9, bulbRadius: 0.11, plasticity: 0.05, relaxSpeed: 0.4, viscosity: 0.55, snapBackSpeed: 15,
        strandLag: 20, jiggleFreq: 15, rippleDamping: 1.8, dentDecay: 3.6, pokeRipple: 1.2,
      },
      crunchy: {
        stretchLimit: 1.9, thinning: 0.9, bulbRadius: 0.17, plasticity: 0.25, relaxSpeed: 0.15, viscosity: 0.95, snapBackSpeed: 9,
        jiggleFreq: 10, rippleDamping: 4.5, dentDecay: 1.6, pokeMemory: 0.3, flatten: 0.08, clickSlow: 1.3, clickFast: 0.5,
      },
      cloud: {
        stretchLimit: 2.4, thinning: 0.9, bulbRadius: 0.2, plasticity: 0.3, relaxSpeed: 0.12, viscosity: 0.5, strandLag: 9, droop: 0.2,
        jiggleFreq: 9, rippleDamping: 4, flatten: -0.1, fiber: 0.3, dentDecay: 1.3, snapRate: 3, clickSlow: 1.7, clickFast: 0.6,
      },
      holo: { jiggleFreq: 14, rippleDamping: 2 },
      galaxy: { viscosity: 0.9, relaxSpeed: 0.2, jiggleFreq: 12, rippleDamping: 2.2 },
    } as Record<string, Record<string, number>>,
  },

  // ── Workshop: wax cracking ────────────────────────────────────────────────
  wax: {
    waxColors: ['#ff2e88', '#7c4dff', '#00d4ff', '#b6ff3b', '#ffc93c', '#ff8a3d', '#e23b3b', '#16151c', '#f6f6f4', '#3d6bff', '#00b3a4', '#f6b8c8'],
    maxLayers: 6,
    layerThickness: 0.07,      // world units added per layer (thick enough that the stripes read)
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

  // ── v3 movement (W4): over-the-shoulder camera, sprint, mantle, glide, launch pads, bus drop, POI cards ──
  movement3: {
    // over-the-shoulder camera (on foot)
    camArm: 3.7,               // m from the pivot back to the lens
    camShoulder: 0.8,          // m the lens sits to the RIGHT of the character (so she reads slightly left of centre)
    camPivotY: 1.45,           // pivot height above the feet
    camPitchDefault: 0.16,     // rad: lens elevation above the pivot
    camPitchMin: -0.3,         // drag limits (rad)
    camPitchMax: 1.1,
    camFollow: 18,             // 1/s: how tightly the pivot tracks the walker horizontally (higher = snappier)
    camRise: 7,                // 1/s: ... vertically (stairs, jumps, swimming)
    camRiseAir: 20,            // 1/s: ... vertically while flying (pads, skydive)
    camSettle: 7,              // 1/s: easing after hopping out of the car
    camOccIn: 18,              // 1/s: the lens comes in fast when something is in the way ...
    camOccOut: 3,              // ... and eases back out slowly
    camSqueezeRise: 4.2,       // m the lens rises when the arm is fully squeezed by the town (an alley, a hedge): it looks down over it
    camSqueezeRiseBuilt: 1.3,  // ... but inside something the player built the lens stays low, close behind the shoulder
    camMinFrac: 0.28,          // the arm never shrinks below this fraction in the town ...
    camMinFracBuilt: 0.2,      // ... or this inside a build
    camRecenterDelay: 0.8,     // s after the last drag before the view swings in behind a forward-walking player
    camRecenterRate: 1.4,
    lookZoneMinX: 0.4,         // touch: a look-drag only starts to the right of this fraction of the screen width
    // field of view kicks (degrees on top of the foot FOV)
    fovSprint: 6,
    fovLaunch: 12,             // impulse at a launch pad / the bus jump, decays at fovKickDecay
    fovKickDecay: 2.6,
    fovDive: 9,
    fovGlide: 4,
    fovBus: 6,
    fovRate: 8,                // 1/s: how fast the FOV follows its target
    // sprint
    sprintMul: 1.14,           // on top of drive.runSpeed
    doubleTapMs: 320,          // double-tap the move stick (second press held) to sprint
    sprintDustEvery: 0.16,     // s between dust puffs behind a sprinting walker
    // slide (sprint + Ctrl / X / the SLIDE button)
    slideMinSpeed: 5.5,        // m/s you must be running to start a slide
    slideBoost: 1.12,          // speed multiplier (plus 1.2 m/s) on the way in
    slideFriction: 2.6,        // m/s^2 of drag on the flat
    slideGravity: 13,          // m/s^2 per unit of slope: downhill speeds you up, uphill drags
    slideMax: 24,              // m/s
    slideEndSpeed: 2.6,        // slower than this and you stand back up
    slideTurn: 1.7,            // rad/s the stick can bend the slide
    slideLean: 1.15,           // rad she leans back (the fallback pose)
    slideCooldown: 0.45,
    slideSprayEvery: 0.05,     // s between puffs of dust / snow
    fovSlide: 8,               // FOV kick at slideMax speed
    // ziplines
    zipRadius: 2.7,            // m from a start post's foot that offers "Zip!"
    zipStart: 3,               // m/s as you push off
    zipGravity: 5.5,           // m/s^2 along the cable per unit of downhill slope
    zipMax: 16,
    zipMinSpeed: 4.5,
    zipLiftSeconds: 0.45,      // the hop up to the pulley
    zipGlideAlt: 5.5,          // letting go this high above the ground opens the glider
    fovZip: 8,
    // mantle (climb a ledge you run into)
    mantleMin: 0.7,            // ledge heights (m above the feet) that trigger a mantle
    mantleMax: 1.9,
    mantleSeconds: 0.46,
    mantleCooldown: 0.45,
    // free fall + glider
    airGravity: 22,            // m/s^2 while launched / diving
    glideDeployFall: 6,        // falling this far (m) deploys the glider by itself
    glideMinAlt: 3.5,          // ...if there is at least this much air left under the feet
    glideSink: 3.2,            // m/s descent under the canopy
    glideSinkPush: 1.1,        // extra sink when the stick is pushed (faster glide)
    glideSpeedIdle: 5,         // m/s forward drift with no stick
    glideSpeedMin: 6,
    glideSpeedMax: 12,
    glideTurn: 2.6,            // rad/s steering
    glideAccel: 2.5,           // 1/s speed easing
    glideFlareAlt: 2.4,        // m above the ground where the glider flares for a soft landing
    glideLandSink: 1.2,
    glideOpenSeconds: 0.35,    // canopy pop-open
    diveTerminal: 17,          // m/s skydive fall speed
    diveGravity: 36,
    diveSpeedMin: 6,
    diveSpeedMax: 14,
    diveTurn: 3.4,
    diveTilt: 1.25,            // body pitch while skydiving (rad, 1.57 = belly-down flat)
    deployAlt: 25,             // the glider opens this far above the ground after a bus jump
    safeAlt: 11,               // ...and never lower than this, whatever happened
    airBound: 2,               // m inside the map edge that a flyer is held back
    trailLife: 1.1,            // s of contrail behind a flyer
    // launch pads
    padRadius: 1.5,
    padSpeed: 33,              // m/s up (apex ~ 25 m at airGravity 22)
    padCooldown: 1.3,
    padDeployFall: 8,          // m of skydive after the apex before the glider opens
    padCullDist: 150,
    // party bus
    busAlt: 80,
    busSpeed: 14,              // m/s along BUS_PATH
    busArm: 11,                // camera distance from the bus
    busJumpHop: 5,             // m/s up when you hop off the roof
    busHonkEveryS: 9,
    // POI title cards
    poiCardSeconds: 2.5,
    poiCooldownS: 75,          // the same POI will not re-announce itself this soon
    poiGapS: 3,                // minimum time between any two cards
    poiRadiusMul: 0.7,         // district radii shrink to this fraction when POIS (townLayout) is not there yet
  },

  // ── Debug ─────────────────────────────────────────────────────────────────
  debug: {
    overlayKey: '`',
  },
};

export type Tuning = typeof tuning;
