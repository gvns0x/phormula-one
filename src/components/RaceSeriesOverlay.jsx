export function RaceSeriesOverlay({ className = '', tiltDeg = 0, currentRace, totalRaces, entries, showAnimation = false }) {
  return (
    <div className={`${className}${showAnimation ? ' lap-times-overlay-visible' : ''}`}>
      <div
        className="lap-times-overlay race-series-overlay"
        style={{
          transform: `perspective(1000px) rotateY(${tiltDeg.toFixed(1)}deg) rotateZ(${(tiltDeg * 0.1).toFixed(1)}deg)`,
        }}
      >
        <div className="lap-counter">
          <span className="lap-counter-current">RACE {currentRace}</span>
          <span className="lap-counter-total">/{totalRaces}</span>
        </div>
        {entries.map((e) => (
          <div key={e.key} className={`race-series-entry${e.isActive ? ' is-active' : ''}`}>
            <span className={`race-series-num${e.isActive ? ' is-active' : ''}`}>{e.num}</span>
            <div className="race-series-stack">
              <span className="race-series-total">{e.totalLabel}</span>
              <span className="race-series-fastest">{e.fastestLabel}</span>
              <span className="race-series-clean">{e.cleanLabel}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
