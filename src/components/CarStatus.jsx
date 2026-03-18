export function CarStatus({ damage }) {
  const d = Math.max(0, Math.min(damage ?? 0, 1));
  const hue = 120 * (1 - d);
  const color = `hsl(${hue}, 100%, 50%)`;

  return (
    <div className="car-status">
      <svg viewBox="0 0 60 120" className="car-chassis">
        {/* Front wing */}
        <rect x="5" y="6" width="50" height="4" rx="1"
          fill="none" stroke={color} strokeWidth="2" />
        {/* Nose */}
        <path d="M22 10 L22 25 L38 25 L38 10"
          fill="none" stroke={color} strokeWidth="2" />
        {/* Body */}
        <path d="M15 25 L10 50 L10 90 L15 105 L45 105 L50 90 L50 50 L45 25 Z"
          fill="none" stroke={color} strokeWidth="2" />
        {/* Cockpit */}
        <ellipse cx="30" cy="52" rx="8" ry="12"
          fill="none" stroke={color} strokeWidth="1.5" />
        {/* Sidepods */}
        <path d="M10 45 L4 50 L4 72 L10 75"
          fill="none" stroke={color} strokeWidth="1.5" />
        <path d="M50 45 L56 50 L56 72 L50 75"
          fill="none" stroke={color} strokeWidth="1.5" />
        {/* Rear wing */}
        <rect x="3" y="108" width="54" height="5" rx="1"
          fill="none" stroke={color} strokeWidth="2" />
        {/* Rear wing endplates */}
        <line x1="5" y1="105" x2="5" y2="115" stroke={color} strokeWidth="1.5" />
        <line x1="55" y1="105" x2="55" y2="115" stroke={color} strokeWidth="1.5" />
        {/* Front wheels */}
        <rect x="0" y="18" width="6" height="14" rx="2"
          fill="none" stroke={color} strokeWidth="1.5" />
        <rect x="54" y="18" width="6" height="14" rx="2"
          fill="none" stroke={color} strokeWidth="1.5" />
        {/* Rear wheels */}
        <rect x="0" y="88" width="6" height="16" rx="2"
          fill="none" stroke={color} strokeWidth="1.5" />
        <rect x="54" y="88" width="6" height="16" rx="2"
          fill="none" stroke={color} strokeWidth="1.5" />
      </svg>
      <div className="damage-bar-track">
        <div
          className="damage-bar-fill"
          style={{ width: `${d * 100}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
