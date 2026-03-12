import { Navigate, Route, Routes } from 'react-router-dom';
import { AppErrorBoundary } from './error-boundary';
import { ChatPage } from './pages/chat-page';
import { LoginPage } from './pages/login-page';

export function App() {
  return (
    <AppErrorBoundary>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ChatPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppErrorBoundary>
  );
}

export default App;
