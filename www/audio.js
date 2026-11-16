// =====================================================================
//  Sound effects and the tank engine, with the Web Audio API. Every
//  sound is made in code; a few effects and the engine are played from
//  the files in sounds/ instead once those have loaded (SOUND_FILES in
//  config.js). Until then, or if a file fails to load, the sound made in
//  code plays, so the game never goes silent.
//
//  Use:  Sound.play("coin")   or   Sound.play("gameOver", 0.4)  (delay)
//        Sound.play("powerUp", 0, "shield")   (a sound's variant)
//        Sound.setEngine(driving, pitch)      (every frame, tanks.js)
//  The names are the ones in AUDIO.volumes (config.js).
//
//  Browsers only allow sound after the player touches / clicks / presses
//  a key, so the AudioContext is created (or resumed) on the first input,
//  and the sound files are fetched and decoded in the background then.
//
//  Sound is OFF (muted) when either:
//    - the SOUND setting is off (settings.sound, the overall switch;
//      pause.js calls Sound.refreshMute() when it changes), or
//    - a rewarded ad is loading or playing (Sound.setAdPlaying, gameover.js).
//  On top of that, the settings have two separate switches: sound
//  effects (settings.soundEffects) and the engine (settings.engineSound).
//  While the app is hidden (in the background, screen off) the
//  AudioContext is suspended and the sound files stop loading
//  (setSystemPaused, called by setSystemPause in pause.js).
//
//  Where the sound goes (made in code or from a file, the same way):
//    each effect -> its volume -> effects volume -> softener (low-pass) -+
//    engine ------------------------------------ -> engine volume -------+-> mute -> limiter -> speakers
//  The limiter (a compressor) keeps many sounds at once from clipping.
// =====================================================================

const Sound = (() => {
  let audioCtx = null;     // created on the first input
  let effectsBus = null;   // every effect goes through this (AUDIO.effectsVolume)
  let engineBus = null;    // the engine goes through this (ENGINE_VOLUME)
  let mute = null;         // 1 = sound on, 0 = muted
  let noiseBuffer = null;  // 1 second of white noise, reused by all sounds
  let engine = null;       // the engine's nodes, made the first time it runs
  const active = [];       // sounds playing now: { end (AudioContext time), out }
  const lastStart = {};    // sound name -> when it last started (AudioContext time)
  let systemPaused = false; // the app is hidden (setSystemPaused)
  let readyLogged = false;
  let adPlaying = false;   // a rewarded ad is loading or playing: silent
  const fileState = {};    // file -> "loading" or "done" (loaded, or failed for good)
  let fileAbort = null;    // stops the downloads running now (on a pause)
  let filesStarted = 0;    // when the files started loading (DEBUG log)
  const fileBuffers = {};  // effect name -> its decoded files (the ones that loaded)
  const lastFile = {};     // effect name -> the file it played last
  let engineLoop = null;   // the decoded engine loop file, once loaded

  // Is sound allowed at all? The SOUND setting (pause menu, settings in
  // pause.js) is the overall switch.
  function soundSettingOn() {
    return typeof settings === "undefined" || settings.sound !== false;
  }

  function isEnabled() {
    return soundSettingOn() && !adPlaying;
  }

  function effectsSettingOn() {
    return typeof settings === "undefined" || settings.soundEffects !== false;
  }

  // A rewarded ad starts loading (true) or is over (false): everything
  // stays quiet until it's over
  function setAdPlaying(on) {
    adPlaying = on;
    refreshMute();
  }

  function engineSettingOn() {
    return typeof settings === "undefined" || settings.engineSound !== false;
  }

  // Turn everything down to 0 (muted) or back up, and stop the engine
  // when sound is off
  function refreshMute() {
    if (!mute) return;
    glide(mute.gain, isEnabled() ? 1 : 0, 0.01);
    if (!isEnabled()) setEngine(false);
  }

  // Move an audio setting (volume, pitch...) smoothly to "value", so
  // nothing clicks. It gets there in about 3 x "smooth" seconds.
  function glide(param, value, smooth) {
    const t = audioCtx.currentTime;
    param.cancelScheduledValues(t);
    param.setTargetAtTime(value, t, smooth);
  }

  // resume() / suspend() return a promise that may fail: ignore that
  function quietly(promise) {
    if (promise && promise.catch) promise.catch(() => {});
  }

  // ---------------------------------------------------------------
  // Start audio on the first input (and wake it up again later if the
  // browser suspended it, e.g. after the phone was locked)
  // ---------------------------------------------------------------
  function unlock() {
    if (systemPaused) return; // the app is hidden: wait until it shows again
    try {
      if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return; // very old browser: no sound
        audioCtx = new AudioContextClass();
        noiseBuffer = makeNoiseBuffer();
        buildOutput();
        loadFiles(); // in the background; nothing waits for them
      }
      // "suspended" before the first real tap, "interrupted" on iPhones
      // after a call or an alarm
      if (audioCtx.state !== "running" && audioCtx.state !== "closed") {
        const resumed = audioCtx.resume();
        quietly(resumed);
        playSilence();
        if (DEBUG && !readyLogged && resumed && resumed.then) {
          readyLogged = true;
          resumed.then(() => console.log("audio ready, AudioContext state:", audioCtx.state), () => {});
        }
      }
    } catch (e) {
      if (DEBUG) console.warn("Audio could not start:", e);
    }
  }

  // Older iPhones only unlock audio when a sound starts during the tap,
  // so start a silent one
  function playSilence() {
    const source = audioCtx.createBufferSource();
    source.buffer = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
    source.connect(audioCtx.destination);
    source.start(0);
  }

  // The shared end of the chain (see the top of this file)
  function buildOutput() {
    const limit = AUDIO.limiter;
    const limiter = audioCtx.createDynamicsCompressor();
    limiter.threshold.value = limit.threshold;
    limiter.knee.value = limit.knee;
    limiter.ratio.value = limit.ratio;
    limiter.attack.value = limit.attack;
    limiter.release.value = limit.release;
    limiter.connect(audioCtx.destination);

    mute = audioCtx.createGain();
    mute.gain.value = isEnabled() ? 1 : 0;
    mute.connect(limiter);

    // A gentle low-pass on all effects: no harsh highs on phone speakers
    const softener = audioCtx.createBiquadFilter();
    softener.type = "lowpass";
    softener.frequency.value = AUDIO.softenAbove;
    softener.Q.value = 0.5;
    softener.connect(mute);

    effectsBus = audioCtx.createGain();
    effectsBus.gain.value = AUDIO.effectsVolume;
    effectsBus.connect(softener);

    engineBus = audioCtx.createGain();
    engineBus.gain.value = ENGINE_VOLUME;
    engineBus.connect(mute);
  }

  function makeNoiseBuffer() {
    const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // ---------------------------------------------------------------
  // Sound files (SOUND_FILES in config.js): all fetched and decoded at
  // once, in the background, when audio starts. An effect plays one of
  // its files as soon as one has loaded, and the sound made in code
  // until then (or for good if its files fail to load). A system pause
  // stops the downloads (no network calls while paused); the resume
  // starts the ones that hadn't finished again.
  // ---------------------------------------------------------------
  // Every file to load: [effect name, or "engine" for the engine loop, file]
  function soundFileList() {
    const list = [];
    for (const [name, files] of Object.entries(SOUND_FILES.files)) {
      for (const file of files) list.push([name, file]);
    }
    if (SOUND_FILES.engineLoop) list.push(["engine", SOUND_FILES.engineLoop]);
    return list;
  }

  function loadFiles() {
    if (typeof fetch !== "function" || systemPaused) return;
    if (!filesStarted) filesStarted = performance.now();
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    fileAbort = controller;
    for (const [name, file] of soundFileList()) {
      if (fileState[file]) continue; // loading, loaded or failed for good
      fileState[file] = "loading";
      loadFile(file, name === "engine", controller).then((result) => {
        if (result === "stopped") {
          delete fileState[file]; // a pause stopped it: load it again on the resume
          return;
        }
        fileState[file] = "done";
        if (result && name === "engine") engineLoop = result;
        else if (result) (fileBuffers[name] = fileBuffers[name] || []).push(result);
        if (DEBUG) logFilesLoaded();
      });
    }
  }

  // Stop the downloads running now (the app was hidden)
  function stopFileLoads() {
    if (fileAbort) fileAbort.abort();
    fileAbort = null;
  }

  // DEBUG: once every file is done, how many loaded and how long it took
  function logFilesLoaded() {
    const list = soundFileList();
    if (!list.every(([, file]) => fileState[file] === "done")) return;
    const loaded = list.filter(([name]) => (name === "engine" ? engineLoop : fileBuffers[name])).length;
    const seconds = ((performance.now() - filesStarted) / 1000).toFixed(2);
    console.log(`[Sound] files loaded: ${loaded} of ${list.length} in ${seconds} s`);
  }

  // Fetch and decode one file: the decoded sound, null if it failed, or
  // "stopped" if a pause stopped the download. A missing engine loop
  // ("optional") is fine: the engine made in code plays, so it doesn't
  // warn.
  function loadFile(file, optional, controller) {
    return fetch(SOUND_FILES.folder + file, controller ? { signal: controller.signal } : undefined)
      .then((response) => {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.arrayBuffer();
      })
      .then(decode)
      .catch((error) => {
        if (controller && controller.signal.aborted) return "stopped";
        if (DEBUG && !optional) console.warn("Sound file not loaded:", file, error);
        else if (DEBUG) console.log("[Sound] no " + file + ", using the engine made in code");
        return null;
      });
  }

  // decodeAudioData returns a promise in newer browsers; older Safari
  // only calls back
  function decode(data) {
    return new Promise((resolve, reject) => {
      const result = audioCtx.decodeAudioData(data, resolve, reject);
      if (result && result.then) result.then(resolve, reject);
    });
  }

  // One of the effect's loaded files at random, never the one it played
  // last time (when it has more than one). Null while none has loaded.
  function pickFile(name) {
    const files = fileBuffers[name];
    if (!files) return null;
    const choices = files.length > 1 ? files.filter((file) => file !== lastFile[name]) : files;
    const file = choices[Math.floor(Math.random() * choices.length)];
    lastFile[name] = file;
    return file;
  }

  // Play a decoded file into "out" at time "t", a little faster or slower
  // each time (SOUND_FILES.pitchVariation). Returns how long it lasts.
  function playFile(buffer, out, t) {
    const rate = 1 + (Math.random() * 2 - 1) * SOUND_FILES.pitchVariation;
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.connect(out);
    source.start(t);
    return buffer.duration / rate;
  }

  // ---------------------------------------------------------------
  // Building blocks. "out" is where the sound goes, "t" is when it
  // starts (in AudioContext time). Every part has a short attack and
  // fades out to silence, so nothing clicks.
  // ---------------------------------------------------------------

  // Volume shape: silent at t, up to "peak" in "attack" seconds, then a
  // natural (exponential) fade to silence over "decay" seconds
  function envelope(param, t, peak, attack, decay) {
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(peak, t + attack);
    param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  // A low-pass filter in front of "out": the sound's parts go into it
  // (loud sounds use it to stay soft on small speakers)
  function lowpass(out, frequency) {
    const filter = out.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = frequency;
    filter.connect(out);
    return filter;
  }

  // An oscillator: wave "type" sliding from "from" to "to" Hz over the
  // whole sound
  function tone(out, t, { type = "sine", from, to = from, attack = 0.004, decay, volume = 1 }) {
    const ac = out.context;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
    envelope(gain.gain, t, volume, attack, decay);
    osc.connect(gain);
    gain.connect(out);
    osc.start(t);
    osc.stop(t + attack + decay + 0.02);
  }

  // Noise through a filter: "lowpass" = thud / rumble, "bandpass" =
  // crack or hiss around one pitch. The filter can slide from "from" to
  // "to" Hz (a falling low-pass makes a boom get duller as it fades).
  function noise(out, t, { filter = "lowpass", from, to = from, q = 0.7, attack = 0.002, decay, volume = 1 }) {
    const ac = out.context;
    const source = ac.createBufferSource();
    const shaper = ac.createBiquadFilter();
    const gain = ac.createGain();
    source.buffer = noiseBuffer;
    source.loop = true;
    shaper.type = filter;
    shaper.Q.value = q;
    shaper.frequency.setValueAtTime(from, t);
    if (to !== from) shaper.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
    envelope(gain.gain, t, volume, attack, decay);
    source.connect(shaper);
    shaper.connect(gain);
    gain.connect(out);
    source.start(t, Math.random() * 0.9); // a different stretch of noise each time
    source.stop(t + attack + decay + 0.02);
  }

  // A held note for music: a quick attack, a slight fall in volume while
  // it holds for "length" seconds, then a short release (a melody that
  // sings rather than plucks). "wave" is an oscillator type.
  function heldNote(out, t, { wave = "square", f, length, volume = 1, attack = 0.005 }) {
    const ac = out.context;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(f, t);
    const release = Math.min(0.04, length / 3);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + attack);
    gain.gain.linearRampToValueAtTime(volume * 0.75, t + length - release);
    gain.gain.linearRampToValueAtTime(0, t + length);
    osc.connect(gain);
    gain.connect(out);
    osc.start(t);
    osc.stop(t + length + 0.02);
  }

  // Play a list of notes: [step, Hz, length in steps], "step" seconds
  // per step, each note held for most of its length
  function melody(out, t, step, notes, options) {
    for (const [at, f, steps] of notes) {
      heldNote(out, t + at * step, { ...options, f, length: steps * step * 0.85 });
    }
  }

  // ---------------------------------------------------------------
  // The sounds. Each one builds itself and returns how long it lasts
  // (in seconds), so we know when it's finished. "p" is a small random
  // pitch change (1 = none), "variant" an optional extra (powerUp).
  // ---------------------------------------------------------------
  const SOUNDS = {
    // A punchy thump: a falling square body, a low sine for weight and
    // a short noise burst, all through a low-pass
    playerShot(out, t, p) {
      const soft = lowpass(out, 2600);
      tone(soft, t, { type: "square", from: 330 * p, to: 85 * p, decay: 0.09, volume: 0.35 });
      tone(soft, t, { type: "sine", from: 170 * p, to: 50 * p, decay: 0.13, volume: 0.6 });
      noise(soft, t, { filter: "bandpass", from: 2200, to: 700, q: 0.8, decay: 0.045, volume: 1 });
      return 0.15;
    },
    // Like the player's shot, but higher, shorter and softer
    enemyShot(out, t, p) {
      const soft = lowpass(out, 3000);
      tone(soft, t, { type: "square", from: 460 * p, to: 140 * p, decay: 0.07, volume: 0.35 });
      tone(soft, t, { type: "sine", from: 240 * p, to: 85 * p, decay: 0.09, volume: 0.8 });
      noise(soft, t, { filter: "bandpass", from: 2900, to: 1100, q: 0.9, decay: 0.03, volume: 0.9 });
      return 0.11;
    },
    // A dry crack, a few crumbles after it and a little knock
    brickHit(out, t, p) {
      noise(out, t, { filter: "bandpass", from: 1700 * p, to: 900 * p, q: 1.2, decay: 0.06, volume: 1 });
      noise(out, t + 0.02, { filter: "bandpass", from: 1100 * p, q: 1.5, decay: 0.05, volume: 0.55 });
      noise(out, t + 0.045, { filter: "bandpass", from: 1400 * p, q: 1.5, decay: 0.04, volume: 0.35 });
      tone(out, t, { type: "triangle", from: 300 * p, to: 170 * p, decay: 0.05, volume: 0.6 });
      return 0.1;
    },
    // The hit that breaks a brick: only its file (brick_destroy.wav)
    // sounds different, made in code it's the brick hit
    brickDestroy(out, t, p) {
      return SOUNDS.brickHit(out, t, p);
    },
    // Heavier and duller than brick: a low thud and some grit
    concreteHit(out, t, p) {
      noise(out, t, { filter: "lowpass", from: 1200 * p, to: 250, decay: 0.09, volume: 1 });
      tone(out, t, { type: "triangle", from: 200 * p, to: 85 * p, decay: 0.1, volume: 0.9 });
      noise(out, t + 0.015, { filter: "bandpass", from: 700 * p, q: 1.2, decay: 0.06, volume: 0.45 });
      return 0.13;
    },
    // A bright "ting": three high partials that are not in tune with
    // each other (that's what makes it metal, not a note), fast decay
    metalHit(out, t, p) {
      const f = 1350 * p;
      tone(out, t, { type: "sine", from: f, attack: 0.002, decay: 0.16, volume: 0.6 });
      tone(out, t, { type: "sine", from: f * 1.59, attack: 0.002, decay: 0.11, volume: 0.4 });
      tone(out, t, { type: "sine", from: f * 2.37, attack: 0.002, decay: 0.06, volume: 0.25 });
      noise(out, t, { filter: "bandpass", from: 3000, q: 1, decay: 0.012, volume: 0.5 });
      return 0.18;
    },
    // A heavy tank took a hit and survived: a short, lower metal clank
    // with a thud of the hull under it
    heavyHit(out, t, p) {
      const f = 520 * p;
      tone(out, t, { type: "triangle", from: f, to: f * 0.94, decay: 0.09, volume: 0.6 });
      tone(out, t, { type: "triangle", from: f * 1.83, decay: 0.06, volume: 0.35 });
      tone(out, t, { type: "sine", from: f * 2.71, decay: 0.04, volume: 0.25 });
      noise(out, t, { filter: "bandpass", from: 1800, q: 1.4, decay: 0.035, volume: 0.6 });
      tone(out, t, { type: "sine", from: 180 * p, to: 110 * p, decay: 0.07, volume: 0.6 });
      return 0.12;
    },
    // A tank blows up: a low boom, a punch that small speakers can play,
    // a crack, and a noise tail whose low-pass falls as it fades
    explosion(out, t, p) {
      const soft = lowpass(out, 2400);
      tone(soft, t, { type: "sine", from: 120 * p, to: 38 * p, decay: 0.42, volume: 1 });
      tone(soft, t, { type: "triangle", from: 220 * p, to: 60 * p, decay: 0.2, volume: 0.6 });
      noise(soft, t, { filter: "lowpass", from: 2400 * p, to: 120, decay: 0.5, volume: 1 });
      noise(soft, t, { filter: "bandpass", from: 1200, q: 0.8, decay: 0.05, volume: 0.6 });
      return 0.55;
    },
    // The base: a longer, deeper explosion with a second rumble and a
    // falling tone under it
    baseDestroyed(out, t) {
      const soft = lowpass(out, 2000);
      tone(soft, t, { type: "sine", from: 95, to: 28, decay: 1.1, volume: 1 });
      tone(soft, t, { type: "sawtooth", from: 260, to: 55, attack: 0.02, decay: 1.1, volume: 0.3 });
      noise(soft, t, { filter: "lowpass", from: 1800, to: 70, decay: 1.15, volume: 1 });
      noise(soft, t + 0.18, { filter: "lowpass", from: 900, to: 60, decay: 0.9, volume: 0.7 });
      noise(soft, t, { filter: "bandpass", from: 1000, q: 0.7, decay: 0.08, volume: 0.7 });
      return 1.2;
    },
    // Two quick rising bright notes, each with a soft octave on top
    coin(out, t, p) {
      tone(out, t, { type: "triangle", from: 988 * p, decay: 0.07, volume: 0.8 });
      tone(out, t, { type: "sine", from: 1976 * p, decay: 0.05, volume: 0.25 });
      tone(out, t + 0.06, { type: "triangle", from: 1319 * p, decay: 0.16, volume: 0.8 });
      tone(out, t + 0.06, { type: "sine", from: 2637 * p, decay: 0.1, volume: 0.25 });
      return 0.24;
    },
    // A rising three-note arpeggio; the last note depends on the type
    powerUp(out, t, p, variant) {
      const lastNote = { repair: 784, shield: 1047, fortify: 880, clock: 988 }[variant] || 784;
      const soft = lowpass(out, 3200);
      [523, 659, lastNote].forEach((f, i) => {
        const decay = i === 2 ? 0.3 : 0.08;
        tone(soft, t + i * 0.075, { type: "triangle", from: f, decay, volume: 0.8 });
        tone(soft, t + i * 0.075, { type: "square", from: f, decay, volume: 0.15 });
      });
      return 0.5;
    },
    // Armor breaks: a glassy crack, a few high splinters and a falling tone
    armorBreak(out, t) {
      noise(out, t, { filter: "bandpass", from: 3200, to: 1800, q: 1.2, decay: 0.12, volume: 0.8 });
      tone(out, t, { type: "sine", from: 2300, decay: 0.09, volume: 0.35 });
      tone(out, t + 0.03, { type: "sine", from: 3100, decay: 0.07, volume: 0.25 });
      tone(out, t + 0.07, { type: "sine", from: 2650, decay: 0.06, volume: 0.2 });
      tone(out, t, { type: "triangle", from: 1200, to: 200, decay: 0.38, volume: 0.6 });
      return 0.42;
    },
    // "Cha-ching": a short "cha" of noise with a note, then a higher
    // ringing note with a little sparkle
    purchase(out, t) {
      const soft = lowpass(out, 4000);
      noise(soft, t, { filter: "bandpass", from: 2200, q: 1, decay: 0.035, volume: 0.5 });
      tone(soft, t, { type: "square", from: 1047, decay: 0.07, volume: 0.3 });
      tone(soft, t + 0.08, { type: "square", from: 1568, decay: 0.28, volume: 0.3 });
      tone(soft, t + 0.08, { type: "triangle", from: 2093, decay: 0.2, volume: 0.3 });
      noise(soft, t + 0.08, { filter: "bandpass", from: 3800, q: 2, decay: 0.18, volume: 0.35 });
      return 0.4;
    },
    // A soft low double buzz (two waves slightly apart, low-passed)
    cantAfford(out, t) {
      const soft = lowpass(out, 700);
      for (const start of [t, t + 0.14]) {
        tone(soft, start, { type: "square", from: 150, to: 135, attack: 0.01, decay: 0.09, volume: 0.6 });
        tone(soft, start, { type: "sawtooth", from: 155, to: 139, attack: 0.01, decay: 0.09, volume: 0.4 });
      }
      return 0.26;
    },
    // A short cheerful jingle: C-E-G-C, the last note longer with a
    // little chord under it
    levelComplete(out, t) {
      const soft = lowpass(out, 3000);
      [523, 659, 784, 1047].forEach((f, i) => {
        const decay = i === 3 ? 0.45 : 0.1;
        tone(soft, t + i * 0.11, { type: "square", from: f, attack: 0.006, decay, volume: 0.3 });
        tone(soft, t + i * 0.11, { type: "triangle", from: f / 2, attack: 0.006, decay, volume: 0.6 });
      });
      tone(soft, t + 0.33, { type: "triangle", from: 659, decay: 0.45, volume: 0.3 });
      tone(soft, t + 0.33, { type: "triangle", from: 784, decay: 0.45, volume: 0.3 });
      return 0.85;
    },
    // A short heroic tune when a level starts (the "LEVEL X" intro): a
    // broad A - D (d) F# E - high A in D major, warm brass-like layers
    // over a D bass, a boom and a crash on the top note. The last note
    // ends at about 1.33 s, before play starts (LEVEL_INTRO_TIME).
    levelStart(out, t) {
      const step = 0.121; // seconds per step
      const soft = lowpass(out, 3500);
      const warm = lowpass(soft, 2400);
      // Melody: [step, Hz, length in steps], with an octave below it
      const line = [[0, 440, 1], [1, 587, 1.5], [2.5, 587, 0.5], [3, 740, 1], [4, 659, 1], [5, 880, 7]];
      melody(warm, t, step, line, { wave: "square", volume: 0.22, attack: 0.012 });
      melody(warm, t, step, line.map(([at, f, s]) => [at, f / 2, s]), { wave: "triangle", volume: 0.5, attack: 0.012 });
      // F# and D under the top note (D major)
      melody(warm, t, step, [[5, 740, 7], [5, 587, 7]], { wave: "triangle", volume: 0.3, attack: 0.02 });
      // Bass
      melody(warm, t, step, [[0, 147, 1], [1, 147, 2], [3, 110, 1], [4, 110, 1], [5, 147, 7]],
             { wave: "triangle", volume: 0.8 });
      // Drums: snare taps, then a boom and a crash on the top note
      for (const at of [0, 2.5, 4, 4.5]) {
        noise(soft, t + at * step, { filter: "bandpass", from: 2000, q: 0.7, decay: 0.06, volume: 0.5 });
      }
      tone(soft, t + 5 * step, { type: "sine", from: 110, to: 45, decay: 0.45, volume: 0.9 });
      noise(soft, t + 5 * step, { filter: "highpass", from: 4500, decay: 0.5, volume: 0.3 });
      return 1.4;
    },
    // A slow, sad descending phrase (G - E flat - C), the last note
    // sagging a little
    gameOver(out, t) {
      const soft = lowpass(out, 1400);
      [392, 311, 262].forEach((f, i) => {
        const last = i === 2;
        const options = { from: f, to: last ? f * 0.94 : f, attack: 0.01, decay: last ? 0.9 : 0.3 };
        tone(soft, t + i * 0.34, { ...options, type: "triangle", volume: 0.8 });
        tone(soft, t + i * 0.34, { ...options, type: "sawtooth", from: f / 2, to: options.to / 2, volume: 0.25 });
      });
      return 1.6;
    },
    // A short soft click
    uiTap(out, t) {
      tone(out, t, { type: "sine", from: 1100, to: 700, attack: 0.002, decay: 0.03, volume: 0.8 });
      noise(out, t, { filter: "bandpass", from: 2500, q: 1, decay: 0.008, volume: 0.3 });
      return 0.05;
    },
  };

  // Sounds heard over and over: each time a little different in pitch
  // and volume (AUDIO.pitchVariation / volumeVariation; a file's pitch
  // varies by SOUND_FILES.pitchVariation, whichever sound it is)
  const VARIED = new Set(["playerShot", "enemyShot", "brickHit", "brickDestroy", "concreteHit",
                          "metalHit", "heavyHit", "explosion", "coin"]);

  // ---------------------------------------------------------------
  // The player's engine: a quiet low rumble while the tank drives.
  //   sawtooth + square (a few cents apart) + a little noise
  //     -> low-pass -> "chug" (volume wobbled by a slow LFO)
  //     -> on/off fade -> engine volume
  // The nodes are made once and keep running; only the on/off volume,
  // the pitch and the chug speed change, which costs almost nothing.
  // ---------------------------------------------------------------
  function buildEngine(out) {
    const ac = out.context;
    const look = ENGINE_SOUND;

    const fade = ac.createGain(); // 0 = off, 1 = on
    fade.gain.value = 0;
    fade.connect(out);

    const chug = ac.createGain(); // between 1 - 2 x chugDepth and 1
    chug.gain.value = 1 - look.chugDepth;
    chug.connect(fade);

    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = look.filter;
    filter.Q.value = 1;
    filter.connect(chug);

    const saw = ac.createOscillator();
    saw.type = "sawtooth";
    saw.frequency.value = look.pitch;
    saw.connect(filter);

    const square = ac.createOscillator();
    square.type = "square";
    square.frequency.value = look.pitch;
    square.detune.value = look.detune; // slightly apart: a slow, rough beat
    const squareVolume = ac.createGain();
    squareVolume.gain.value = 0.5;
    square.connect(squareVolume);
    squareVolume.connect(filter);

    const rumble = ac.createBufferSource();
    rumble.buffer = noiseBuffer;
    rumble.loop = true;
    const rumbleVolume = ac.createGain();
    rumbleVolume.gain.value = look.noise;
    rumble.connect(rumbleVolume);
    rumbleVolume.connect(filter);

    const lfo = ac.createOscillator();
    lfo.frequency.value = look.chugRate;
    const lfoDepth = ac.createGain();
    lfoDepth.gain.value = look.chugDepth;
    lfo.connect(lfoDepth);
    lfoDepth.connect(chug.gain);

    const sources = [saw, square, rumble, lfo];
    for (const source of sources) source.start();
    return { fade, saw, square, lfo, sources, fromFile: false, on: false, pitch: 1 };
  }

  // The engine from the file (SOUND_FILES.engineLoop): the file looping
  // seamlessly -> its volume -> on/off fade -> engine volume. Its pitch
  // changes with the playback speed.
  function buildFileEngine(out) {
    const ac = out.context;
    const fade = ac.createGain(); // 0 = off, 1 = on
    fade.gain.value = 0;
    fade.connect(out);

    const volume = ac.createGain();
    volume.gain.value = SOUND_FILES.volumes.engine ?? 1;
    volume.connect(fade);

    const loop = ac.createBufferSource();
    loop.buffer = engineLoop;
    loop.loop = true;
    loop.connect(volume);
    loop.start();
    return { fade, loop, sources: [loop], fromFile: true, on: false, pitch: 1 };
  }

  // Fade an engine out and stop it once it's silent
  function retireEngine(old) {
    glide(old.fade.gain, 0, ENGINE_SOUND.fadeOut / 3);
    const end = audioCtx.currentTime + ENGINE_SOUND.fadeOut * 2;
    for (const source of old.sources) source.stop(end);
  }

  // Called every frame by tanks.js: "driving" says whether the player's
  // tank is driving right now, "pitch" how high the engine sounds
  // (1 = normal, see enginePitch() in tanks.js). The engine fades in /
  // out only when that changes, so this costs nothing most frames.
  function setEngine(driving, pitch) {
    if (!audioCtx || !engineBus) return;
    const on = driving && isEnabled() && engineSettingOn() && !systemPaused;
    try {
      // The engine file loaded after the engine made in code was built:
      // that one fades out and stops, the file takes over
      if (engine && engineLoop && !engine.fromFile) {
        retireEngine(engine);
        engine = null;
      }
      if (on && !engine) engine = engineLoop ? buildFileEngine(engineBus) : buildEngine(engineBus);
      if (!engine) return;
      if (on !== engine.on) {
        engine.on = on;
        const seconds = on ? ENGINE_SOUND.fadeIn : ENGINE_SOUND.fadeOut;
        glide(engine.fade.gain, on ? 1 : 0, seconds / 3);
      }
      if (pitch && Math.abs(pitch - engine.pitch) > 0.001) {
        engine.pitch = pitch;
        if (engine.fromFile) {
          glide(engine.loop.playbackRate, pitch, 0.06);
        } else {
          glide(engine.saw.frequency, ENGINE_SOUND.pitch * pitch, 0.06);
          glide(engine.square.frequency, ENGINE_SOUND.pitch * pitch, 0.06);
          glide(engine.lfo.frequency, ENGINE_SOUND.chugRate * pitch, 0.06);
        }
      }
    } catch (e) {
      if (DEBUG) console.warn(e);
    }
  }

  // Forget the sounds that have ended (by AudioContext time, which stops
  // while the app is hidden; no timers)
  function forgetEnded() {
    const now = audioCtx.currentTime;
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].end <= now) {
        active[i].out.disconnect();
        active.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------
  // Play a sound by name. Does nothing if sound is off (the SOUND setting,
  // an ad, or the SOUND EFFECTS setting), audio hasn't started yet,
  // AUDIO.maxSounds are already playing, or the same sound started less
  // than AUDIO.repeatGap seconds ago.
  // ---------------------------------------------------------------
  function play(name, delay = 0, variant) {
    // (A "suspended" context is fine: on the very first tap resume() is
    // still starting, and the sound plays as soon as it's running.)
    if (!audioCtx || audioCtx.state === "closed" || !isEnabled() || !effectsSettingOn()) return;
    forgetEnded();
    if (active.length >= AUDIO.maxSounds) return;
    const build = SOUNDS[name];
    if (!build) {
      if (DEBUG) console.warn("Unknown sound:", name);
      return;
    }
    // The same sound twice at (almost) the same moment, e.g. one bullet
    // hitting two bricks, would only be louder: play it once
    const start = audioCtx.currentTime + delay;
    if (Math.abs(start - (lastStart[name] ?? -1)) < AUDIO.repeatGap) return;
    lastStart[name] = start;

    try {
      const vary = VARIED.has(name);
      const pitch = vary ? 1 + (Math.random() * 2 - 1) * AUDIO.pitchVariation : 1;
      const loudness = vary ? 1 + (Math.random() * 2 - 1) * AUDIO.volumeVariation : 1;

      // Each sound gets its own volume knob (from config.js): the file's
      // volume if one of its files has loaded, else the made-in-code one
      const out = audioCtx.createGain();
      out.connect(effectsBus);
      const file = pickFile(name);
      let length;
      if (file) {
        out.gain.value = (SOUND_FILES.volumes[name] ?? 1) * loudness;
        length = playFile(file, out, start);
      } else {
        out.gain.value = (AUDIO.volumes[name] ?? 0.2) * loudness;
        length = build(out, start, pitch, variant);
      }

      active.push({ end: start + length + 0.05, out });
    } catch (e) {
      if (DEBUG) console.warn(e);
    }
  }

  // The app was hidden / shows again: stop / restart audio and the
  // sound files' downloads. The engine goes silent right away and comes
  // back only when tanks.js says the player is driving again.
  function setSystemPaused(paused) {
    systemPaused = paused;
    if (!audioCtx) return;
    try {
      if (paused) {
        stopFileLoads();
        if (engine) {
          engine.on = false;
          engine.fade.gain.cancelScheduledValues(audioCtx.currentTime);
          engine.fade.gain.setValueAtTime(0, audioCtx.currentTime);
        }
        quietly(audioCtx.suspend());
      } else {
        quietly(audioCtx.resume());
        loadFiles(); // the files a pause stopped
      }
    } catch (e) { /* fine */ }
  }

  // DEBUG (temporary): a loud beep straight to the speakers, past the
  // game's settings and the sound limit - to check the browser can make
  // sound. Never while the SOUND setting is off (or an ad plays).
  function testBeep() {
    if (!audioCtx) return;
    console.log("Test beep. AudioContext state:", audioCtx.state,
                "| sound effects setting:", effectsSettingOn(),
                "| sound setting:", soundSettingOn());
    if (!isEnabled()) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(AUDIO.testBeepVolume, t);
    gain.gain.setValueAtTime(AUDIO.testBeepVolume, t + 0.3);
    gain.gain.linearRampToValueAtTime(0, t + 0.35);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  // ---------------------------------------------------------------
  // Set-up
  // ---------------------------------------------------------------
  // Any input on the page starts audio. "capture" means we see the
  // event before the game does. On phones only the END of a touch
  // (touchend / pointerup / click) counts as permission to play sound,
  // so those are listened to as well; with only touchstart the first
  // tap stayed silent.
  for (const type of ["pointerdown", "pointerup", "touchstart", "touchend", "click", "keydown"]) {
    document.addEventListener(type, unlock, { capture: true, passive: true });
  }

  // DEBUG (only when DEBUG is true in config.js): T = test beep
  document.addEventListener("keydown", (event) => {
    if (DEBUG && event.code === "KeyT" && !event.repeat) testBeep();
  });

  return { play, setEngine, refreshMute, setSystemPaused, setAdPlaying, isEnabled };
})();
