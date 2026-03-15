import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { GameView } from './views/GameView';
import ControllerView from './views/ControllerView';
import './App.css';

function App() {
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
