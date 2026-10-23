import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

const MusicContext = createContext(null);

export function MusicProvider({ children }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [showPrompt, setShowPrompt] = useState(true);

  // Audio nodes and synthesis refs
  const audioCtxRef = useRef(null);
  const masterGainRef = useRef(null);
  const analyserRef = useRef(null);
  const sequencerIntervalRef = useRef(null);
  const stepRef = useRef(0);

  // Optional HTML5 audio element for external streams
  const audioElementRef = useRef(null);
  const [useCustomAudio, setUseCustomAudio] = useState(false);

  // Hedwig's Theme Melody Notes (frequencies in Hz)
  // B4, E5, G5, F#5, E5, B5, A5, F#5, E5, G5, F#5, D#5, F5, B4
  const melodyNotes = [
    { note: 493.88, dur: 0.5 },  // B4
    { note: 659.25, dur: 0.75 }, // E5
    { note: 783.99, dur: 0.25 }, // G5
    { note: 739.99, dur: 0.5 },  // F#5
    { note: 659.25, dur: 0.8 },  // E5
    { note: 987.77, dur: 0.4 },  // B5
    { note: 880.00, dur: 1.0 },  // A5
    { note: 0, dur: 0.2 },       // Rest
    { note: 739.99, dur: 0.8 },  // F#5
    { note: 659.25, dur: 0.75 }, // E5
    { note: 783.99, dur: 0.25 }, // G5
    { note: 739.99, dur: 0.5 },  // F#5
    { note: 622.25, dur: 0.8 },  // D#5
    { note: 698.46, dur: 0.5 },  // F5
    { note: 493.88, dur: 1.0 },  // B4
    { note: 0, dur: 0.4 },       // Rest

    // Part 2 of Theme
    { note: 493.88, dur: 0.5 },  // B4
    { note: 659.25, dur: 0.75 }, // E5
    { note: 783.99, dur: 0.25 }, // G5
    { note: 739.99, dur: 0.5 },  // F#5
    { note: 659.25, dur: 0.8 },  // E5
    { note: 987.77, dur: 0.4 },  // B5
    { note: 1174.66, dur: 0.8 }, // D6
    { note: 1108.73, dur: 0.5 }, // C#6
    { note: 1046.50, dur: 0.8 }, // C6
    { note: 830.61, dur: 0.8 },  // G#5
    { note: 1046.50, dur: 0.5 }, // C6
    { note: 987.77, dur: 0.4 },  // B5
    { note: 932.33, dur: 0.5 },  // A#5
    { note: 466.16, dur: 0.8 },  // A#4
    { note: 783.99, dur: 0.6 },  // G5
    { note: 659.25, dur: 1.2 },  // E5
    { note: 0, dur: 0.5 }        // Rest
  ];

  // Initialize Web Audio Engine
  const initAudioEngine = () => {
    if (!audioCtxRef.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;

      // Master Gain
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(isMuted ? 0 : volume, ctx.currentTime);
      masterGainRef.current = masterGain;

      // Analyser for visualizer
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      masterGain.connect(analyser);
      analyser.connect(ctx.destination);
    }

    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  // Play a synthesized 808 Trap Sub-Bass kick
  const play808Bass = (freq = 55) => {
    if (!audioCtxRef.current || !isPlaying) return;
    const ctx = audioCtxRef.current;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 1.5, now);
    osc.frequency.exponentialRampToValueAtTime(freq, now + 0.08);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.45);

    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(masterGainRef.current);

    osc.start(now);
    osc.stop(now + 0.45);
  };

  // Play a trap hi-hat roll
  const playHiHat = () => {
    if (!audioCtxRef.current || !isPlaying) return;
    const ctx = audioCtxRef.current;
    const now = ctx.currentTime;

    // Filtered high noise burst
    const bufferSize = ctx.sampleRate * 0.05;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(8000, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(masterGainRef.current);

    noise.start(now);
    noise.stop(now + 0.05);
  };

  // Play trap snare / clap
  const playSnare = () => {
    if (!audioCtxRef.current || !isPlaying) return;
    const ctx = audioCtxRef.current;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.12);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.25, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(oscGain);
    oscGain.connect(masterGainRef.current);
    osc.start(now);
    osc.stop(now + 0.12);

    // Noise snap
    const bufferSize = ctx.sampleRate * 0.12;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2200, now);
    filter.Q.setValueAtTime(2, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.25, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(masterGainRef.current);

    noise.start(now);
    noise.stop(now + 0.12);
  };

  // Play magical Harry Potter Celesta/Synth Bell note
  const playMelodyNote = (freq, duration = 0.5) => {
    if (!audioCtxRef.current || !isPlaying || freq === 0) return;
    const ctx = audioCtxRef.current;
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc1.type = 'sine';
    osc2.type = 'triangle';

    osc1.frequency.setValueAtTime(freq, now);
    osc2.frequency.setValueAtTime(freq * 2, now); // 1 octave overtone for magical bell shimmer

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 3, now);
    filter.frequency.exponentialRampToValueAtTime(freq, now + duration);

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(masterGainRef.current);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration);
    osc2.stop(now + duration);
  };

  // Sequencer loop
  useEffect(() => {
    if (isPlaying) {
      initAudioEngine();

      let noteIndex = 0;
      let beatCounter = 0;

      sequencerIntervalRef.current = setInterval(() => {
        beatCounter++;

        // 808 Trap Kick on beat 1 and syncopated beats
        if (beatCounter % 8 === 1 || beatCounter % 8 === 5 || beatCounter % 16 === 11) {
          play808Bass(beatCounter % 16 === 11 ? 48 : 55);
        }

        // Trap Snare / Clap on beats 5 and 13
        if (beatCounter % 8 === 5) {
          playSnare();
        }

        // Fast Trap Hi-Hats every 16th note
        playHiHat();

        // Hedwig Melody progression
        if (beatCounter % 2 === 0) {
          const currentMelody = melodyNotes[noteIndex % melodyNotes.length];
          if (currentMelody && currentMelody.note > 0) {
            playMelodyNote(currentMelody.note, currentMelody.dur);
          }
          noteIndex++;
        }
      }, 150); // ~100 BPM trap beat tempo
    } else {
      if (sequencerIntervalRef.current) {
        clearInterval(sequencerIntervalRef.current);
        sequencerIntervalRef.current = null;
      }
    }

    return () => {
      if (sequencerIntervalRef.current) {
        clearInterval(sequencerIntervalRef.current);
      }
    };
  }, [isPlaying]);

  // Volume & Mute adjustments
  useEffect(() => {
    if (masterGainRef.current && audioCtxRef.current) {
      const targetGain = isMuted ? 0 : volume;
      masterGainRef.current.gain.setValueAtTime(targetGain, audioCtxRef.current.currentTime);
    }
  }, [volume, isMuted]);

  // Synchronize jump-scare eerie sound drop
  const triggerJumpScareAudio = () => {
    if (!audioCtxRef.current || !isPlaying) return;
    const ctx = audioCtxRef.current;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.8);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    osc.connect(gain);
    gain.connect(masterGainRef.current);
    osc.start(now);
    osc.stop(now + 0.8);
  };

  const togglePlay = () => {
    initAudioEngine();
    setIsPlaying(prev => !prev);
    setHasInteracted(true);
    setShowPrompt(false);
  };

  const toggleMute = () => {
    setIsMuted(prev => !prev);
  };

  return (
    <MusicContext.Provider value={{
      isPlaying,
      togglePlay,
      volume,
      setVolume,
      isMuted,
      toggleMute,
      isMinimized,
      setIsMinimized,
      showPrompt,
      setShowPrompt,
      analyser: analyserRef.current,
      triggerJumpScareAudio
    }}>
      {children}
    </MusicContext.Provider>
  );
}

export function useMusic() {
  const context = useContext(MusicContext);
  if (!context) {
    throw new Error('useMusic must be used within a MusicProvider');
  }
  return context;
}
