import { useState, useRef, useEffect, useCallback } from 'react';
import { createGameEngine } from '../game/GameEngine';
import { MAX_RPM } from '../game/gearbox';
import { useControllerSync } from '../networking/useControllerSync';
import { DevToolsPanel } from '../components/DevToolsPanel';
import { MiniMap } from '../components/MiniMap';
import { CarStatus } from '../components/CarStatus';
import { playClickSound } from '../ui/clickSound';
import { TRACK_LIST } from '../game/tracks/index';
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

function formatGap(ms) {
  if (ms == null || ms === 0) return 'Interval';
  const abs = Math.abs(ms);
  const sec = Math.floor(abs / 1000);
  const millis = Math.floor(abs % 1000);
  return `+${sec}.${String(millis).padStart(3, '0')}`;
}

const TOTAL_LAPS = 5;
const N_TRACK_PTS = 800;

export function GameView() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const setDroneViewRef = useRef(null);
  const setRacingLineRef = useRef(null);
  const setCornerLabelsRef = useRef(null);
  const [racingLineVisible, setRacingLineVisible] = useState(false);
  const [speed, setSpeed] = useState(0);
  const [gear, setGear] = useState(1);
  const [rpm, setRpm] = useState(0);
  const { createRoom, getInput, sendState, roomCode, connectionStatus, errorMessage, onRestartRef } = useControllerSync();

  const [gameMode, setGameMode] = useState(null);
  const gameModeRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(true);
  const menuOpenRef = useRef(true);
  const [raceState, setRaceState] = useState('idle');
  const [lightsState, setLightsState] = useState(0);
  const [lightsVisible, setLightsVisible] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [lastLap, setLastLap] = useState(null);
  const [bestLap, setBestLap] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [carPosition, setCarPosition] = useState(null);
  const [ghostPosition, setGhostPosition] = useState(null);
  const [rivalPosition, setRivalPosition] = useState(null);
  const [inDrsZone, setInDrsZone] = useState(false);
  const [drsActive, setDrsActive] = useState(false);
  const [currentLap, setCurrentLap] = useState(0);
  const [totalRaceTime, setTotalRaceTime] = useState(null);
  const [damage, setDamage] = useState(0);
  const [carDestroyed, setCarDestroyed] = useState(false);

  const [selectedTrack, setSelectedTrack] = useState('monaco');
  const selectedTrackRef = useRef('monaco');
  const [menuStep, setMenuStep] = useState('track');

  const rivalLapRef = useRef(0);
  const rivalRaceFinishedRef = useRef(false);
  const [rivalTotalTime, setRivalTotalTime] = useState(null);
  const [winner, setWinner] = useState(null);

  const [leaderboard, setLeaderboard] = useState([
    { name: 'Me', position: 1, gap: null },
    { name: 'Rival', position: 2, gap: null },
  ]);

  const lapStartRef = useRef(null);
  const raceStateRef = useRef('idle');
  const countdownTimersRef = useRef([]);
  const inputBlockedRef = useRef(false);
  const lastTapRef = useRef({ time: 0, x: 0, y: 0 });
  const ghostRecordingRef = useRef([]);
  const ghostDataRef = useRef(null);
  const ghostVisibleRef = useRef(true);
  const toastTimerRef = useRef(null);
  const currentLapRef = useRef(0);
  const raceStartTimeRef = useRef(null);
  const rivalLapStartRef = useRef(null);
  const [trackPts, setTrackPts] = useState(null);

  const playerLastCrossTimeRef = useRef(null);
  const rivalLastCrossTimeRef = useRef(null);
  const lastGapRef = useRef(0);

  const inputWasBlockedBeforeMenuRef = useRef(false);

  useEffect(() => {
    raceStateRef.current = raceState;
  }, [raceState]);

  useEffect(() => {
    gameModeRef.current = gameMode;
  }, [gameMode]);

  useEffect(() => {
    menuOpenRef.current = menuOpen;
  }, [menuOpen]);

  const wrappedGetInput = useCallback(() => {
    if (inputBlockedRef.current) return { steer: 0, throttle: 0, brake: 0 };
    return getInput ? getInput() : { steer: 0, throttle: 0, brake: 0 };
  }, [getInput]);

  useEffect(() => {
    if (!canvasRef.current || gameMode === null) return;

    const engine = createGameEngine(canvasRef, wrappedGetInput, {
      mode: gameMode,
      trackId: selectedTrackRef.current,
      onTick: (s) => {
        setSpeed(s.speed);
        setGear(s.gear);
        setRpm(s.rpm);
        sendState(s);
        if (s.carPos) setCarPosition(s.carPos);
        setGhostPosition(s.ghostPos ?? null);
        if (s.rivalPos) setRivalPosition(s.rivalPos);
        setInDrsZone(!!s.inDrsZone);
        setDrsActive(!!s.drsActive);
        if (s.damage != null) setDamage(s.damage);

        if (raceStateRef.current === 'racing' && (s.damage >= 1.0 || s.carWrecked)) {
          setRaceState('finished');
          raceStateRef.current = 'finished';
          inputBlockedRef.current = true;
          setCarDestroyed(true);
          setElapsed(0);
          if (gameModeRef.current === 'rival' && !rivalRaceFinishedRef.current) {
            setWinner('Rival');
          }
        }

        if (raceStateRef.current === 'racing' && s.carPos && s.carQuat && gameModeRef.current === 'timeTrial') {
          ghostRecordingRef.current.push({
            x: s.carPos.x, y: s.carPos.y, z: s.carPos.z,
            qx: s.carQuat.x, qy: s.carQuat.y, qz: s.carQuat.z, qw: s.carQuat.w,
          });
        }

        if (raceStateRef.current === 'racing' && lapStartRef.current != null) {
          setElapsed(performance.now() - lapStartRef.current);
        }

        if (s.crossed && raceStateRef.current === 'racing') {
          const now = performance.now();
          const lapTime = now - lapStartRef.current;
          if (lapTime > 5000) {
            playerLastCrossTimeRef.current = now;

            if (gameModeRef.current === 'timeTrial') {
              const recording = ghostRecordingRef.current;
              setLastLap(lapTime);
              setBestLap(prev => {
                if (prev == null || lapTime < prev) {
                  ghostDataRef.current = recording;
                  engineRef.current?.setGhostData(recording);
                  engineRef.current?.setGhostVisible(true);
                  return lapTime;
                }
                return prev;
              });
              ghostRecordingRef.current = [];
              engineRef.current?.resetGhostPlayback();
            } else {
              setLastLap(lapTime);
              setBestLap(prev => (prev == null || lapTime < prev) ? lapTime : prev);
            }

            if (currentLapRef.current >= TOTAL_LAPS) {
              const total = now - raceStartTimeRef.current;
              setTotalRaceTime(total);
              if (gameModeRef.current === 'rival') {
                if (rivalRaceFinishedRef.current) {
                  setWinner(prev => prev ?? 'Rival');
                } else {
                  setWinner('Me');
                }
              }
              setRaceState('finished');
              raceStateRef.current = 'finished';
              inputBlockedRef.current = true;
              setElapsed(0);
            } else {
              currentLapRef.current += 1;
              setCurrentLap(currentLapRef.current);
              lapStartRef.current = now;
              setElapsed(0);
            }
          }
        }

        if (s.rivalCrossed && raceStateRef.current === 'racing' && gameModeRef.current === 'rival') {
          const now = performance.now();
          const rLapTime = now - (rivalLapStartRef.current ?? raceStartTimeRef.current);
          if (rLapTime > 5000) {
            rivalLastCrossTimeRef.current = now;

            if (rivalLapRef.current >= TOTAL_LAPS) {
              if (!rivalRaceFinishedRef.current) {
                rivalRaceFinishedRef.current = true;
                const rTotal = now - raceStartTimeRef.current;
                setRivalTotalTime(rTotal);
                if (raceStateRef.current !== 'finished') {
                  setWinner(prev => prev ?? 'Rival');
                  setRaceState('finished');
                  raceStateRef.current = 'finished';
                  inputBlockedRef.current = true;
                  setElapsed(0);
                }
              }
            } else {
              rivalLapRef.current += 1;
              rivalLapStartRef.current = now;
            }
          }
        }

        if (gameModeRef.current === 'rival' && raceStateRef.current === 'racing') {
          const playerProgress = (currentLapRef.current - 1) * N_TRACK_PTS + (s.trackIdx ?? 0);
          const rivalProgress = (rivalLapRef.current - 1) * N_TRACK_PTS + (s.rivalTrackIdx ?? 0);

          const playerLead = playerProgress >= rivalProgress;

          const progressDiff = Math.abs(playerProgress - rivalProgress);
          const leaderSpeed = playerLead ? (Math.abs(s.speed) || 1) : (Math.abs(s.rivalSpeed) || 1);
          const avgPointDist = 3.5;
          const gapMs = (progressDiff * avgPointDist / leaderSpeed) * 1000;

          const smoothGap = lastGapRef.current * 0.9 + gapMs * 0.1;
          lastGapRef.current = smoothGap;

          if (playerLead) {
            setLeaderboard([
              { name: 'Me', position: 1, gap: null },
              { name: 'Rival', position: 2, gap: smoothGap },
            ]);
          } else {
            setLeaderboard([
              { name: 'Rival', position: 1, gap: null },
              { name: 'Me', position: 2, gap: smoothGap },
            ]);
          }
        }
      },
    });
    engineRef.current = engine;
    setDroneViewRef.current = engine.setDroneView;
    setRacingLineRef.current = engine.setRacingLineVisible;
    setCornerLabelsRef.current = engine.setCornerLabelsVisible;
    setTrackPts(engine.trackPts);
    engine.start();
    return () => engine.stop();
  }, [gameMode, wrappedGetInput, sendState]);

  const startCountdown = useCallback(() => {
    if (gameModeRef.current === null) return;
    countdownTimersRef.current.forEach(clearTimeout);
    countdownTimersRef.current = [];

    const engine = engineRef.current;
    if (!engine) return;

    engine.resetCar();
    engine.resetDamage();
    setDamage(0);
    setCarDestroyed(false);
    inputBlockedRef.current = true;

    if (gameModeRef.current === 'timeTrial') {
      ghostRecordingRef.current = [];
      ghostDataRef.current = null;
      ghostVisibleRef.current = true;
      engine.setGhostData(null);
      engine.setGhostVisible(false);
      engine.resetGhostPlayback();
      engine.setGhostPaused(true);
    }

    if (gameModeRef.current === 'rival') {
      engine.resetRivalCar();
      engine.setRivalInputPaused(true);
      rivalLapRef.current = 1;
      rivalRaceFinishedRef.current = false;
      setRivalTotalTime(null);
      setWinner(null);
      playerLastCrossTimeRef.current = null;
      rivalLastCrossTimeRef.current = null;
      lastGapRef.current = 0;
      setLeaderboard([
        { name: 'Me', position: 1, gap: null },
        { name: 'Rival', position: 2, gap: null },
      ]);
    }

    currentLapRef.current = 1;
    setCurrentLap(1);
    setTotalRaceTime(null);
    setRaceState('countdown');
    setElapsed(0);
    setLastLap(null);
    setBestLap(null);
    setLightsState(0);
    setLightsVisible(true);

    const timers = [];
    for (let i = 1; i <= 5; i++) {
      timers.push(setTimeout(() => setLightsState(i), i * 1000));
    }
    const randomDelay = 200 + Math.random() * 800;
    timers.push(setTimeout(() => {
      setLightsState(6);
      setRaceState('racing');
      inputBlockedRef.current = false;
      const now = performance.now();
      lapStartRef.current = now;
      raceStartTimeRef.current = now;
      rivalLapStartRef.current = now;
      if (gameModeRef.current === 'timeTrial') {
        engineRef.current?.setGhostPaused(false);
      }
      if (gameModeRef.current === 'rival') {
        engineRef.current?.setRivalInputPaused(false);
      }
      setTimeout(() => setLightsVisible(false), 1200);
    }, 5000 + randomDelay));

    countdownTimersRef.current = timers;
  }, []);

  const openMenu = useCallback(() => {
    inputWasBlockedBeforeMenuRef.current = inputBlockedRef.current;
    inputBlockedRef.current = true;
    engineRef.current?.setRivalInputPaused(true);
    setMenuOpen(true);
    menuOpenRef.current = true;
  }, []);

  const closeMenu = useCallback(() => {
    if (gameModeRef.current === null) return;
    setMenuOpen(false);
    menuOpenRef.current = false;
    inputBlockedRef.current = inputWasBlockedBeforeMenuRef.current;
    if (raceStateRef.current === 'racing' && gameModeRef.current === 'rival') {
      engineRef.current?.setRivalInputPaused(false);
    }
  }, []);

  const selectMode = useCallback((mode) => {
    setGameMode(mode);
    gameModeRef.current = mode;
    setRaceState('idle');
    raceStateRef.current = 'idle';
    setMenuOpen(false);
    menuOpenRef.current = false;
  }, []);

  const switchMode = useCallback((newMode) => {
    setGameMode(null);
    gameModeRef.current = null;
    setRaceState('idle');
    raceStateRef.current = 'idle';
    inputBlockedRef.current = false;
    setSpeed(0);
    setGear(1);
    setRpm(0);
    setElapsed(0);
    setLastLap(null);
    setBestLap(null);
    setCurrentLap(0);
    setTotalRaceTime(null);
    setDamage(0);
    setCarDestroyed(false);
    setWinner(null);
    setRivalTotalTime(null);
    setLightsVisible(false);
    lastGapRef.current = 0;
    countdownTimersRef.current.forEach(clearTimeout);
    countdownTimersRef.current = [];
    setTimeout(() => {
      setGameMode(newMode);
      gameModeRef.current = newMode;
      setMenuOpen(false);
      menuOpenRef.current = false;
    }, 0);
  }, []);

  const handleTrackSelect = useCallback((trackId) => {
    playClickSound();
    setSelectedTrack(trackId);
    selectedTrackRef.current = trackId;
    setMenuStep('mode');
  }, []);

  const handleModeSelect = useCallback((mode) => {
    playClickSound();
    setMenuStep('track');
    const needsNewEngine = gameModeRef.current !== null;
    if (needsNewEngine) {
      switchMode(mode);
    } else {
      selectMode(mode);
    }
  }, [switchMode, selectMode]);

  const handleBackToTracks = useCallback(() => {
    playClickSound();
    setMenuStep('track');
  }, []);

  useEffect(() => {
    onRestartRef.current = startCountdown;
  }, [startCountdown, onRestartRef]);

  useEffect(() => {
    if (gameMode !== null && engineRef.current) {
      const timer = setTimeout(() => startCountdown(), 100);
      return () => clearTimeout(timer);
    }
  }, [gameMode, startCountdown]);

  const showToast = useCallback((msg) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 3000);
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (menuOpenRef.current && gameModeRef.current !== null) {
          playClickSound();
          closeMenu();
        } else if (!menuOpenRef.current && gameModeRef.current !== null) {
          playClickSound();
          openMenu();
        }
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        if (menuOpenRef.current && gameModeRef.current !== null) {
          playClickSound();
          setMenuOpen(false);
          menuOpenRef.current = false;
          startCountdown();
        } else if (!menuOpenRef.current && gameModeRef.current !== null) {
          playClickSound();
          startCountdown();
        }
        return;
      }
      if (e.key === 'g' || e.key === 'G') {
        if (gameModeRef.current !== 'timeTrial' || menuOpenRef.current) return;
        if (!ghostDataRef.current) {
          showToast('Complete a lap to see the ghost car');
          return;
        }
        ghostVisibleRef.current = !ghostVisibleRef.current;
        engineRef.current?.setGhostVisible(ghostVisibleRef.current);
        showToast(ghostVisibleRef.current ? 'Ghost car ON' : 'Ghost car OFF');
      }
      if (e.key === 'o' || e.key === 'O') {
        if (!menuOpenRef.current) engineRef.current?.activateDrs();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [startCountdown, openMenu, closeMenu, showToast]);

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
      if (gameModeRef.current === null || menuOpenRef.current) return;
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

  const isRivalMode = gameMode === 'rival';
  const playerMaxLap = Math.min(currentLap, TOTAL_LAPS);

  const hasActiveGame = gameMode !== null;

  return (
    <div className="game-view">
      {menuOpen && (
        <div className="game-menu">
          <div className="menu-content">
            <h1 className="menu-title">PHORMULA ONE</h1>
            <p className="menu-subtitle">5 Laps</p>

            {hasActiveGame ? (
              <div className="menu-options">
                {gameMode === 'timeTrial' ? (
                  <div className="menu-card-stack">
                    <button className="menu-card menu-card-half" type="button" onClick={closeMenu}>
                      <span className="menu-card-title">Resume</span>
                    </button>
                    <button className="menu-card menu-card-half" type="button" onClick={() => { setMenuOpen(false); menuOpenRef.current = false; startCountdown(); }}>
                      <span className="menu-card-title">Restart</span>
                    </button>
                  </div>
                ) : (
                  <div className="menu-card-stack">
                    <button className="menu-card menu-card-half" type="button" onClick={closeMenu}>
                      <span className="menu-card-title">Resume</span>
                    </button>
                    <button className="menu-card menu-card-half" type="button" onClick={() => { setMenuOpen(false); menuOpenRef.current = false; startCountdown(); }}>
                      <span className="menu-card-title">Restart</span>
                    </button>
                  </div>
                )}
                <button className="menu-card" type="button" onClick={() => { setMenuStep('track'); setGameMode(null); gameModeRef.current = null; }}>
                  <span className="menu-card-title">New Race</span>
                  <span className="menu-card-desc">Pick a different track or mode</span>
                </button>
              </div>
            ) : menuStep === 'track' ? (
              <>
                <p className="menu-step-label">Choose your track</p>
                <div className="menu-tracks">
                  {TRACK_LIST.map((track) => (
                    <button
                      key={track.id}
                      className={`track-card${selectedTrack === track.id ? ' track-card-selected' : ''}`}
                      type="button"
                      onClick={() => handleTrackSelect(track.id)}
                      style={{ '--track-color': track.themeColor }}
                    >
                      <span className="track-card-icon">{track.icon}</span>
                      <span className="track-card-name">{track.name}</span>
                      <span className="track-card-desc">{track.description}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="menu-step-label">Choose race type</p>
                <div className="menu-options">
                  <button className="menu-card" type="button" onClick={() => handleModeSelect('timeTrial')}>
                    <span className="menu-card-icon">&#128337;</span>
                    <span className="menu-card-title">On My Own</span>
                    <span className="menu-card-desc">Try to get the fastest lap, race against your ghost car</span>
                  </button>
                  <button className="menu-card" type="button" onClick={() => handleModeSelect('rival')}>
                    <span className="menu-card-icon">&#127937;</span>
                    <span className="menu-card-title">Against a Rival</span>
                    <span className="menu-card-desc">Race against another car head to head</span>
                  </button>
                </div>
                <button className="menu-back-btn" type="button" onClick={handleBackToTracks}>
                  Back to tracks
                </button>
              </>
            )}

            <p className="menu-hint">
              {hasActiveGame ? 'Esc to resume \u00b7 Space to restart' : 'Select a track to begin'}
            </p>
          </div>
        </div>
      )}

      {gameMode !== null && (
        <>
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
            <div className="overlay-right">
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
              <DevToolsPanel
                onToggleDroneView={(v) => setDroneViewRef.current?.(v)}
                onOpenChange={(v) => setCornerLabelsRef.current?.(v)}
              />
            </div>
          </div>

          <div className="timing-hud">
            <div className="timer">{formatTime(elapsed)}</div>
            {bestLap != null && (
              <div className="best-lap">
                <span className="lap-label">Best</span>
                <span className="lap-time">{formatTime(bestLap)}</span>
              </div>
            )}
            {lastLap != null && (
              <div className="last-lap">
                <span className="lap-label">Last</span>
                <span className="lap-time">{formatTime(lastLap)}</span>
                {delta && (
                  <span className={`lap-delta ${delta.isFaster ? 'faster' : 'slower'}`}>
                    {delta.text}
                  </span>
                )}
              </div>
            )}
          </div>

          {!isRivalMode && currentLap > 0 && raceState !== 'idle' && (
            <div className="lap-counter">LAP {playerMaxLap}/{TOTAL_LAPS}</div>
          )}

          {isRivalMode && raceState !== 'idle' && (
            <div className="leaderboard">
              <div className="leaderboard-header">
                <span className="leaderboard-title">RACE</span>
                <span className="leaderboard-lap">LAP {playerMaxLap}/{TOTAL_LAPS}</span>
              </div>
              {leaderboard.map((entry, i) => (
                <div key={entry.name} className={`leaderboard-row${entry.name === 'Me' ? ' leaderboard-me' : ''}`}>
                  <span className="lb-pos">{i + 1}</span>
                  <span className="lb-name">{entry.name}</span>
                  <span className="lb-gap">{entry.gap == null ? 'Interval' : formatGap(entry.gap)}</span>
                </div>
              ))}
            </div>
          )}

          {raceState === 'finished' && !menuOpen && (
            <div className="start-hint">
              {carDestroyed ? (
                <>
                  <div className="finish-title">Car Destroyed</div>
                  <div className="finish-restart">Press Space to restart &middot; Esc for menu</div>
                </>
              ) : isRivalMode ? (
                <>
                  <div className={`finish-title ${winner === 'Me' ? 'finish-win' : 'finish-lose'}`}>
                    {winner === 'Me' ? 'You Win!' : 'Rival Wins!'}
                  </div>
                  {totalRaceTime != null && <div className="finish-total">Your Time: {formatTime(totalRaceTime)}</div>}
                  {rivalTotalTime != null && <div className="finish-total">Rival Time: {formatTime(rivalTotalTime)}</div>}
                  {bestLap != null && <div className="finish-best">Best Lap: {formatTime(bestLap)}</div>}
                  <div className="finish-restart">Press Space to restart &middot; Esc for menu</div>
                </>
              ) : (
                <>
                  <div className="finish-title">Race Complete</div>
                  <div className="finish-total">Total: {formatTime(totalRaceTime)}</div>
                  {bestLap != null && <div className="finish-best">Best Lap: {formatTime(bestLap)}</div>}
                  <div className="finish-restart">Press Space to restart &middot; Esc for menu</div>
                </>
              )}
            </div>
          )}

          {lightsVisible && (
            <div className={`f1-lights${lightsState === 6 ? ' f1-lights-out' : ''}`}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className={`f1-light${lightsState >= i + 1 && lightsState < 6 ? ' lit' : ''}`}
                />
              ))}
            </div>
          )}

          <div className="speed-display">
            <div className={`drs-banner${inDrsZone ? ' drs-visible' : ''}${drsActive ? ' drs-active' : ''}`}>
              {drsActive ? 'DRS ACTIVE' : 'DRS ZONE (press O)'}
            </div>
            <span className="speed-gear">{gear === 'R' ? 'R' : `G${gear}`}</span>
            <div className="speed-main">
              <span className="speed-value">{Math.round(Math.abs(speed) * 3.6)}</span>
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
          <div className="bottom-right-panel">
            <CarStatus damage={damage} />
            {trackPts && (
              <MiniMap
                trackPts={trackPts}
                carPosition={carPosition}
                ghostPosition={isRivalMode ? null : ghostPosition}
                rivalPosition={isRivalMode ? rivalPosition : null}
              />
            )}
          </div>

          {toastMessage && (
            <div className="toast" key={toastMessage}>{toastMessage}</div>
          )}
        </>
      )}
      <canvas ref={canvasRef} className="game-canvas" />
    </div>
  );
}
