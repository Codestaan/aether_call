import { Navigate, Route, Routes } from 'react-router-dom';
import Home from './pages/Home.jsx';
import MeetingPage from './pages/MeetingPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/m/:roomId" element={<MeetingPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
