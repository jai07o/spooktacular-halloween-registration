import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

export default function QrCodeDisplay({ text, size = 200, className = '' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (canvasRef.current && text) {
      QRCode.toCanvas(canvasRef.current, text, {
        width: size,
        margin: 2,
        color: {
          dark: '#0a0a0f',
          light: '#ffffff'
        }
      }, (error) => {
        if (error) console.error('QR generation error:', error);
      });
    }
  }, [text, size]);

  return (
    <div className={`ticket-qr ${className}`} style={{ display: 'inline-block' }}>
      <canvas
        ref={canvasRef}
        style={{
          borderRadius: 'var(--radius-sm)',
          boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
          display: 'block'
        }}
      />
    </div>
  );
}
