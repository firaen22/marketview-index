import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './Dashboard';
import FundsPage from './FundsPage';
import HeatmapPage from './HeatmapPage';
import PresentationPage from './PresentationPage';
import PresentationControl from './PresentationControl';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/funds" element={<FundsPage />} />
        <Route path="/heatmap" element={<HeatmapPage />} />
        <Route path="/present" element={<PresentationPage />} />
        <Route path="/present-control" element={<PresentationControl />} />
      </Routes>
    </BrowserRouter>
  );
}
