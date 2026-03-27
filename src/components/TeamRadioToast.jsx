import { useEffect, useRef } from 'react';
import './TeamRadioToast.css';

const BAR_COUNT = 16;

function RadioVisualizer() {
  const barsRef = useRef([]);
  const targetsRef = useRef(Array.from({ length: BAR_COUNT }, () => 0.35));
  const levelsRef = useRef(Array.from({ length: BAR_COUNT }, () => 0.35));

  useEffect(() => {
    let rafId = 0;
    let lastT = performance.now();

    const step = (t) => {
      const dt = Math.min(0.05, (t - lastT) / 1000);
      lastT = t;
      const envelope = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.007));

      for (let i = 0; i < BAR_COUNT; i += 1) {
        if (Math.random() < 0.12 * (60 * dt)) {
          targetsRef.current[i] = 0.12 + Math.random() * 0.88;
        }
        const target = targetsRef.current[i] * envelope;
        const k = Math.min(1, 10 * dt);
        levelsRef.current[i] += (target - levelsRef.current[i]) * k;
        const y = Math.max(0.08, levelsRef.current[i]);
        const el = barsRef.current[i];
        if (el) el.style.transform = `scaleY(${y})`;
      }
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className="team-radio-toast__viz" aria-hidden="true">
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <div
          key={i}
          className="team-radio-toast__viz-bar"
          ref={(el) => {
            barsRef.current[i] = el;
          }}
        />
      ))}
    </div>
  );
}

export function TeamRadioToast({ message, subtitle, className = '' }) {
  const rootClass = ['team-radio-toast', className].filter(Boolean).join(' ');

  return (
    <div className={rootClass}>
      <div className="team-radio-toast__header">
        <span className="team-radio-toast__label">Radio</span>
        <RadioVisualizer />
      </div>
      <p className="team-radio-toast__message" role="status" aria-live="polite">
        &ldquo;{message}&rdquo;
      </p>
      {subtitle ? (
        <p className="team-radio-toast__subtitle">&ldquo;{subtitle}&rdquo;</p>
      ) : null}
    </div>
  );
}
