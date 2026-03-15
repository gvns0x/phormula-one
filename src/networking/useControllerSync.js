/**
 * Hook to sync controller input from WebRTC to game engine.
 * Returns { input, connectionStatus, roomCode } for GameView.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createSignalingClient } from './signalingClient';
import { createGamePeer } from './webrtcClient';

const WS_URL = `ws://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:3001/ws`;

const defaultInput = { steer: 0, throttle: 0, brake: 0 };

function useKeyboardInput() {
  const kbRef = useRef(defaultInput);
  useEffect(() => {
    const onKeyDown = (e) => {
      const key = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key)) e.preventDefault();
      if (key === 'arrowup' || key === 'w') kbRef.current = { ...kbRef.current, throttle: 1 };
      if (key === 'arrowdown' || key === 's') kbRef.current = { ...kbRef.current, brake: 1 };
      if (key === 'arrowleft' || key === 'a') kbRef.current = { ...kbRef.current, steer: -1 };
      if (key === 'arrowright' || key === 'd') kbRef.current = { ...kbRef.current, steer: 1 };
    };
    const onKeyUp = (e) => {
      const key = e.key.toLowerCase();
      if (key === 'arrowup' || key === 'w') kbRef.current = { ...kbRef.current, throttle: 0 };
      if (key === 'arrowdown' || key === 's') kbRef.current = { ...kbRef.current, brake: 0 };
      if (key === 'arrowleft' || key === 'a') kbRef.current = { ...kbRef.current, steer: 0 };
      if (key === 'arrowright' || key === 'd') kbRef.current = { ...kbRef.current, steer: 0 };
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
