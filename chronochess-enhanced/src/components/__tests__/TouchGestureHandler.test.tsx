import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TouchGestureHandler from '../MobileControls/TouchGestureHandler';
import type { TouchGesture } from '../MobileControls/types';

// Mock touch events
const createTouchEvent = (type: string, touches: Array<{ clientX: number; clientY: number }>) => {
  const touchList = touches.map(touch => ({
    clientX: touch.clientX,
    clientY: touch.clientY,
    identifier: Math.random(),
    target: document.body,
    radiusX: 1,
    radiusY: 1,
    rotationAngle: 0,
    force: 1,
  }));

  return new TouchEvent(type, {
    touches: touchList as any,
    targetTouches: touchList as any,
    changedTouches: touchList as any,
    bubbles: true,
    cancelable: true,
  });
};

describe('TouchGestureHandler Component', () => {
  it('renders children correctly', () => {
    render(
      <TouchGestureHandler>
        <div>Test Content</div>
      </TouchGestureHandler>
    );

    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('applies correct CSS classes', () => {
    const { container } = render(
      <TouchGestureHandler className="custom-class">
        <div>Test Content</div>
      </TouchGestureHandler>
    );

    const handler = container.firstChild as HTMLElement;
    expect(handler).toHaveClass('touch-gesture-handler');
    expect(handler).toHaveClass('custom-class');
  });

  it('applies disabled class when disabled', () => {
    const { container } = render(
      <TouchGestureHandler disabled>
        <div>Test Content</div>
      </TouchGestureHandler>
    );

    const handler = container.firstChild as HTMLElement;
    expect(handler).toHaveClass('touch-gesture-handler--disabled');
  });

  it('handles touch events without errors', () => {
    const handleTap = vi.fn();
    const { container } = render(
      <TouchGestureHandler onTap={handleTap}>
        <div>Test Content</div>
      </TouchGestureHandler>
    );

    const handler = container.firstChild as HTMLElement;

    // Simulate touch start and end without errors
    expect(() => {
      const touchStart = createTouchEvent('touchstart', [{ clientX: 100, clientY: 100 }]);
      fireEvent(handler, touchStart);

      const touchEnd = createTouchEvent('touchend', []);
      fireEvent(handler, touchEnd);
    }).not.toThrow();
  });

  it('calls onSwipe when swiped', () => {
    const handleSwipe = vi.fn();
    const { container } = render(
      <TouchGestureHandler onSwipe={handleSwipe} swipeThreshold={30}>
        <div>Test Content</div>
      </TouchGestureHandler>
    );

    const handler = container.firstChild as HTMLElement;

    // Simulate swipe gesture
    const touchStart = createTouchEvent('touchstart', [{ clientX: 100, clientY: 100 }]);
    fireEvent(handler, touchStart);

    const touchMove = createTouchEvent('touchmove', [{ clientX: 150, clientY: 100 }]);
    fireEvent(handler, touchMove);

    const touchEnd = createTouchEvent('touchend', []);
    fireEvent(handler, touchEnd);

    expect(handleSwipe).toHaveBeenCalledTimes(1);
    expect(handleSwipe).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'swipe',
        direction: 'right',
      })
    );
  });

  it('does not trigger gestures when disabled', () => {
    const handleTap = vi.fn();
    const handleSwipe = vi.fn();
    const { container } = render(
      <TouchGestureHandler disabled onTap={handleTap} onSwipe={handleSwipe}>
        <div>Test Content</div>
      </TouchGestureHandler>
    );

    const handler = container.firstChild as HTMLElement;

    // Try to trigger gestures
    const touchStart = createTouchEvent('touchstart', [{ clientX: 100, clientY: 100 }]);
    fireEvent(handler, touchStart);

    const touchEnd = createTouchEvent('touchend', []);
    fireEvent(handler, touchEnd);

    expect(handleTap).not.toHaveBeenCalled();
    expect(handleSwipe).not.toHaveBeenCalled();
  });

  it('handles multi-touch gestures', () => {
    const handlePinch = vi.fn();
    const { container } = render(
      <TouchGestureHandler onPinch={handlePinch}>
        <div>Test Content</div>
      </TouchGestureHandler>
    );

    const handler = container.firstChild as HTMLElement;

    // Simulate pinch gesture with two touches
    const touchStart = createTouchEvent('touchstart', [
      { clientX: 100, clientY: 100 },
      { clientX: 200, clientY: 100 },
    ]);
    fireEvent(handler, touchStart);

    // Move touches closer together (pinch in)
    const touchMove = createTouchEvent('touchmove', [
      { clientX: 120, clientY: 100 },
      { clientX: 180, clientY: 100 },
    ]);
    fireEvent(handler, touchMove);

    // The pinch handler should be called
    expect(handlePinch).toHaveBeenCalled();
  });

  it('sets touch-action style correctly', () => {
    const { container } = render(
      <TouchGestureHandler>
        <div>Test Content</div>
      </TouchGestureHandler>
    );

    const handler = container.firstChild as HTMLElement;
    expect(handler.style.touchAction).toBe('none');
  });
});
