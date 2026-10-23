import React, { useState, useEffect, useRef } from 'react';

export default function SpookyBackground() {
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioContextRef = useRef(null);
  const oscillatorRef = useRef(null);
  const gainNodeRef = useRef(null);

  // Toggle ambient eerie synthesizer drone with Web Audio API
  const toggleAmbientSound = () => {
    if (!soundEnabled) {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        audioContextRef.current = ctx;

        // Eerie minor-drone filter & oscillator
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(65.41, ctx.currentTime); // Low C (C2)
        
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(320, ctx.currentTime);
        filter.Q.setValueAtTime(5, ctx.currentTime);

        gain.gain.setValueAtTime(0.04, ctx.currentTime); // Subtle volume

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        oscillatorRef.current = osc;
        gainNodeRef.current = gain;
        setSoundEnabled(true);
      } catch (e) {
        console.warn('Web Audio not allowed without interaction:', e);
      }
    } else {
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      setSoundEnabled(false);
    }
  };

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return (
    <>
      {/* Particle stars/embers effect */}
      <div className="bg-particles" />
      
      {/* Bottom atmospheric fog overlay */}
      <div className="fog-overlay" />

      {/* Floating spooky bat silhouettes */}
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 1,
          overflow: 'hidden'
        }}
      >
        <span 
          style={{
            position: 'absolute',
            top: '15%',
            left: '10%',
            fontSize: '1.5rem',
            opacity: 0.15,
            animation: 'floatParticles 16s ease-in-out infinite alternate',
            transform: 'rotate(-10deg)'
          }}
        >
          🦇
        </span>
        <span 
          style={{
            position: 'absolute',
            top: '40%',
            right: '12%',
            fontSize: '2rem',
            opacity: 0.2,
            animation: 'floatParticles 22s ease-in-out infinite alternate-reverse',
            transform: 'rotate(15deg)'
          }}
        >
          🦇
        </span>
        <span 
          style={{
            position: 'absolute',
            top: '70%',
            left: '18%',
            fontSize: '1.2rem',
            opacity: 0.12,
            animation: 'floatParticles 19s ease-in-out infinite alternate',
            transform: 'rotate(5deg)'
          }}
        >
          🦇
        </span>
      </div>

      {/* Ambient Sound Toggle Button */}
      <button
        onClick={toggleAmbientSound}
        title={soundEnabled ? "Mute Spooky Ambience" : "Play Spooky Ambience"}
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          right: '1.5rem',
          zIndex: 99,
          background: 'rgba(18, 18, 26, 0.85)',
          backdropFilter: 'blur(10px)',
          border: '1px solid var(--border-orange)',
          color: soundEnabled ? 'var(--orange-primary)' : 'var(--text-muted)',
          borderRadius: '50px',
          padding: '0.6rem 1rem',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          cursor: 'pointer',
          boxShadow: soundEnabled ? '0 0 15px var(--orange-glow)' : 'var(--shadow-card)',
          transition: 'all 0.3s ease'
        }}
      >
        <span>{soundEnabled ? '🔊' : '🔇'}</span>
        <span style={{ fontWeight: 600, fontSize: '0.8rem' }}>
          {soundEnabled ? 'Ambience: ON' : 'Ambience: OFF'}
        </span>
      </button>
    </>
  );
}
