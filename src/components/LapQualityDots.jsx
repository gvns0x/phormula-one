export function LapQualityDots({ lapStates = [] }) {
  return (
    <div className="lap-quality-dots" aria-label="Lap quality">
      {lapStates.map((isClean, idx) => (
        <span
          key={idx}
          className={`lap-quality-dot${isClean ? ' is-clean' : ' is-dirty'}`}
          title={`Lap ${idx + 1}: ${isClean ? 'Clean' : 'Dirty'}`}
          aria-label={`Lap ${idx + 1} ${isClean ? 'clean' : 'dirty'}`}
        />
      ))}
    </div>
  );
}
