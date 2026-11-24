import { useEffect, useRef, useState, type HTMLAttributes, type PointerEvent, type CSSProperties } from 'react';
import { Reply } from 'lucide-react';

const THRESHOLD = 48;
const MAX_DISTANCE = 72;
type Gesture = { id: number; x: number; y: number; horizontal: boolean; distance: number };
/** Lock only a deliberate horizontal gesture; native scrolling and pinch stay available. */
export function SwipeReply({ onReply, disabled, children, className = '', style, onContextMenu, onDragStart, ...props }:
  HTMLAttributes<HTMLDivElement> & { onReply: () => void; disabled?: boolean }) {
  const gesture = useRef<Gesture | null>(null);
  const suppressClickUntil = useRef(0);
  const [distance, setDistance] = useState(0);
  const reset = () => { gesture.current = null; setDistance(0); };
  useEffect(() => {
    const cancelPinch = (event: globalThis.PointerEvent) => {
      if (!event.isPrimary) { gesture.current = null; setDistance(0); }
    };
    window.addEventListener('pointerdown', cancelPinch, true);
    return () => window.removeEventListener('pointerdown', cancelPinch, true);
  }, []);
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    // Use the release position too: a reversed drag must never reply.
    const dx = event.clientX - current.x;
    const reply = !disabled && current.horizontal && dx >= THRESHOLD;
    if (current.horizontal) suppressClickUntil.current = Date.now() + 700;
    reset();
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (reply) onReply();
  };
  return <div {...props} className={className + ' swipe-reply' + (distance ? ' swiping' : '')}
    style={{ ...style, '--reply-offset': distance + 'px' } as CSSProperties}
    onPointerDown={event => {
      if (!event.isPrimary) { reset(); return; }
      const target = event.target as Element;
      // Photos can be swiped while a normal tap still opens the gallery.
      const control = target.closest('button,a,input,textarea,select,audio,video,[role="button"],[contenteditable="true"],[data-no-swipe]');
      if (disabled || (event.pointerType === 'mouse' && event.button !== 0) || gesture.current ||
        (control && !control.matches('button.open-chat-photo'))) return;
      suppressClickUntil.current = 0;
      gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: false, distance: 0 };
    }}
    onPointerMove={event => {
      const current = gesture.current;
      if (!current || current.id !== event.pointerId) return;
      const dx = event.clientX - current.x, dy = Math.abs(event.clientY - current.y);
      if (!current.horizontal) {
        if (dy > 10 && dy >= Math.abs(dx)) { reset(); return; }
        if (dx < -10) { reset(); return; }
        if (dx < 8 || dx < dy * 1.2) return;
        current.horizontal = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
      if (event.cancelable) event.preventDefault();
      current.distance = Math.max(0, Math.min(MAX_DISTANCE, dx));
      setDistance(current.distance);
    }}
    onPointerUp={finish}
    onPointerCancel={reset}
    onLostPointerCapture={reset}
    onDragStart={event => {
      if ((event.target as Element).closest('.open-chat-photo')) event.preventDefault();
      else onDragStart?.(event);
    }}
    onContextMenu={event => {
      if (gesture.current?.horizontal || Date.now() < suppressClickUntil.current) {
        event.preventDefault(); return;
      }
      onContextMenu?.(event);
    }}
    onClickCapture={event => { if (Date.now() < suppressClickUntil.current) { event.preventDefault(); event.stopPropagation(); } }}>
    {distance > 0 && <span className={'swipe-reply-indicator' + (distance >= THRESHOLD ? ' ready' : '')} aria-hidden="true"><Reply size={19}/></span>}
    {children}
  </div>;
}
