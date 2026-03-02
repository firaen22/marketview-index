import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './Dashboard';
import FundsPage from './FundsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/funds" element={<FundsPage />} />
      </Routes>
    </BrowserRouter>
  );
}
