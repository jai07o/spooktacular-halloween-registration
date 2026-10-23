import React, { useState } from 'react';
import { useMusic } from '../context/MusicContext';

export default function MusicPlayer() {
  const {
    isPlaying,
    togglePlay,
    volume,
    setVolume,
    isMuted,
    toggleMute,
    isMinimized,
    setIsMinimized,
    showPrompt,
    setShowPrompt
  } = useMusic();

  return (
    <>
      {/* =====================================================
          FIRST VISIT PROMPT BANNER: "ENTER THE HALLOWEEN VIBE 🎃"
         ===================================================== */}
      {showPrompt && !isPlaying && (
        <div style={{
          position: 'fixed',
          bottom: '5.5rem',
          right: '1.5rem',
          zIndex: 9999,
          background: 'linear-gradient(135deg, rgba(20, 15, 26, 0.96), rgba(10, 8, 14, 0.98))',
          border: '2px solid #ff4500',
          borderRadius: '16px',
          padding: '1rem 1.25rem',
          boxShadow: '0 10px 40px rgba(255, 69, 0, 0.4), 0 0 25px rgba(0, 0, 0, 0.9)',
          backdropFilter: 'blur(12px)',
          maxWidth: '320px',
          animation: 'floatPrompt 4s ease-in-out infinite alternate'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.4rem' }}>🎃</span>
              <strong style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '0.95rem',
                color: '#ff8c33',
                letterSpacing: '1px'
              }}>
                ENTER THE HALLOWEEN VIBE
              </strong>
            </div>
            <button
              onClick={() => setShowPrompt(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#9ca3af',
                fontSize: '1rem',
                cursor: 'pointer',
                padding: 0
              }}
              title="Dismiss prompt"
            >
              ✕
            </button>
          </div>

          <p style={{ color: '#d1d5db', fontSize: '0.8rem', lineHeight: 1.4, margin: '0 0 0.85rem' }}>
            Immerse yourself with <strong>Harry Potter - Trap Remix</strong> by Trap Remix Guys as you browse and register!
          </p>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              id="btn-play-halloween-vibe"
              onClick={togglePlay}
              className="btn btn-primary btn-sm"
              style={{
                flex: 1,
                background: 'linear-gradient(135deg, #ff6b00, #ff3b00)',
                color: '#fff',
                fontWeight: 800,
                fontSize: '0.82rem',
                borderRadius: '50px',
                padding: '0.45rem 1rem'
              }}
            >
              ▶ Play Music
            </button>
            <button
              id="btn-dismiss-vibe-prompt"
              onClick={() => setShowPrompt(false)}
              className="btn btn-ghost btn-sm"
              style={{
                borderRadius: '50px',
                fontSize: '0.8rem',
                padding: '0.45rem 0.85rem'
              }}
            >
              Maybe Later
            </button>
          </div>
        </div>
      )}

      {/* =====================================================
          FLOATING HALLOWEEN MUSIC PLAYER
         ===================================================== */}
      <div style={{
        position: 'fixed',
        bottom: '1.25rem',
        right: '1.25rem',
        zIndex: 9998,
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        {isMinimized ? (
          /* ================= MINIMIZED BADGE ================= */
          <div
            id="btn-music-expand"
            onClick={() => setIsMinimized(false)}
            style={{
              background: 'rgba(15, 12, 22, 0.94)',
              border: '2px solid #ff4500',
              borderRadius: '50px',
              padding: '0.35rem 0.75rem 0.35rem 0.35rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              boxShadow: '0 8px 25px rgba(255, 69, 0, 0.35)',
              cursor: 'pointer',
              backdropFilter: 'blur(10px)'
            }}
            title="Expand Harry Potter Trap Remix Player"
          >
            {/* Spinning or Glowing Artwork */}
            <img
              src="/assets/harry-potter-cover.jpg"
              alt="Harry Potter Trap Remix"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '1px solid #ff8c33',
                animation: isPlaying ? 'spin 8s linear infinite' : 'none'
              }}
            />

            {/* Visualizer bars */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '16px' }}>
              <span style={{ width: '3px', height: isPlaying ? '100%' : '30%', background: '#ff6b00', borderRadius: '2px', animation: isPlaying ? 'pulse 0.6s infinite alternate' : 'none' }} />
              <span style={{ width: '3px', height: isPlaying ? '60%' : '20%', background: '#ff4500', borderRadius: '2px', animation: isPlaying ? 'pulse 0.4s 0.2s infinite alternate' : 'none' }} />
              <span style={{ width: '3px', height: isPlaying ? '85%' : '40%', background: '#fbbf24', borderRadius: '2px', animation: isPlaying ? 'pulse 0.5s 0.1s infinite alternate' : 'none' }} />
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fff',
                fontSize: '1rem',
                cursor: 'pointer',
                padding: '0 2px'
              }}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
          </div>
        ) : (
          /* ================= EXPANDED FULL CONTROLS ================= */
          <div style={{
            background: 'linear-gradient(145deg, rgba(18, 14, 26, 0.96), rgba(10, 8, 14, 0.98))',
            border: '2px solid rgba(255, 69, 0, 0.6)',
            borderRadius: '16px',
            padding: '1rem',
            width: '320px',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.8), 0 0 25px rgba(255, 69, 0, 0.25)',
            backdropFilter: 'blur(16px)',
            color: '#fff'
          }}>
            {/* Top row: Artwork + Song info + Minimize */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '0.85rem' }}>
              {/* Album Cover Art */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <img
                  src="/assets/harry-potter-cover.jpg"
                  alt="Harry Potter Trap Remix by Trap Remix Guys"
                  style={{
                    width: '54px',
                    height: '54px',
                    borderRadius: '8px',
                    objectFit: 'cover',
                    border: '1px solid #ff4500',
                    boxShadow: '0 0 10px rgba(255, 69, 0, 0.4)'
                  }}
                />
                {isPlaying && (
                  <span style={{
                    position: 'absolute',
                    top: '-4px',
                    right: '-4px',
                    width: '10px',
                    height: '10px',
                    background: '#22c55e',
                    borderRadius: '50%',
                    boxShadow: '0 0 8px #22c55e'
                  }} />
                )}
              </div>

              {/* Title & Artist */}
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '0.88rem',
                  fontWeight: 800,
                  color: '#ffffff',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  Harry Potter - Trap Remix
                </div>
                <div style={{ fontSize: '0.75rem', color: '#ff8c33', fontWeight: 600 }}>
                  Trap Remix Guys
                </div>
                <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: '2px' }}>
                  🎃 Halloween Background Music
                </div>
              </div>

              {/* Minimize button */}
              <button
                id="btn-music-minimize"
                onClick={() => setIsMinimized(true)}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#9ca3af',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
                title="Minimize player"
              >
                −
              </button>
            </div>

            {/* Middle: Music Visualizer Bars */}
            <div style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              gap: '4px',
              height: '24px',
              background: 'rgba(0,0,0,0.3)',
              borderRadius: '6px',
              padding: '4px 8px',
              marginBottom: '0.85rem'
            }}>
              {[0.4, 0.7, 1.0, 0.6, 0.85, 0.5, 0.9, 0.75, 0.45, 0.8, 0.65, 0.95].map((h, idx) => (
                <span
                  key={idx}
                  style={{
                    flex: 1,
                    height: isPlaying ? `${Math.max(15, (h * 100))}%` : '15%',
                    background: idx % 2 === 0 ? 'linear-gradient(to top, #ff4500, #ff8c33)' : 'linear-gradient(to top, #dc2626, #fbbf24)',
                    borderRadius: '2px',
                    transition: 'height 0.15s ease',
                    animation: isPlaying ? `pulse 0.${(idx % 4) + 4}s infinite alternate` : 'none'
                  }}
                />
              ))}
            </div>

            {/* Bottom Row: Controls & Volume */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              {/* Play / Pause Primary Button */}
              <button
                id="btn-music-toggle-play"
                onClick={togglePlay}
                style={{
                  background: isPlaying ? '#dc2626' : 'linear-gradient(135deg, #ff6b00, #ff3b00)',
                  border: 'none',
                  borderRadius: '50px',
                  color: '#fff',
                  padding: '0.4rem 0.85rem',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  cursor: 'pointer',
                  boxShadow: '0 2px 10px rgba(255, 69, 0, 0.4)'
                }}
              >
                <span>{isPlaying ? '⏸ Pause' : '▶ Play'}</span>
              </button>

              {/* Volume Slider and Mute */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, justifyContent: 'flex-end' }}>
                <button
                  id="btn-music-mute"
                  onClick={toggleMute}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: isMuted ? '#ef4444' : '#d1d5db',
                    fontSize: '1rem',
                    cursor: 'pointer',
                    padding: 0
                  }}
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? '🔇' : '🔊'}
                </button>

                <input
                  id="slider-music-volume"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    setVolume(parseFloat(e.target.value));
                    if (isMuted) toggleMute();
                  }}
                  style={{
                    width: '70px',
                    height: '4px',
                    accentColor: '#ff6b00',
                    cursor: 'pointer'
                  }}
                  title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
