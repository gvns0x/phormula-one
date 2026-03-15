/**
 * WebRTC client with DataChannel for game control.
 * Game creates offer + DataChannel; controller receives and sends input.
 */

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const DATA_CHANNEL_LABEL = 'game-control';

export function createGamePeer(signaling, callbacks) {
  const { onInput, onGameState } = typeof callbacks === 'function' ? { onInput: callbacks } : (callbacks || {});
  let pc = null;
  let dc = null;

  async function initAsGame() {
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    dc = pc.createDataChannel(DATA_CHANNEL_LABEL, { ordered: false });

    dc.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        onInput?.(msg);
      } catch {}
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) signaling.sendIceCandidate(e.candidate);
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    signaling.sendOffer(offer);
  }

  async function initAsController(onConnected) {
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.ondatachannel = (e) => {
      dc = e.channel;
      dc.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.speed !== undefined) onGameState?.(msg);
        } catch {}
      };
      dc.onopen = () => onConnected && onConnected();
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) signaling.sendIceCandidate(e.candidate);
    };

    signaling.on('offer', async ({ offer }) => {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      signaling.sendAnswer(answer);
    });
  }

  signaling.on('answer', async ({ answer }) => {
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  });

  signaling.on('ice-candidate', async ({ candidate }) => {
    if (!pc || !candidate) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {}
  });

  function sendInput(payload) {
    if (dc && dc.readyState === 'open') {
      dc.send(JSON.stringify(payload));
    }
  }

  function sendState(payload) {
    if (dc && dc.readyState === 'open') {
      dc.send(JSON.stringify(payload));
    }
  }

  function close() {
    dc?.close();
    pc?.close();
  }

  return {
    initAsGame,
    initAsController,
    sendInput,
    sendState,
    close,
    get isDataChannelOpen() {
      return dc && dc.readyState === 'open';
    },
  };
}
