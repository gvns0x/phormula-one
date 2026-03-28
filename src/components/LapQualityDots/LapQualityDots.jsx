import { Tooltip } from '../Tooltip/Tooltip';
import './LapQualityDots.css';

function lapQualityModifier(state) {
  if (state === true) return ' is-clean';
  if (state === false) return ' is-dirty';
  return ' is-unknown';
}

function lapQualityTooltipText(state) {
  if (state === true) return 'Clean lap – no damage';
  if (state === false) return 'Dirty lap – some damage';
  return 'Complete lap to view lap quality';
}

function lapQualityAria(state, lapNum) {
  if (state === true) return `Lap ${lapNum} clean`;
  if (state === false) return `Lap ${lapNum} dirty`;
  return `Lap ${lapNum} not set yet`;
}

export function LapQualityDots({ lapStates = [], className = '', startLapIndex = 0 }) {
  return (
    <div className={`lap-quality-dots${className ? ` ${className}` : ''}`} aria-label="Lap quality">
      {lapStates.map((state, idx) => {
        const lapNum = startLapIndex + idx + 1;
        return (
          <Tooltip key={idx} content={lapQualityTooltipText(state)}>
            <span
              className={`lap-quality-dot${lapQualityModifier(state)}`}
              aria-label={lapQualityAria(state, lapNum)}
            />
          </Tooltip>
        );
      })}
    </div>
  );
}
