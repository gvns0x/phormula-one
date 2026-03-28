import { LapQualityDots } from '../LapQualityDots/LapQualityDots';
import './OverlayLeaderboard.css';

export function OverlayLeaderboard({
  className = '',
  title,
  counterCurrent,
  counterTotal,
  rows,
  showAnimation = false,
  tiltDeg = 0,
  extras = null,
}) {
  return (
    <div className={`${className}${showAnimation ? ' lap-times-overlay-visible' : ''}`}>
      <div
        className="lap-times-overlay"
        style={{
          transform: `perspective(1000px) rotateY(${tiltDeg.toFixed(1)}deg) rotateZ(${(tiltDeg * 0.1).toFixed(1)}deg)`,
        }}
      >
        {(title || counterCurrent != null) && (
          <div className="lap-counter">
            {title && <span className="lap-counter-current">{title}</span>}
            {counterCurrent != null && (
              <span className="lap-counter-current">
                {counterCurrent}
              </span>
            )}
            {counterTotal != null && (
              <span className="lap-counter-total">/{counterTotal}</span>
            )}
          </div>
        )}
        {rows.map((row) => (
          <div key={row.key} className="lap-time-row">
            <span className={`lap-time-index${row.isActive ? ' is-active' : ' is-inactive'}`}>
              {row.index}
            </span>
            <span className="lap-time-value-wrap">
              <span className={`lap-time-value${row.hasTime ? ' has-time' : ' no-time'}`}>
                {row.value}
              </span>
              {row.lapQualityDots != null && row.lapQualityDots.length > 0 && (
                <LapQualityDots
                  lapStates={row.lapQualityDots}
                  className="lap-quality-dots--inline"
                  startLapIndex={row.index - 1}
                />
              )}
            </span>
            <span className={`lap-fastest-badge${row.badgeVisible ? ' visible' : ''}`} aria-hidden={!row.badgeVisible}>
              {row.badgeText ?? 'FASTEST'}
            </span>
          </div>
        ))}
        {extras}
      </div>
    </div>
  );
}
