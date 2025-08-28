import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { ToastProvider } from './components/common/ToastProvider';
import { ConfirmProvider } from './components/common/ConfirmProvider';
import AchievementModalProvider from './components/common/AchievementModal';

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
