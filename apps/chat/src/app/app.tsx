import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppErrorBoundary } from './error-boundary';

const LoginPage = lazy(() => import('./pages/login-page').then((m) => ({ default: m.LoginPage })));
const ChatPage = lazy(() => import('./pages/chat-page').then((m) => ({ default: m.ChatPage })));
const ActivityReviewPage = lazy(() =>
  import('./pages/activity-review-page').then((m) => ({ default: m.ActivityReviewPage }))
);

function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-violet-950/10">
      <span className="text-muted-foreground">Loading…</span>
    </div>
  );
}

export function App() {
  return (
    <AppErrorBoundary>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ChatPage />} />
          <Route path="/activity/:id" element={<ActivityReviewPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppErrorBoundary>
  );
}

export default App;
