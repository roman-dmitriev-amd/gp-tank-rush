// =====================================================================
//  Music - two chiptune loops made in code: "menu" and "battle"
//
//  Each tune is written below as data (chords and a melody per bar).
//  The first time audio is on, each one is rendered once into a sound
//  buffer in the background (an OfflineAudioContext), and after that
//  playing it is one looping buffer: it costs almost nothing on a slow
//  phone. Nothing is downloaded and there are no music files.
//
//  updateMusic() runs every frame (game.js) and picks the tune for the
//  current screen (MUSIC.states in config.js). Music is silent:
//    - before the first tap (audio can't start earlier, audio.js)
//    - while the game is paused: the pause menu, a rewarded ad, the app
//      hidden. It goes on from the same place afterwards.
//    - with the MUSIC or the SOUND setting off
//  It plays through audio.js's mute and limiter (Sound.musicBus()).
//  Volume and speeds are in MUSIC (config.js).
// =====================================================================

// ---------------------------------------------------------------------
// The tunes. Time is counted in eighth notes, 8 to a bar.
//   chords  one per bar: a note name, with "m" for minor ("Dm", "Bb")
//   lead    one string per bar: "note:length" in eighths, "-" is a rest
//   bass    [eighth, chord note (0 root, 2 fifth), length] per bar
//   arp     chord notes played one after another, 0 root, 1 third,
//           2 fifth, 3 the root an octave up; "arpStep" eighths each
//   kick / snare / hat  the eighths they hit on
//   fill    bars (counted from 1) that end in a short snare roll
// ---------------------------------------------------------------------
const TUNES = {
  // Calm and proud, in D major: the title screen and the shop
  menu: {
    chords: ["D", "A", "Bm", "G", "D", "A", "G", "A"],
    lead: [
      "F#4:2 A4:2 D5:4",
      "E5:3 C#5:1 A4:4",
      "B4:2 D5:2 F#5:4",
      "G5:3 F#5:1 D5:4",
      "F#5:2 A5:2 D5:2 F#5:2",
      "E5:2 A5:2 C#5:2 E5:2",
      "D5:2 B4:2 G4:2 B4:2",
      "A4:2 C#5:2 E5:3 -:1",
    ],
    leadWave: "triangle",
    bass: [[0, 0, 4], [4, 2, 2], [6, 0, 2]],
    arp: [0, 1, 2, 1, 3, 1, 2, 1],
    arpStep: 1,
    kick: [0],
    snare: [4],
    hat: [2, 6],
    fill: [],
  },

  // A march in D minor: during a level
  battle: {
    chords: ["Dm", "Dm", "Bb", "C", "Dm", "Dm", "Bb", "A",
             "F", "C", "Dm", "Bb", "Gm", "A", "Dm", "A"],
    lead: [
      "D5:3 F5:1 A5:2 F5:2",
      "E5:1 F5:1 E5:1 D5:1 A4:4",
      "Bb4:3 D5:1 F5:2 D5:2",
      "E5:1 G5:1 E5:1 C5:1 E5:4",
      "D5:3 F5:1 A5:2 D6:2",
      "C6:1 A5:1 F5:1 A5:1 D5:4",
      "Bb4:2 D5:2 F5:2 Bb5:2",
      "A5:2 G5:1 E5:1 C#5:4",
      "F5:2 A5:2 C6:3 A5:1",
      "G5:2 E5:2 C5:3 E5:1",
      "F5:2 D5:2 A4:2 D5:2",
      "F5:1 D5:1 Bb4:1 D5:1 F5:4",
      "G5:2 Bb5:2 D6:3 Bb5:1",
      "A5:2 E5:2 C#5:2 E5:2",
      "D5:1 E5:1 F5:1 G5:1 A5:2 D6:2",
      "C#6:2 A5:2 E5:2 -:2",
    ],
    leadWave: "square",
    bass: [[0, 0, 2], [2, 0, 1], [3, 0, 1], [4, 2, 2], [6, 0, 1], [7, 0, 1]],
    arp: [0, 1, 2, 3, 2, 1, 2, 1],
    arpStep: 0.5,
    kick: [0, 4],
    snare: [2, 6],
    hat: [0, 1, 2, 3, 4, 5, 6, 7],
    fill: [8, 16],
  },
};

const Music = (() => {
  const buffers = {};    // tune name -> its rendered sound buffer
  const rendering = {};  // tune name -> true while it is being rendered (or failed)
  const places = {};     // tune name -> seconds into the loop to go on from
  let current = null;    // what plays now: { name, source, gain, startedAt }

  // --- Notes ---------------------------------------------------------
  const SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  // "F#4" or "Bb3" -> Hz
  function pitch(name) {
    let n = SEMITONES[name[0]];
    let i = 1;
    if (name[i] === "#") { n += 1; i += 1; }
    if (name[i] === "b") { n -= 1; i += 1; }
    const octave = Number(name.slice(i));
    return 440 * Math.pow(2, (12 * (octave + 1) + n - 69) / 12);
  }

  // A chord's notes in Hz from its root at "octave": root, third, fifth
  // and the root an octave up. Chords from A upward start an octave
  // lower, so every bar stays in about the same range.
  function chordNotes(chord, octave) {
    const minor = chord.endsWith("m");
    const root = minor ? chord.slice(0, -1) : chord;
    const low = root[0] === "A" || root[0] === "B" ? octave - 1 : octave;
    const base = pitch(root + low);
    return [0, minor ? 3 : 4, 7, 12].map((steps) => base * Math.pow(2, steps / 12));
  }

  // --- Instruments (all in the offline context "ac") -----------------
  // A held note: quick attack, a slight fall while it holds, short release
  function note(ac, out, t, wave, f, length, volume) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const release = Math.min(0.04, length / 3);
    osc.type = wave;
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.006);
    gain.gain.linearRampToValueAtTime(volume * 0.7, t + length - release);
    gain.gain.linearRampToValueAtTime(0, t + length);
    osc.connect(gain);
    gain.connect(out);
    osc.start(t);
    osc.stop(t + length + 0.01);
  }

  // A burst of noise through a filter (snare and hi-hat)
  function hiss(ac, out, noiseBuffer, t, type, frequency, decay, volume) {
    const source = ac.createBufferSource();
    const filter = ac.createBiquadFilter();
    const gain = ac.createGain();
    source.buffer = noiseBuffer;
    filter.type = type;
    filter.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    source.start(t, (t * 7.3) % 0.4); // a different stretch of noise each time
    source.stop(t + decay + 0.01);
  }

  // A kick drum: a sine falling fast from a thump to a low hum
  function kick(ac, out, t, volume) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.09);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.connect(gain);
    gain.connect(out);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  // --- Writing a tune into an offline context ------------------------
  // Everything ends before the loop does, so it repeats without a click
  function writeTune(ac, tune, step) {
    const mix = MUSIC.mix;
    const out = ac.createGain();
    out.connect(ac.destination);

    // The lead and the bass go through a low-pass: softer, less buzz
    const soft = ac.createBiquadFilter();
    soft.type = "lowpass";
    soft.frequency.value = MUSIC.softenAbove;
    soft.connect(out);

    const noiseBuffer = ac.createBuffer(1, Math.round(ac.sampleRate * 0.5), ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    tune.chords.forEach((chord, bar) => {
      const start = bar * 8 * step;

      // Lead melody
      let at = 0;
      for (const part of tune.lead[bar].split(" ")) {
        const [name, eighths] = part.split(":");
        const length = Number(eighths);
        if (name !== "-") note(ac, soft, start + at * step, tune.leadWave, pitch(name), length * step * 0.9, mix.lead);
        at += length;
      }

      // Bass (a sawtooth, so small speakers still play its overtones)
      const low = chordNotes(chord, 3);
      for (const [eighth, which, length] of tune.bass) {
        note(ac, soft, start + eighth * step, "sawtooth", low[which], length * step * 0.8, mix.bass);
      }

      // Broken chord
      const high = chordNotes(chord, 4);
      const count = Math.round(8 / tune.arpStep);
      for (let i = 0; i < count; i++) {
        const which = tune.arp[i % tune.arp.length];
        note(ac, out, start + i * tune.arpStep * step, "triangle", high[which], tune.arpStep * step * 0.8, mix.arp);
      }

      // Drums; a bar with a fill ends in four fast snare hits
      const fill = tune.fill.includes(bar + 1);
      for (const eighth of tune.kick) kick(ac, out, start + eighth * step, mix.kick);
      for (const eighth of tune.snare) {
        if (fill && eighth >= 6) continue;
        hiss(ac, out, noiseBuffer, start + eighth * step, "bandpass", 1900, 0.11, mix.snare);
      }
      for (const eighth of tune.hat) {
        hiss(ac, out, noiseBuffer, start + eighth * step, "highpass", 6500, 0.03, eighth % 2 ? mix.hat : mix.hat * 0.6);
      }
      if (fill) {
        for (let i = 0; i < 4; i++) {
          hiss(ac, out, noiseBuffer, start + (6 + i * 0.5) * step, "bandpass", 1900, 0.07, mix.snare * (0.6 + i * 0.13));
        }
      }
    });
  }

  // Render a tune into a buffer, in the background, once
  function render(name) {
    if (buffers[name] || rendering[name]) return;
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Offline) return; // very old browser: no music
    rendering[name] = true;
    try {
      const tune = TUNES[name];
      const step = 60 / MUSIC.bpm[name] / 2; // seconds per eighth note
      const rate = MUSIC.sampleRate;
      const ac = new Offline(1, Math.round(tune.chords.length * 8 * step * rate), rate);
      writeTune(ac, tune, step);
      const done = (buffer) => {
        buffers[name] = buffer;
        rendering[name] = false;
      };
      ac.oncomplete = (event) => { if (!buffers[name]) done(event.renderedBuffer); };
      const result = ac.startRendering();
      if (result && result.then) result.then(done, () => {});
    } catch (e) {
      if (DEBUG) console.warn("Music could not be made:", e); // stays without music
    }
  }

  // --- Playing -------------------------------------------------------
  function settingOn() {
    return settings.music !== false;
  }

  // Stop what plays. "keepPlace": remember where it was, so play() goes
  // on from there (a pause); otherwise every tune starts over next time.
  function halt(keepPlace) {
    if (!keepPlace) for (const name of Object.keys(places)) delete places[name];
    if (!current) return;
    const { name, source, gain, startedAt } = current;
    current = null;
    try {
      const ac = gain.context;
      const t = ac.currentTime;
      if (keepPlace) places[name] = (t - startedAt) % buffers[name].duration;
      if (ac.state !== "running" || isSystemPaused()) {
        source.stop(); // audio is stopping (the app is hidden): no fade to wait for
      } else {
        gain.gain.cancelScheduledValues(t);
        gain.gain.setTargetAtTime(0, t, MUSIC.fadeOut / 3);
        source.stop(t + MUSIC.fadeOut * 2);
      }
    } catch (e) { /* already stopped */ }
  }

  // Play the tune "name" (does nothing if it plays already). Silent
  // until audio is on, the tune is rendered and the settings allow it.
  function play(name) {
    const bus = Sound.musicBus();
    if (!bus) return; // no tap yet
    for (const tune of Object.keys(TUNES)) render(tune);
    if (!settingOn() || !Sound.isEnabled()) {
      halt(true);
      return;
    }
    if (current && current.name === name) return;
    const buffer = buffers[name];
    const place = places[name] || 0;
    if (current) halt(false);
    if (!buffer) return; // still being rendered
    try {
      const ac = bus.context;
      const t = ac.currentTime;
      const source = ac.createBufferSource();
      const gain = ac.createGain();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.setValueAtTime(0, t);
      gain.gain.setTargetAtTime(1, t, MUSIC.fadeIn / 3);
      source.connect(gain);
      gain.connect(bus);
      source.start(t, place % buffer.duration);
      current = { name, source, gain, startedAt: t - place };
    } catch (e) {
      if (DEBUG) console.warn(e);
    }
  }

  return {
    play,
    pause: () => halt(true),
    stop: () => halt(false),
    playing: () => (current ? current.name : null), // for testing
  };
})();

// Called every frame (game.js), and once when the app is hidden: the
// tune for the current screen, or silence
function updateMusic() {
  if (isPaused()) {
    Music.pause();
    return;
  }
  const name = MUSIC.states[gameState];
  if (name) Music.play(name);
  else Music.stop();
}
