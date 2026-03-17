import { useState, useRef, useEffect, useCallback } from 'react';
import { createGameEngine } from '../game/GameEngine';
import { MAX_RPM } from '../game/gearbox';
import { useControllerSync } from '../networking/useControllerSync';
import { DevToolsPanel } from '../components/DevToolsPanel';
import './GameView.css';

function formatTime(ms) {
  if (ms == null) return '--:--.---';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const millis = Math.floor(ms % 1000);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function formatDelta(lastLap, bestLap) {
  if (lastLap == null || bestLap == null) return null;
  const delta = lastLap - bestLap;
  const sign = delta <= 0 ? '-' : '+';
  const abs = Math.abs(delta);
  const sec = Math.floor(abs / 1000);
  const millis = Math.floor(abs % 1000);
  return { text: `${sign}${sec}.${String(millis).padStart(3, '0')}`, isFaster: delta <= 0 };
}

export function GameView() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const setDroneViewRef = useRef(null);
  const setRacingLineRef = useRef(null);
  const [racingLineVisible, setRacingLineVisible] = useState(false);
  const [speed, setSpeed] = useState(0);
  const [gear, setGear] = useState(1);
  const [rpm, setRpm] = useState(0);
  const { createRoom, getInput, sendState, roomCode, connectionStatus, errorMessage } = useControllerSync();

  const [raceState, setRaceState] = useState('idle');
  const [countdownValue, setCountdownValue] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [lastLap, setLastLap] = useState(null);
  const [bestLap, setBestLap] = useState(null);
  const [lastLapClean, setLastLapClean] = useState(null);
  const [bestLapClean, setBestLapClean] = useState(null);
  const [currentLapDirty, setCurrentLapDirty] = useState(false);

  const lapStartRef = useRef(null);
  const cleanLapRef = useRef(true);
  const raceStateRef = useRef('idle');
  const countdownTimersRef = useRef([]);
  const inputBlockedRef = useRef(false);
  const lastTapRef = useRef({ time: 0, x: 0, y: 0 });

  useEffect(() => {
    raceStateRef.current = raceState;
  }, [raceState]);

  const wrappedGetInput = useCallback(() => {
    if (inputBlockedRef.current) return { steer: 0, throttle: 0, brake: 0 };
    return getInput ? getInput() : { steer: 0, throttle: 0, brake: 0 };
  }, [getInput]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = createGameEngine(canvasRef, wrappedGetInput, {
      onTick: (s) => {
        setSpeed(s.speed);
        setGear(s.gear);
        setRpm(s.rpm);
        sendState(s);

        if (s.offTrack && cleanLapRef.current) {
          cleanLapRef.current = false;
          setCurrentLapDirty(true);
        }

        if (raceStateRef.current === 'racing' && lapStartRef.current != null) {
          setElapsed(performance.now() - lapStartRef.current);
        }

        if (s.crossed && raceStateRef.current === 'racing') {
          const now = performance.now();
          const lapTime = now - lapStartRef.current;
          if (lapTime > 5000) {
            const wasClean = cleanLapRef.current;
            setLastLap(lapTime);
            setLastLapClean(wasClean);
            setBestLap(prev => {
              if (!wasClean) return prev;
              if (prev == null || lapTime < prev) {
                setBestLapClean(true);
                return lapTime;
              }
              return prev;
            });
            lapStartRef.current = now;
            cleanLapRef.current = true;
            setCurrentLapDirty(false);
            setElapsed(0);
          }
        }
      },
    });
    engineRef.current = engine;
    setDroneViewRef.current = engine.setDroneView;
    setRacingLineRef.current = engine.setRacingLineVisible;
    engine.start();
    return () => engine.stop();
  }, [wrappedGetInput, sendState]);

  const startCountdown = useCallback(() => {
    countdownTimersRef.current.forEach(clearTimeout);
    countdownTimersRef.current = [];

    const engine = engineRef.current;
    if (!engine) return;

    engine.resetCar();
    inputBlockedRef.current = true;
    cleanLapRef.current = true;
    setCurrentLapDirty(false);
    setRaceState('countdown');
    setElapsed(0);
    setLastLap(null);
    setLastLapClean(null);
    setCountdownValue(3);

    const t1 = setTimeout(() => setCountdownValue(2), 1000);
    const t2 = setTimeout(() => setCountdownValue(1), 2000);
    const t3 = setTimeout(() => {
      setCountdownValue(null);
      setRaceState('racing');
      inputBlockedRef.current = false;
      lapStartRef.current = performance.now();
    }, 3000);

    countdownTimersRef.current = [t1, t2, t3];
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === ' ') {
        e.preventDefault();
        startCountdown();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [startCountdown]);

  useEffect(() => {
    function isInCenter(clientX, clientY) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const margin = 0.25;
      return (
        clientX >= w * margin && clientX <= w * (1 - margin) &&
        clientY >= h * margin && clientY <= h * (1 - margin)
      );
    }
    function onTouchEnd(e) {
      const touch = e.changedTouches?.[0];
      if (!touch) return;
      const x = touch.clientX;
      const y = touch.clientY;
      const now = Date.now();
      const last = lastTapRef.current;
      if (isInCenter(x, y) && last.time > 0 && now - last.time < 450 && isInCenter(last.x, last.y)) {
        e.preventDefault();
        startCountdown();
        lastTapRef.current = { time: 0, x: 0, y: 0 };
        return;
      }
      lastTapRef.current = { time: now, x, y };
    }
    document.addEventListener('touchend', onTouchEnd, { passive: false });
    return () => document.removeEventListener('touchend', onTouchEnd);
  }, [startCountdown]);

  useEffect(() => {
    return () => countdownTimersRef.current.forEach(clearTimeout);
  }, []);

  const delta = formatDelta(lastLap, bestLap);
  const rpmFraction = Math.max(0, Math.min(rpm / MAX_RPM, 1));
  const rpmSegments = 8;
  const activeSegments = Math.round(rpmFraction * rpmSegments);

  return (
    <div className="game-view">
      <div className="game-overlay">
        <div className="room-section">
          {!roomCode ? (
            <button className="btn-create" onClick={createRoom} type="button">
              Connect phone
            </button>
          ) : (
            <div className="room-info">
              <span className="room-label">Enter this code</span>
              <span className="room-code">{roomCode}</span>
            </div>
          )}
        </div>
        <div className={`connection-status status-${connectionStatus}`}>
          {connectionStatus === 'disconnected' && 'Waiting for controller'}
          {connectionStatus === 'connecting' && 'Connecting...'}
          {connectionStatus === 'connected' && 'Connected'}
          {connectionStatus === 'error' && (errorMessage || 'Error')}
        </div>
        <button
          className={`btn-racing-line${racingLineVisible ? ' active' : ''}`}
          type="button"
          onClick={() => {
            const next = !racingLineVisible;
            setRacingLineVisible(next);
            setRacingLineRef.current?.(next);
          }}
        >
          Racing Line
        </button>
        <DevToolsPanel onToggleDroneView={(v) => setDroneViewRef.current?.(v)} />
      </div>

      <div className="timing-hud">
        <div className={`timer${currentLapDirty ? ' timer-dirty' : ''}`}>{formatTime(elapsed)}</div>
        {bestLap != null && (
          <div className="best-lap">
            <span className="lap-label">Best</span>
            <span className="lap-time">{formatTime(bestLap)}</span>
            {bestLapClean != null && (
              <span className={`lap-flag ${bestLapClean ? 'flag-clean' : 'flag-dirty'}`}>
                {bestLapClean ? '\u2691' : '\u2691'}
              </span>
            )}
          </div>
        )}
        {lastLap != null && (
          <div className="last-lap">
            <span className="lap-label">Last</span>
            <span className="lap-time">{formatTime(lastLap)}</span>
            {lastLapClean != null && (
              <span className={`lap-flag ${lastLapClean ? 'flag-clean' : 'flag-dirty'}`}>
                {lastLapClean ? '\u2691' : '\u2691'}
              </span>
            )}
            {delta && (
              <span className={`lap-delta ${delta.isFaster ? 'faster' : 'slower'}`}>
                {delta.text}
              </span>
            )}
          </div>
        )}
      </div>

      {raceState === 'idle' && (
        <div className="start-hint">Press Space to start</div>
      )}

      {countdownValue != null && (
        <div className="countdown-overlay" key={countdownValue}>
          {countdownValue}
        </div>
      )}

      <div className="speed-display">
        <span className="speed-gear">G{gear}</span>
        <div className="speed-main">
          <span className="speed-value">{Math.round(speed * 3.6)}</span>
          <span className="speed-unit">km/h</span>
        </div>
        <div className="rpm-bar">
          {Array.from({ length: rpmSegments }).map((_, i) => {
            const filled = i < activeSegments;
            let color = '#00ff88';
            if (i >= 4 && i < 6) color = '#ffd600';
            if (i >= 6) color = '#ff3333';
            return (
              <div
                // eslint-disable-next-line react/no-array-index-key
                key={i}
                className="rpm-bar-segment"
                style={{
                  backgroundColor: filled ? color : 'rgba(255, 255, 255, 0.12)',
                }}
              />
            );
          })}
        </div>
      </div>
      <canvas ref={canvasRef} className="game-canvas" />
    </div>
  );
}
