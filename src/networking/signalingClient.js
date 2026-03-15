/**
 * WebSocket client for signaling server.
 * Handles room creation, joining, and SDP/ICE relay.
 */

const DEFAULT_WS_URL = `ws://${window.location.hostname}:3001/ws`;

export function createSignalingClient(wsUrl = DEFAULT_WS_URL) {
  let ws = null;
  let listeners = {};

  function on(event, handler) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(handler);
  }

  function off(event, handler) {
    if (!listeners[event]) return;
    listeners[event] = listeners[event].filter((h) => h !== handler);
  }

  function emit(event, data) {
    (listeners[event] || []).forEach((h) => h(data));
  }

  function connect() {
    return new Promise((resolve, reject) => {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => resolve();
      ws.onerror = (e) => reject(e);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          emit(msg.type, msg);
        } catch {
          emit('error', { message: 'Invalid message' });
        }
      };
      ws.onclose = () => emit('close', {});
    });
  }

  function createRoom() {
    send({ type: 'create-room' });
  }

  function joinRoom(roomId) {
    send({ type: 'join-room', roomId: String(roomId).toUpperCase().trim() });
  }

  function sendOffer(offer) {
    send({ type: 'offer', offer });
  }

  function sendAnswer(answer) {
    send({ type: 'answer', answer });
  }

  function sendIceCandidate(candidate) {
    send({ type: 'ice-candidate', candidate });
  }

  function send(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  function disconnect() {
    if (ws) {
      ws.close();
      ws = null;
    }
  }

  return {
    connect,
    createRoom,
    joinRoom,
    sendOffer,
    sendAnswer,
    sendIceCandidate,
    on,
    off,
    disconnect,
    get isConnected() {
      return ws && ws.readyState === WebSocket.OPEN;
    },
  };
}
