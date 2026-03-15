import { useState, useCallback } from 'react';
import { tuning, resetTuning } from '../game/tuning';
import './DevToolsPanel.css';

const params = [
  { key: 'steerMax',      label: 'Steer Max (rad)',   min: 0.05, max: 1,     step: 0.01 },
  { key: 'steerRate',     label: 'Steer Rate',        min: 0.5,  max: 10,    step: 0.1  },
  { key: 'brakeForce',    label: 'Brake Force',       min: 1,    max: 200,   step: 1    },
  { key: 'engineForce',   label: 'Engine Force (N)',   min: 1000, max: 50000, step: 100  },
  { key: 'maxSpeed',      label: 'Max Speed (m/s)',    min: 10,   max: 200,   step: 1    },
  { key: 'linearDamping', label: 'Linear Damping',     min: 0,    max: 1,     step: 0.01 },
  { key: 'coastingDecay', label: 'Coasting Decay',     min: 0,    max: 2,     step: 0.01 },
  { key: 'lateralGrip',  label: 'Lateral Grip',       min: 0,    max: 20,    step: 0.5  },
];

export function DevToolsPanel() {
  const [open, setOpen] = useState(false);
  const [, forceUpdate] = useState(0);

  const refresh = useCallback(() => forceUpdate((n) => n + 1), []);

  function handleChange(key, value) {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      tuning[key] = num;
      refresh();
    }
  }

  function handleReset() {
    resetTuning();
    refresh();
  }

  return (
    <div className="devtools-wrapper">
      <button
        className="devtools-toggle"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        DevTools
      </button>

      {open && (
        <div className="devtools-panel">
          <div className="devtools-header">
            <span>Physics Tuning</span>
            <button className="devtools-reset" onClick={handleReset} type="button">
              Reset
            </button>
          </div>
          <div className="devtools-body">
            {params.map(({ key, label, min, max, step }) => (
              <div className="devtools-row" key={key}>
                <label className="devtools-label">{label}</label>
                <input
                  type="range"
                  className="devtools-slider"
                  min={min}
                  max={max}
                  step={step}
                  value={tuning[key]}
                  onChange={(e) => handleChange(key, e.target.value)}
                />
                <input
                  type="number"
                  className="devtools-number"
                  min={min}
                  max={max}
                  step={step}
                  value={tuning[key]}
                  onChange={(e) => handleChange(key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
