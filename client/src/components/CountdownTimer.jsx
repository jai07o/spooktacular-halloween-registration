import React, { useState, useEffect } from 'react';

export default function CountdownTimer({ targetDate = '2026-10-31T18:00:00+05:30' }) {
  const calculateTimeLeft = () => {
    const difference = +new Date(targetDate) - +new Date();
    let timeLeft = { days: 0, hours: 0, minutes: 0, seconds: 0 };

    if (difference > 0) {
      timeLeft = {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60)
      };
    }

    return timeLeft;
  };

  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  const units = [
    { label: 'DAYS', value: timeLeft.days },
    { label: 'HOURS', value: timeLeft.hours },
    { label: 'MINUTES', value: timeLeft.minutes },
    { label: 'SECONDS', value: timeLeft.seconds }
  ];

  return (
    <div style={{ margin: '2rem 0' }}>
      <div style={{
        display: 'flex',
        gap: '1rem',
        justifyContent: 'center',
        flexWrap: 'wrap'
      }}>
        {units.map((unit, index) => (
          <div
            key={unit.label}
            style={{
              background: 'linear-gradient(145deg, #181520, #0f0d14)',
              border: '1px solid var(--border-orange)',
              boxShadow: 'var(--shadow-orange)',
              borderRadius: 'var(--radius-md)',
              padding: '1.25rem 1rem',
              minWidth: '90px',
              textAlign: 'center',
              position: 'relative'
            }}
          >
            <div style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 'clamp(2rem, 5vw, 3rem)',
              fontWeight: 800,
              color: 'var(--text-white)',
              lineHeight: 1,
              marginBottom: '0.4rem',
              textShadow: '0 0 15px var(--orange-glow)'
            }}>
              {String(unit.value).padStart(2, '0')}
            </div>
            <div style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '2px',
              color: 'var(--text-accent)'
            }}>
              {unit.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
