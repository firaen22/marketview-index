import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

const Dashboard = lazy(() => import('./Dashboard'));
const FundsPage = lazy(() => import('./FundsPage'));
const HeatmapPage = lazy(() => import('./HeatmapPage'));
const PresentationPage = lazy(() => import('./PresentationPage'));
const PresentationControl = lazy(() => import('./PresentationControl'));
const FactorMonitorPage = lazy(() => import('./FactorMonitorPage'));

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/funds" element={<FundsPage />} />
          <Route path="/heatmap" element={<HeatmapPage />} />
          <Route path="/present" element={<PresentationPage />} />
          <Route path="/present-control" element={<PresentationControl />} />
          <Route path="/factors" element={<FactorMonitorPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
