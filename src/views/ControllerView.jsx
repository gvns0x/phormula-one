/**
 * iPhone controller: tilt steering + touch throttle/brake.
 * Landscape-only, full-screen.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useControllerConnect } from '../networking/useControllerConnect';
import './ControllerView.css';

const INPUT_RATE = 60;
const TILT_DEADZONE = 3;
const TILT_MAX = 30;
const DOUBLE_TAP_MS = 400;

function getTiltSteer(event) {
  const angle = window.screen?.orientation?.angle ?? window.orientation ?? 0;
  let tilt;
  switch (angle) {
    case 90:       tilt = event.beta; break;
    case -90:
    case 270:      tilt = -event.beta; break;
    default:       tilt = event.gamma; break;
  }
  if (tilt == null) return 0;
  if (Math.abs(tilt) < TILT_DEADZONE) return 0;
  const sign = tilt > 0 ? 1 : -1;
  const adjusted = Math.abs(tilt) - TILT_DEADZONE;
  const normalized = adjusted / (TILT_MAX - TILT_DEADZONE);
  return Math.round(sign * Math.min(normalized, 1) * 100) / 100;
}

export default function ControllerView() {
  const [inputCode, setInputCode] = useState('');
  const { joinRoom, sendInput, speed, gear, rpm, connectionStatus, errorMessage } = useControllerConnect();

  const [isPortrait, setIsPortrait] = useState(
    () => window.matchMedia('(orientation: portrait)').matches
  );
  const [tiltActive, setTiltActive] = useState(false);
  const [tiltSteer, setTiltSteer] = useState(0);

  const steerRef = useRef(0);
  const throttleRef = useRef(0);
  const brakeRef = useRef(0);
  const rafRef = useRef(null);
  const lastSentRef = useRef({ s: 0, a: 0, b: 0 });
  const lastSteerTapRef = useRef(0);

  // Portrait / landscape detection
  useEffect(() => {
    const mql = window.matchMedia('(orientation: portrait)');
    const handler = (e) => setIsPortrait(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Auto-enable tilt when connected
  useEffect(() => {
    if (connectionStatus !== 'connected' || tiltActive) return;
    (async () => {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
          const result = await DeviceOrientationEvent.requestPermission();
          if (result !== 'granted') return;
        } catch (_e) { return; }
      }
      setTiltActive(true);
    })();
  }, [connectionStatus, tiltActive]);

  const sendIfChanged = useCallback(() => {
    const s = steerRef.current;
    const a = throttleRef.current;
    const b = brakeRef.current;
    const last = lastSentRef.current;
    if (s !== last.s || a !== last.a || b !== last.b) {
      lastSentRef.current = { s, a, b };
      sendInput({ t: Date.now(), s, a, b });
    }
  }, [sendInput]);

  useEffect(() => {
    let last = 0;
    function loop(now) {
      const dt = now - last;
      if (dt >= 1000 / INPUT_RATE || last === 0) {
        last = now;
        sendIfChanged();
      }
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [sendIfChanged]);

  useEffect(() => {
    if (!tiltActive) return;
    const handler = (e) => {
      const steer = getTiltSteer(e);
      steerRef.current = steer;
      setTiltSteer(steer);
    };
    window.addEventListener('deviceorientation', handler);
    return () => window.removeEventListener('deviceorientation', handler);
  }, [tiltActive]);

  useEffect(() => {
    if (!navigator.vibrate) return;
    const kmh = speed * 3.6;
    if (kmh < 5) {
      navigator.vibrate(0);
      return;
    }
    const intensity = Math.min(kmh / 200, 1);
    const vibMs = Math.round(10 + intensity * 30);
    const pauseMs = Math.round(80 - intensity * 60);
    const pattern = [vibMs, pauseMs];
    navigator.vibrate(pattern);
    const id = setInterval(() => navigator.vibrate(pattern), vibMs + pauseMs);
    return () => {
      clearInterval(id);
      navigator.vibrate(0);
    };
  }, [speed]);

  const handleThrottle = useCallback((e) => {
    e.preventDefault();
    throttleRef.current = 1;
  }, []);

  const handleBrake = useCallback((e) => {
    e.preventDefault();
    brakeRef.current = 1;
  }, []);

  const handleThrottleEnd = useCallback((e) => {
    e.preventDefault();
    throttleRef.current = 0;
  }, []);

  const handleBrakeEnd = useCallback((e) => {
    e.preventDefault();
    brakeRef.current = 0;
  }, []);

  const handleSteerTap = useCallback((e) => {
    e.preventDefault();
    const now = Date.now();
    if (now - lastSteerTapRef.current < DOUBLE_TAP_MS) {
      sendInput({ type: 'restart' });
      lastSteerTapRef.current = 0;
    } else {
      lastSteerTapRef.current = now;
    }
  }, [sendInput]);

  const handleConnect = useCallback(() => {
    joinRoom(inputCode);
  }, [joinRoom, inputCode]);

  const isConnected = connectionStatus === 'connected';

  if (isPortrait) {
    return (
      <div className="controller-view portrait-gate">
        <div className="rotate-message">
          <div className="rotate-icon">&#x21BB;</div>
          <p>Rotate your phone to landscape</p>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="controller-view connect-screen">
        <div className="connect-form">
          <h2 className="connect-title">Enter Room Code</h2>
          <input
            type="text"
            placeholder="XXXXXX"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value.toUpperCase().slice(0, 6))}
            maxLength={6}
            className="room-input"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
          />
          <button
            onClick={handleConnect}
            disabled={connectionStatus === 'connecting'}
            className="connect-btn"
          >
            {connectionStatus === 'connecting' ? 'Connecting...' : 'Connect'}
          </button>
          {errorMessage && <span className="error">{errorMessage}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="controller-view">
      <div className="controller-status-bar">
        <span className={`status status-${connectionStatus}`}>
          {connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}
        </span>
        <span className="speed-display">
          G{gear} {Math.round(speed * 3.6)} km/h {rpm.toLocaleString()} RPM
        </span>
      </div>

      <div
        className="touch-zones"
        onTouchMove={(e) => e.preventDefault()}
        onTouchStart={(e) => e.preventDefault()}
      >
        <div
          className="zone steer-area tilt-mode"
          onTouchEnd={handleSteerTap}
        >
          <div className="tilt-indicator-track">
            <div
              className="tilt-indicator-thumb"
              style={{ transform: `translateX(${tiltSteer * 100}%)` }}
            />
          </div>
        </div>
        <div
          className="zone brake"
          onTouchStart={handleBrake}
          onTouchEnd={handleBrakeEnd}
          onTouchCancel={handleBrakeEnd}
        />
        <div
          className="zone throttle"
          onTouchStart={handleThrottle}
          onTouchEnd={handleThrottleEnd}
          onTouchCancel={handleThrottleEnd}
        />
      </div>
    </div>
  );
}
