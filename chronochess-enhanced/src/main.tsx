import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { ToastProvider } from './components/common/ToastProvider';
import { ConfirmProvider } from './components/common/ConfirmProvider';
import AchievementModalProvider from './components/common/AchievementModal';
import { useGameStore } from './store';
import { isCloudConfigured } from './lib/supabaseClient';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <AchievementModalProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </AchievementModalProvider>
    </ToastProvider>
  </StrictMode>
);

// Expose minimal debug hooks for manual testing
try {
  (window as any).chronoCloud = {
    configured: isCloudConfigured,
    save: async () => await useGameStore.getState().saveToCloudFirst(),
    load: async () => await useGameStore.getState().loadFromCloudFirst(),
  };
  // eslint-disable-next-line no-console
  console.log('Cloud debug hooks at window.chronoCloud');
} catch {}
