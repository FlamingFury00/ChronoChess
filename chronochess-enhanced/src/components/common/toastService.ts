export type ToastLevel = 'info' | 'success' | 'error';

type ShowToastFn = (message: string, opts?: { level?: ToastLevel; duration?: number }) => void;

let _showToast: ShowToastFn = () => {
  // no-op until provider sets it
};

export const setShowToast = (fn: ShowToastFn) => {
  _showToast = fn || (() => {});
};

export const showToast = (message: string, opts?: { level?: ToastLevel; duration?: number }) => {
  try {
    _showToast(message, opts);
  } catch (err) {
    // swallow; tests or non-UI environments may not set provider
    // eslint-disable-next-line no-console
    console.debug('toastService.showToast (no-op):', message, opts);
  }
};

export default showToast;
