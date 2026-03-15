/**
 * Hook for controller view: join room and send input over WebRTC.
 */

import { useState, useCallback, useRef } from 'react';
import { createSignalingClient } from './signalingClient';
import { createGamePeer } from './webrtcClient';

const WS_URL = typeof window !== 'undefined'
  ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/signal`
  : 'ws://localhost:3001/signal';

export function useControllerConnect() {
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [errorMessage, setErrorMessage] = useState('');
  const [speed, setSpeed] = useState(0);
  const signalingRef = useRef(null);
  const webrtcRef = useRef(null);

  const joinRoom = useCallback((roomCode) => {
    const code = String(roomCode || '').toUpperCase().trim();
    if (!code || code.length !== 6) {
      setErrorMessage('Invalid room code');
      setConnectionStatus('error');
      return;
    }

    webrtcRef.current?.close();
    signalingRef.current?.disconnect();

    setConnectionStatus('connecting');
    setErrorMessage('');
    setSpeed(0);

    const signaling = createSignalingClient(WS_URL);
    const webrtc = createGamePeer(signaling, { onGameState: (msg) => setSpeed(msg.speed ?? 0) });

    signalingRef.current = signaling;
    webrtcRef.current = webrtc;

    webrtc.initAsController(() => setConnectionStatus('connected'));

    signaling.on('error', ({ message }) => {
      setErrorMessage(message);
      setConnectionStatus('error');
    });

    signaling.on('close', () => {
      setConnectionStatus('disconnected');
    });

    signaling.on('peer-left', () => {
      setConnectionStatus('disconnected');
      setSpeed(0);
    });

    signaling.connect()
      .then(() => signaling.joinRoom(code))
      .catch((err) => {
        setErrorMessage(err?.message || 'Connection failed');
        setConnectionStatus('error');
      });
  }, []);

  const sendInput = useCallback((payload) => {
    if (webrtcRef.current) {
      webrtcRef.current.sendInput(payload);
    }
  }, []);

  const disconnect = useCallback(() => {
    webrtcRef.current?.close();
    signalingRef.current?.disconnect();
    signalingRef.current = null;
    webrtcRef.current = null;
    setConnectionStatus('disconnected');
    setErrorMessage('');
    setSpeed(0);
  }, []);

  return {
    joinRoom,
    sendInput,
    speed,
    connectionStatus,
    errorMessage,
    disconnect,
  };
}
