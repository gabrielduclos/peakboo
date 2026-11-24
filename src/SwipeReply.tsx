import { useRef, useState, type HTMLAttributes, type PointerEvent, type CSSProperties } from 'react';
import { Reply } from 'lucide-react';

const THRESHOLD = 64;
type Gesture = { id: number; x: number; y: number; horizontal: boolean; distance: number };
/** Native vertical scrolling and pinch zoom remain owned by the browser. */
export function SwipeReply({ onReply, disabled, children, className = '', style, ...props }:
  HTMLAttributes<HTMLDivElement> & { onReply: () => void; disabled?: boolean }) {
  const gesture = useRef<Gesture | null>(null);
  const suppressClickUntil = useRef(0);
  const [distance, setDistance] = useState(0);
  const reset = () => { gesture.current = null; setDistance(0); };
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    const reply = current.distance >= THRESHOLD;
    if (current.horizontal) suppressClickUntil.current = Date.now() + 350;
    reset();
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (reply) onReply();
  };
  return <div {...props} className={className + ' swipe-reply' + (distance ? ' swiping' : '')}
    style={{ ...style, '--reply-offset': distance + 'px' } as CSSProperties}
    onPointerDown={event => {
      if (!event.isPrimary) { reset(); return; }
      if (disabled || event.pointerType === 'mouse' || gesture.current ||
        (event.target as Element).closest('button,a,input,textarea,select,audio,video,[role="button"],[data-no-swipe]')) return;
      gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: false, distance: 0 };
    }}
    onPointerMove={event => {
      const current = gesture.current;
      if (!current || current.id !== event.pointerId) return;
      const dx = event.clientX - current.x, dy = Math.abs(event.clientY - current.y);
      if (!current.horizontal) {
        if (dy > 10 && dy >= Math.abs(dx)) { reset(); return; }
        if (dx < -10) { reset(); return; }
        if (dx < 10 || dx < dy * 1.3) return;
        current.horizontal = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
      current.distance = Math.max(0, Math.min(84, dx));
      setDistance(current.distance);
    }}
    onPointerUp={finish}
    onPointerCancel={reset}
    onLostPointerCapture={reset}
    onClickCapture={event => { if (Date.now() < suppressClickUntil.current) { event.preventDefault(); event.stopPropagation(); } }}>
    {distance > 0 && <span className={'swipe-reply-indicator' + (distance >= THRESHOLD ? ' ready' : '')} aria-hidden="true"><Reply size={19}/></span>}
    {children}
  </div>;
}
