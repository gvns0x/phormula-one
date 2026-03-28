import { Tooltip } from '../Tooltip/Tooltip.jsx';
import './CarStatus.css';

const RING_R = 40;
const RING_C = 2 * Math.PI * RING_R;

export function CarStatus({ damage }) {
  const d = Math.max(0, Math.min(damage ?? 0, 1));
  const health = 1 - d;
  const hue = 120 * (1 - d);
  const color = `hsl(${hue}, 80%, 50%)`;
  const pct = Math.round(health * 100);
  const dash = health * RING_C;

  return (
    <Tooltip content="Car health" className="car-status-tooltip">
      <div
        className="car-status"
        role="img"
        aria-label={`Health ${pct} percent`}
      >
        <div className="car-status-gauge">
          <svg viewBox="0 0 100 100" className="car-status-ring-svg" aria-hidden>
            <circle
              className="car-status-ring-track"
              cx="50"
              cy="50"
              r={RING_R}
              fill="none"
            />
            <circle
              className="car-status-ring-progress"
              cx="50"
              cy="50"
              r={RING_R}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${RING_C}`}
              transform="rotate(-90 50 50)"
            />
          </svg>
          <div className="car-status-center">
            <span className="car-status-pct" style={{ color }}>
              {pct}%
            </span>
          </div>
        </div>
      </div>
    </Tooltip>
  );
}
