/**
 * Hook to sync controller input from WebRTC to game engine.
 * Returns { input, connectionStatus, roomCode } for GameView.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createSignalingClient } from './signalingClient';
import { createGamePeer } from './webrtcClient';

const WS_URL = typeof window !== 'undefined'
  ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/signal`
  : 'ws://localhost:3001/signal';

const defaultInput = { steer: 0, throttle: 0, brake: 0, reverse: 0 };

function useKeyboardInput() {
  const kbRef = useRef(defaultInput);
  useEffect(() => {
    const pressed = new Set();

    const update = () => {
      const left = pressed.has('arrowleft') || pressed.has('a');
      const right = pressed.has('arrowright') || pressed.has('d');
      kbRef.current = {
        steer: (left && right) ? 0 : left ? -1 : right ? 1 : 0,
        throttle: (pressed.has('arrowup') || pressed.has('w')) ? 1 : 0,
        brake: (pressed.has('arrowdown') || pressed.has('s')) ? 1 : 0,
      };
    };

    const onKeyDown = (e) => {
      if (e.repeat) return;
      const key = e.key.toLowerCase();
      if (['arrowup','arrowdown','arrowleft','arrowright'].includes(key)) e.preventDefault();
      pressed.add(key);
      update();
    };
    const onKeyUp = (e) => {
      pressed.delete(e.key.toLowerCase());
      update();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);
  return kbRef;
}

export function useControllerSync() {
  const [roomCode, setRoomCode] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // disconnected | connecting | connected | error
  const [errorMessage, setErrorMessage] = useState('');
  const inputRef = useRef(defaultInput);
  const keyboardRef = useKeyboardInput();
  const signalingRef = useRef(null);
  const webrtcRef = useRef(null);
  const createRoom = useCallback(() => {
    const signaling = createSignalingClient(WS_URL);
    const webrtc = createGamePeer(signaling, (msg) => {
      const next = {
        steer: typeof msg.s === 'number' ? msg.s : 0,
        throttle: typeof msg.a === 'number' ? msg.a : 0,
        brake: typeof msg.b === 'number' ? msg.b : 0,
        reverse: typeof msg.r === 'number' ? msg.r : 0,
      };
      inputRef.current = next;
    });

    signalingRef.current = signaling;
    webrtcRef.current = webrtc;

    signaling.on('room-created', ({ roomId }) => {
      setRoomCode(roomId);
      setConnectionStatus('connecting');
    });

    signaling.on('controller-joined', async () => {
      await webrtc.initAsGame();
    });

    signaling.on('peer-left', () => {
      setConnectionStatus('disconnected');
      setRoomCode('');
      inputRef.current = defaultInput;
    });

    signaling.on('error', ({ message }) => {
      setErrorMessage(message);
      setConnectionStatus('error');
    });

    signaling.on('close', () => {
      setConnectionStatus('disconnected');
    });

    signaling.connect().then(() => {
      signaling.createRoom();
    }).catch((err) => {
      setErrorMessage(err?.message || 'Connection failed');
      setConnectionStatus('error');
    });
  }, []);

  useEffect(() => {
    const checkDataChannel = () => {
      if (webrtcRef.current?.isDataChannelOpen) {
        setConnectionStatus('connected');
      }
    };
    const id = setInterval(checkDataChannel, 100);
    return () => clearInterval(id);
  }, [roomCode, connectionStatus]);

  const lastSendRef = useRef(0);
  const sendState = useCallback((obj) => {
    const now = Date.now();
    if (now - lastSendRef.current < 80) return; // ~12 Hz throttle
    lastSendRef.current = now;
    webrtcRef.current?.sendState?.(obj);
  }, []);

  const getInput = useCallback(() => {
    const ctrl = inputRef.current;
    const kb = keyboardRef.current;
    return {
      steer: ctrl.steer !== 0 ? ctrl.steer : kb.steer,
      throttle: Math.max(ctrl.throttle || 0, kb.throttle || 0),
      brake: Math.max(ctrl.brake || 0, kb.brake || 0),
      reverse: ctrl.reverse || 0,
    };
  }, [keyboardRef]);

  const cleanup = useCallback(() => {
    webrtcRef.current?.close();
    signalingRef.current?.disconnect();
    signalingRef.current = null;
    webrtcRef.current = null;
    setRoomCode('');
    setConnectionStatus('disconnected');
    inputRef.current = defaultInput;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  return {
    createRoom,
    getInput,
    sendState,
    roomCode,
    connectionStatus,
    errorMessage,
    cleanup,
  };
}
