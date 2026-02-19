
import React, { useEffect, useRef } from 'react';

interface VoiceVisualizerProps {
  isActive: boolean;
  color?: string;
}

const VoiceVisualizer: React.FC<VoiceVisualizerProps> = ({ isActive, color = '#EAB308' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let startTime = Date.now();

    const draw = () => {
      const now = Date.now();
      const delta = now - startTime;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const barCount = 40;
      const barWidth = 4;
      const gap = 2;
      const midY = canvas.height / 2;

      for (let i = 0; i < barCount; i++) {
        let amplitude = isActive ? Math.sin(delta * 0.01 + i * 0.3) * 15 + 20 : 2;
        if (isActive) amplitude *= (0.5 + Math.random() * 0.5);
        
        ctx.fillStyle = color;
        ctx.fillRect(
          i * (barWidth + gap),
          midY - amplitude / 2,
          barWidth,
          amplitude
        );
      }
      
      requestRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isActive, color]);

  return (
    <canvas 
      ref={canvasRef} 
      width={240} 
      height={60} 
      className="rounded-lg"
    />
  );
};

export default VoiceVisualizer;
