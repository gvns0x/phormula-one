let clickAudio = null;

function getClickAudio() {
  if (typeof Audio === 'undefined') return null;
  if (clickAudio) return clickAudio;
  clickAudio = new Audio('/sfx/clickSound.mp3');
  clickAudio.preload = 'auto';
  return clickAudio;
}

export function playClickSound() {
  const audio = getClickAudio();
  if (!audio) return;
  try {
    audio.currentTime = 0;
    const p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (_e) {
    // Ignore autoplay / decoding errors.
  }
}

