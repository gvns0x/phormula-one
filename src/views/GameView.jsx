import { useState, useRef, useEffect } from 'react';
import { createGameEngine } from '../game/GameEngine';
import { useControllerSync } from '../networking/useControllerSync';
import { DevToolsPanel } from '../components/DevToolsPanel';
import './GameView.css';

export function GameView() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const [speed, setSpeed] = useState(0);
  const { createRoom, getInput, sendState, roomCode, connectionStatus, errorMessage } = useControllerSync();

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = createGameEngine(canvasRef, getInput, {
      onTick: (s) => {
        setSpeed(s.speed);
        sendState(s);
      },
    });
    engineRef.current = engine;
    engine.start();
    return () => engine.stop();
  }, [getInput, sendState]);

  return (
    <div className="game-view">
      <div className="game-overlay">
        <div className="room-section">
          {!roomCode ? (
            <button className="btn-create" onClick={createRoom} type="button">
              Create room
            </button>
          ) : (
            <div className="room-info">
              <span className="room-label">Room</span>
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
        <DevToolsPanel />
      </div>
      <div className="speed-display">{Math.round(speed * 3.6)} km/h</div>
      <canvas ref={canvasRef} className="game-canvas" />
    </div>
  );
}
