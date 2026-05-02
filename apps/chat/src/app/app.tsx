import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppErrorBoundary } from './error-boundary';
import { AvatarConfigProvider } from './avatar-config-context';
import { I18nProvider, useT } from './i18n';

const LoginPage = lazy(() => import('./pages/login-page').then((m) => ({ default: m.LoginPage })));
const ChatPage = lazy(() => import('./pages/chat-page').then((m) => ({ default: m.ChatPage })));
const ActivityReviewPage = lazy(() =>
  import('./pages/activity-review-page').then((m) => ({ default: m.ActivityReviewPage }))
);
const StarkReasoningPage = lazy(() => import('./pages/stark-reasoning-page').then((m) => ({ default: m.StarkReasoningPage })));

function PageFallback() {
  const t = useT();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-violet-950/10">
      <span className="text-muted-foreground">{t('common.loading')}</span>
    </div>
  );
}

export function App() {
  return (
    <AppErrorBoundary>
      <I18nProvider>
        <AvatarConfigProvider>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={<ChatPage />} />
              <Route path="/stark" element={<StarkReasoningPage />} />
              <Route path="/stark/:activityId/:storyId" element={<StarkReasoningPage />} />
              <Route path="/stark/:activityStoryId" element={<StarkReasoningPage />} />
              <Route path="/activity/:activityId/:storyId" element={<ActivityReviewPage />} />
              <Route path="/activity/:activityStoryId" element={<ActivityReviewPage />} />
              <Route path="/activity" element={<ActivityReviewPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </AvatarConfigProvider>
      </I18nProvider>
    </AppErrorBoundary>
  );
}

export default App;
