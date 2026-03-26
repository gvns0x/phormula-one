import { useState, useRef, useEffect, useCallback } from 'react';
import { createGameEngine } from '../game/GameEngine';
import { MAX_RPM } from '../game/gearbox';
import { useControllerSync } from '../networking/useControllerSync';
import { DevToolsPanel } from '../components/DevToolsPanel';
import { MiniMap } from '../components/MiniMap';
import { CarStatus } from '../components/CarStatus';
import { MenuButton } from '../components/MenuButton';
import { playClickSound } from '../ui/clickSound';
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
const LAP_OVERLAY_MAX_TILT_DEG = 8;
const LAP_OVERLAY_SMOOTHING = 0.15;
const HIT_FLASH_MIN_DAMAGE_DELTA = 0.001;
const CONTROLLER_CONNECT_URL_PLACEHOLDER = 'https://example.com/controller';

function getDamageFlashColor(damageValue) {
  const d = Math.max(0, Math.min(damageValue ?? 0, 1));
  // Keep hit feedback in warm tones only: orange -> red (no green flash).
  const hue = 30 * (1 - d);
  return `hsl(${hue}, 100%, 50%)`;
}

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

  const [gameMode, setGameMode] = useState('timeTrial');
  const gameModeRef = useRef(null);
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
  const [lapTimes, setLapTimes] = useState(() => Array(TOTAL_LAPS).fill(null));
  const [totalRaceTime, setTotalRaceTime] = useState(null);
  const [damage, setDamage] = useState(0);
  const [damageFlash, setDamageFlash] = useState(null);
  const [carDestroyed, setCarDestroyed] = useState(false);
  const [lapOverlayTilt, setLapOverlayTilt] = useState(0);

  const selectedTrackRef = useRef('monaco');
  const [overlayMenuOpen, setOverlayMenuOpen] = useState(true);
  const [raceHudVisible, setRaceHudVisible] = useState(false);
  const [startRaceCtaExiting, setStartRaceCtaExiting] = useState(false);

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
  const startRaceCtaTimerRef = useRef(null);
  const currentLapRef = useRef(0);
  const raceStartTimeRef = useRef(null);
  const rivalLapStartRef = useRef(null);
  const [trackPts, setTrackPts] = useState(null);

  const playerLastCrossTimeRef = useRef(null);
  const rivalLastCrossTimeRef = useRef(null);
  const lastGapRef = useRef(0);
  const lapOverlayTiltRef = useRef(0);
  const lastDamageRef = useRef(0);

  const inputWasBlockedBeforeMenuRef = useRef(false);
  const menuPauseStartedAtRef = useRef(null);
  const menuPausedRaceRef = useRef(false);

  useEffect(() => {
    raceStateRef.current = raceState;
  }, [raceState]);

  useEffect(() => {
    gameModeRef.current = gameMode;
  }, [gameMode]);

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
        const tiltEligible =
          gameModeRef.current !== 'rival' &&
          !inputBlockedRef.current;
        const targetTilt = tiltEligible
          ? Math.max(
              -LAP_OVERLAY_MAX_TILT_DEG,
              Math.min(LAP_OVERLAY_MAX_TILT_DEG, (s.steerInput ?? 0) * LAP_OVERLAY_MAX_TILT_DEG)
            )
          : 0;
        let nextTilt = lapOverlayTiltRef.current * (1 - LAP_OVERLAY_SMOOTHING) + targetTilt * LAP_OVERLAY_SMOOTHING;
        if (Math.abs(nextTilt) < 0.01) nextTilt = 0;
        lapOverlayTiltRef.current = nextTilt;
        setLapOverlayTilt(nextTilt);

        setSpeed(s.speed);
        setGear(s.gear);
        setRpm(s.rpm);
        sendState(s);
        if (s.carPos) setCarPosition(s.carPos);
        setGhostPosition(s.ghostPos ?? null);
        if (s.rivalPos) setRivalPosition(s.rivalPos);
        setInDrsZone(!!s.inDrsZone);
        setDrsActive(!!s.drsActive);
        if (s.damage != null) {
          const clampedDamage = Math.max(0, Math.min(s.damage, 1));
          const shouldFlash =
            raceStateRef.current === 'racing' &&
            clampedDamage - lastDamageRef.current > HIT_FLASH_MIN_DAMAGE_DELTA;
          if (shouldFlash) {
            setDamageFlash({
              key: performance.now(),
              color: getDamageFlashColor(clampedDamage),
            });
          }
          lastDamageRef.current = clampedDamage;
          setDamage(clampedDamage);
        }

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
            const completedLapIdx = currentLapRef.current - 1;
            setLapTimes(prev => {
              if (completedLapIdx < 0 || completedLapIdx >= prev.length) return prev;
              const next = [...prev];
              next[completedLapIdx] = lapTime;
              return next;
            });

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
    setOverlayMenuOpen(false);
    countdownTimersRef.current.forEach(clearTimeout);
    countdownTimersRef.current = [];

    const engine = engineRef.current;
    if (!engine) return;

    engine.setPaused(false);
    menuPauseStartedAtRef.current = null;
    menuPausedRaceRef.current = false;
    engine.resetCar();
    engine.resetDamage();
    setDamage(0);
    lastDamageRef.current = 0;
    setDamageFlash(null);
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
    setRaceHudVisible(true);
    setCurrentLap(1);
    setLapTimes(Array(TOTAL_LAPS).fill(null));
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

  const pauseForOverlayMenu = useCallback(() => {
    if (raceStateRef.current !== 'racing') return;
    if (menuPauseStartedAtRef.current != null) return;
    inputWasBlockedBeforeMenuRef.current = inputBlockedRef.current;
    inputBlockedRef.current = true;
    menuPauseStartedAtRef.current = performance.now();
    menuPausedRaceRef.current = true;
    engineRef.current?.setPaused(true);
    engineRef.current?.setGhostPaused(true);
    if (gameModeRef.current === 'rival') {
      engineRef.current?.setRivalInputPaused(true);
    }
  }, []);

  const resumeFromOverlayMenu = useCallback(() => {
    const startedAt = menuPauseStartedAtRef.current;
    if (!menuPausedRaceRef.current || startedAt == null) return;
    const pausedDuration = Math.max(0, performance.now() - startedAt);
    if (lapStartRef.current != null) lapStartRef.current += pausedDuration;
    if (raceStartTimeRef.current != null) raceStartTimeRef.current += pausedDuration;
    if (rivalLapStartRef.current != null) rivalLapStartRef.current += pausedDuration;
    inputBlockedRef.current = inputWasBlockedBeforeMenuRef.current;
    menuPauseStartedAtRef.current = null;
    menuPausedRaceRef.current = false;
    engineRef.current?.setPaused(false);
    if (raceStateRef.current === 'racing') {
      if (gameModeRef.current === 'timeTrial') {
        engineRef.current?.setGhostPaused(false);
      }
      if (gameModeRef.current === 'rival') {
        engineRef.current?.setRivalInputPaused(false);
      }
    }
  }, []);

  useEffect(() => {
    onRestartRef.current = startCountdown;
  }, [startCountdown, onRestartRef]);

  const showToast = useCallback((msg) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 3000);
  }, []);

  const handleOverlayMenuRestart = useCallback(() => {
    resumeFromOverlayMenu();
    setOverlayMenuOpen(false);
    startCountdown();
  }, [resumeFromOverlayMenu, startCountdown]);

  const handleOverlayMenuResume = useCallback(() => {
    setOverlayMenuOpen(false);
    resumeFromOverlayMenu();
  }, [resumeFromOverlayMenu]);

  const handleStartLapRace = useCallback(() => {
    playClickSound();
    setStartRaceCtaExiting(true);
    if (startRaceCtaTimerRef.current) clearTimeout(startRaceCtaTimerRef.current);
    startRaceCtaTimerRef.current = setTimeout(() => {
      setOverlayMenuOpen(false);
      setStartRaceCtaExiting(false);
      startCountdown();
    }, 360);
  }, [startCountdown]);

  const handleStartRaceCenterMouseMove = useCallback((e) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * 100) / el.clientWidth;
    const y = ((e.clientY - rect.top) * 100) / el.clientHeight;
    el.style.setProperty('--mouse-x', String(x));
    el.style.setProperty('--mouse-y', String(y));
  }, []);

  const handleStartRaceCenterMouseLeave = useCallback((e) => {
    e.currentTarget.style.setProperty('--mouse-x', '50');
    e.currentTarget.style.setProperty('--mouse-y', '50');
  }, []);

  useEffect(() => {
    if (gameMode === null) {
      setOverlayMenuOpen(false);
      resumeFromOverlayMenu();
    }
  }, [gameMode, resumeFromOverlayMenu]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (gameModeRef.current !== null) {
          playClickSound();
          setOverlayMenuOpen((prev) => {
            const next = !prev;
            if (next) pauseForOverlayMenu();
            else resumeFromOverlayMenu();
            return next;
          });
        }
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        if (gameModeRef.current !== null) {
          playClickSound();
          startCountdown();
        }
        return;
      }
      if (e.key === 'g' || e.key === 'G') {
        if (gameModeRef.current !== 'timeTrial' || overlayMenuOpen) return;
        if (!ghostDataRef.current) {
          showToast('Complete a lap to see the ghost car');
          return;
        }
        ghostVisibleRef.current = !ghostVisibleRef.current;
        engineRef.current?.setGhostVisible(ghostVisibleRef.current);
        showToast(ghostVisibleRef.current ? 'Ghost car ON' : 'Ghost car OFF');
      }
      if (e.key === 'x' || e.key === 'X') {
        if (!overlayMenuOpen) engineRef.current?.activateDrs();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [overlayMenuOpen, pauseForOverlayMenu, resumeFromOverlayMenu, startCountdown, showToast]);

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
      if (gameModeRef.current === null || overlayMenuOpen) return;
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
  }, [overlayMenuOpen, startCountdown]);

  useEffect(() => {
    return () => {
      if (startRaceCtaTimerRef.current) clearTimeout(startRaceCtaTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!overlayMenuOpen || roomCode) return;
    createRoom();
  }, [overlayMenuOpen, roomCode, createRoom]);

  useEffect(() => {
    return () => countdownTimersRef.current.forEach(clearTimeout);
  }, []);

  const delta = formatDelta(lastLap, bestLap);
  const rpmFraction = Math.max(0, Math.min(rpm / MAX_RPM, 1));
  const rpmSegments = 8;
  const activeSegments = Math.round(rpmFraction * rpmSegments);

  const isRivalMode = gameMode === 'rival';
  const playerMaxLap = Math.min(currentLap, TOTAL_LAPS);
  const fastestLapTime = lapTimes.reduce((fastest, lapTime) => {
    if (lapTime == null) return fastest;
    if (fastest == null || lapTime < fastest) return lapTime;
    return fastest;
  }, null);

  const showRaceHud = raceHudVisible && gameMode !== null;

  return (
    <div className="game-view">
      {gameMode !== null && (
        <>
          {damageFlash && (
            <div
              key={damageFlash.key}
              className="damage-hit-flash"
              style={{ '--damage-hit-color': damageFlash.color }}
              aria-hidden="true"
            />
          )}
          <div className="game-overlay">
            <div className="room-section">
              <MenuButton
                onClick={() => {
                  setOverlayMenuOpen((prev) => {
                    const next = !prev;
                    if (next) pauseForOverlayMenu();
                    else resumeFromOverlayMenu();
                    return next;
                  });
                }}
                aria-expanded={overlayMenuOpen}
              >
                {overlayMenuOpen ? 'Close' : 'Menu'}
              </MenuButton>
            </div>
            <div className={`connection-status status-${connectionStatus}`}>
              {connectionStatus === 'disconnected' && 'Waiting for controller'}
              {connectionStatus === 'connecting' && 'Connecting...'}
              {connectionStatus === 'connected' && 'Connected'}
              {connectionStatus === 'error' && (errorMessage || 'Error')}
            </div>
            <div className="overlay-right">
              {/* <button
                className={`btn-racing-line${racingLineVisible ? ' active' : ''}`}
                type="button"
                onClick={() => {
                  const next = !racingLineVisible;
                  setRacingLineVisible(next);
                  setRacingLineRef.current?.(next);
                }}
              >
                Racing Line
              </button> */}
              <DevToolsPanel
                onToggleDroneView={(v) => setDroneViewRef.current?.(v)}
                onOpenChange={(v) => setCornerLabelsRef.current?.(v)}
              />
            </div>
          </div>

          {overlayMenuOpen && (
            <div className="race-menu-backdrop" role="dialog" aria-modal="true" aria-label="Race menu">
              <div className="race-menu-modal">
                <div className="race-menu-panel">
                  <div className="race-menu-top">
                    <section className="menu-info-card controls-card" aria-label="Keyboard controls">
                      <h2 className="menu-card-title">Keyboard Controls</h2>
                      <ul className="controls-list">
                        <li className="controls-item">
                          <span className="controls-key-row">
                            <kbd className="keycap">Left</kbd>
                            <kbd className="keycap">Right</kbd>
                          </span>
                          <span className="controls-action">Steer</span>
                        </li>
                        <li className="controls-item">
                          <span className="controls-key-row">
                            <kbd className="keycap">Up</kbd>
                          </span>
                          <span className="controls-action">Throttle</span>
                        </li>
                        <li className="controls-item">
                          <span className="controls-key-row">
                            <kbd className="keycap">Down</kbd>
                          </span>
                          <span className="controls-action">Brake / Reverse</span>
                        </li>
                        <li className="controls-item">
                          <span className="controls-key-row">
                            <kbd className="keycap">X</kbd>
                          </span>
                          <span className="controls-action">Activate DRS in DRS zone</span>
                        </li>
                      </ul>
                    </section>
                    <section className="menu-info-card room-info" aria-label="Phone connection">
                      <div className="room-header">
                        <h2 className="menu-card-title">Connect Phone</h2>
                        <MenuButton className="room-refresh-btn" onClick={createRoom}>
                          Refresh code
                        </MenuButton>
                      </div>
                      <span className="room-label">Enter this code</span>
                      <span className="room-code">{roomCode || '----'}</span>
                      <span className="room-link">{CONTROLLER_CONNECT_URL_PLACEHOLDER}</span>
                      <div className="room-qr-placeholder">QR code placeholder</div>
                    </section>
                  </div>
                  {raceHudVisible && (
                    <div className="race-menu-actions">
                      <MenuButton className="race-menu-action-btn" onClick={handleOverlayMenuRestart}>
                        Restart
                      </MenuButton>
                      <MenuButton className="race-menu-action-btn" onClick={handleOverlayMenuResume}>
                        Resume
                      </MenuButton>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {showRaceHud && (
            <div className="timing-hud">
              <div className="timer">{formatTime(elapsed)}</div>
              {bestLap != null && (
                <div className="best-lap">
                  <span className="lap-label">FASTEST</span>
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
          )}

          {!isRivalMode && showRaceHud && currentLap > 0 && raceState !== 'idle' && (
            <>
              <div className="lap-times-overlay-visible">
                <div
                  className="lap-times-overlay"
                  style={{
                    transform: `perspective(1000px) rotateY(${lapOverlayTilt.toFixed(1)}deg) rotateZ(${(lapOverlayTilt * 0.1).toFixed(1)}deg)`,
                  }}
                >
                <div className="lap-counter">
                  <span className="lap-counter-current">LAP {playerMaxLap}</span>
                  <span className="lap-counter-total">/{TOTAL_LAPS}</span>
                </div>
                  {lapTimes.map((lapTime, idx) => {
                    const isFastest = lapTime != null && fastestLapTime != null && lapTime === fastestLapTime;
                    const isActiveLap = currentLap === idx + 1;
                    const hasLapTime = lapTime != null;
                    return (
                      <div key={idx} className="lap-time-row">
                        <span className={`lap-time-index${isActiveLap ? ' is-active' : ' is-inactive'}`}>{idx + 1}</span>
                        <span className={`lap-time-value${hasLapTime ? ' has-time' : ' no-time'}`}>
                          {hasLapTime ? formatTime(lapTime) : 'NO TIME'}
                        </span>
                        <span className={`lap-fastest-badge${isFastest ? ' visible' : ''}`} aria-hidden={!isFastest}>
                          FASTEST
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {isRivalMode && showRaceHud && raceState !== 'idle' && (
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

          {raceState === 'finished' && !overlayMenuOpen && (
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

          {!raceHudVisible && !lightsVisible && (
            <button
              className={`start-race-center${startRaceCtaExiting ? ' exiting' : ''}`}
              type="button"
              onClick={handleStartLapRace}
              onMouseMove={handleStartRaceCenterMouseMove}
              onMouseLeave={handleStartRaceCenterMouseLeave}
              style={{
                transform: `perspective(1000px) translateX(-50%) translateY(${startRaceCtaExiting ? '-10px' : '0px'}) scale(${startRaceCtaExiting ? '0.96' : '1'}) rotateY(${lapOverlayTilt.toFixed(1)}deg) rotateZ(${(lapOverlayTilt * 0.1).toFixed(1)}deg)`,
              }}
              aria-label="Start Lap Race"
            >
              <span className="start-race-center-label">Start Lap Race</span>
            </button>
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
              {drsActive ? 'DRS ACTIVE' : 'DRS ZONE (press X)'}
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
