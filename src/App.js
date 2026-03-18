import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { GameView } from './views/GameView';
import ControllerView from './views/ControllerView';
import { playClickSound } from './ui/clickSound';
import './App.css';

function App() {
  useEffect(() => {
    function onClick(e) {
      const button = e.target?.closest?.('button');
      if (!button) return;
      if (button.disabled) return;
      playClickSound();
    }

    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<GameView />} />
        <Route path="/controller" element={<ControllerView />} />
        <Route path="/c" element={<ControllerView />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
