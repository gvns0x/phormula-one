/**
 * iPhone controller: touch zones for steering, throttle, brake.
 * Landscape-first, full-screen.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useControllerConnect } from '../networking/useControllerConnect';
import './ControllerView.css';

const INPUT_RATE = 60;

export default function ControllerView() {
  const [inputCode, setInputCode] = useState('');
  const { joinRoom, sendInput, speed, connectionStatus, errorMessage } = useControllerConnect();

  const steerRef = useRef(0);
  const throttleRef = useRef(0);
  const brakeRef = useRef(0);
  const rafRef = useRef(null);
  const lastSentRef = useRef({ s: 0, a: 0, b: 0 });

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

  const getSteerFromX = useCallback((clientX, target) => {
    const rect = target.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    if (x < 0.4) return -1;
    if (x > 0.6) return 1;
    return 0;
  }, []);

  const handleSteerTouch = useCallback((e) => {
    e.preventDefault();
    const touch = e.touches[0] || e.changedTouches[0];
    if (touch) steerRef.current = getSteerFromX(touch.clientX, e.currentTarget);
  }, [getSteerFromX]);

  const handleSteerEnd = useCallback((e) => {
    e.preventDefault();
    steerRef.current = 0;
  }, []);

  const handleThrottle = useCallback((e) => {
    e.preventDefault();
    throttleRef.current = 1;
    brakeRef.current = 0;
  }, []);

  const handleBrake = useCallback((e) => {
    e.preventDefault();
    brakeRef.current = 1;
    throttleRef.current = 0;
  }, []);

  const handleThrottleEnd = useCallback((e) => {
    e.preventDefault();
    throttleRef.current = 0;
  }, []);

  const handleBrakeEnd = useCallback((e) => {
    e.preventDefault();
    brakeRef.current = 0;
  }, []);

  const handleConnect = useCallback(() => {
    joinRoom(inputCode);
  }, [joinRoom, inputCode]);

  return (
    <div className="controller-view">
      <div className="controller-header">
        <input
          type="text"
          placeholder="Room code"
          value={inputCode}
          onChange={(e) => setInputCode(e.target.value.toUpperCase().slice(0, 6))}
          maxLength={6}
          className="room-input"
        />
        <button onClick={handleConnect} disabled={connectionStatus === 'connecting'} className="connect-btn">
          {connectionStatus === 'connecting' ? 'Connecting...' : 'Connect'}
        </button>
        <span className={`status status-${connectionStatus}`}>
          {connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'connecting' ? '...' : 'Disconnected'}
        </span>
        {errorMessage && <span className="error">{errorMessage}</span>}
        <span className="speed-display">{Math.round(speed * 3.6)} km/h</span>
      </div>

      <div
        className="touch-zones"
        onTouchMove={(e) => e.preventDefault()}
        onTouchStart={(e) => e.preventDefault()}
      >
        <div
          className="zone steer-area"
          onTouchStart={handleSteerTouch}
          onTouchMove={handleSteerTouch}
          onTouchEnd={handleSteerEnd}
          onTouchCancel={handleSteerEnd}
        />
        <div
          className="zone throttle"
          onTouchStart={handleThrottle}
          onTouchEnd={handleThrottleEnd}
          onTouchCancel={handleThrottleEnd}
        />
        <div
          className="zone brake"
          onTouchStart={handleBrake}
          onTouchEnd={handleBrakeEnd}
          onTouchCancel={handleBrakeEnd}
        />
      </div>
    </div>
  );
}
