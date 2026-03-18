import { useRef, useEffect, useMemo } from 'react';

const SIZE = 160;
const PAD = 12;

export function MiniMap({ trackPts, carPosition, ghostPosition }) {
  const canvasRef = useRef(null);
  const drawnTrackRef = useRef(false);
  const trackImageRef = useRef(null);

  const transform = useMemo(() => {
    if (!trackPts || trackPts.length === 0) return null;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of trackPts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    const rangeX = maxX - minX || 1;
    const rangeZ = maxZ - minZ || 1;
    const scale = (SIZE - PAD * 2) / Math.max(rangeX, rangeZ);
    const offX = (SIZE - rangeX * scale) / 2;
    const offZ = (SIZE - rangeZ * scale) / 2;
    return { minX, minZ, scale, offX, offZ };
  }, [trackPts]);

  useEffect(() => {
    if (!transform || !trackPts || drawnTrackRef.current) return;
    const offscreen = document.createElement('canvas');
    offscreen.width = SIZE;
    offscreen.height = SIZE;
    const ctx = offscreen.getContext('2d');
    const { minX, minZ, scale, offX, offZ } = transform;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < trackPts.length; i++) {
      const x = (trackPts[i].x - minX) * scale + offX;
      const y = (trackPts[i].z - minZ) * scale + offZ;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    trackImageRef.current = offscreen;
    drawnTrackRef.current = true;
  }, [trackPts, transform]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !transform || !trackImageRef.current) return;
    const ctx = canvas.getContext('2d');
    const { minX, minZ, scale, offX, offZ } = transform;

    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(trackImageRef.current, 0, 0);

    if (ghostPosition) {
      const gx = (ghostPosition.x - minX) * scale + offX;
      const gy = (ghostPosition.z - minZ) * scale + offZ;
      ctx.fillStyle = '#00ff88';
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.arc(gx, gy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    if (carPosition) {
      const cx = (carPosition.x - minX) * scale + offX;
      const cy = (carPosition.z - minZ) * scale + offZ;
      ctx.fillStyle = '#ff2222';
      ctx.shadowColor = '#ff2222';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }, [carPosition, ghostPosition, transform]);

  return (
    <canvas
      ref={canvasRef}
      width={SIZE}
      height={SIZE}
      className="mini-map"
    />
  );
}
