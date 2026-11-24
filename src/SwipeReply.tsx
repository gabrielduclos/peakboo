import {
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type PointerEvent,
  type CSSProperties,
} from "react";
import { Reply } from "lucide-react";

const THRESHOLD = 48;
const MAX_DISTANCE = 72;
type Gesture = {
  id: number;
  x: number;
  y: number;
  horizontal: boolean;
  distance: number;
};
/** Lock only a deliberate horizontal gesture; native scrolling and pinch stay available. */
export function SwipeReply({
  onReply,
  disabled,
  children,
  className = "",
  style,
  onContextMenu,
  onDragStart,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  onReply: () => void;
  disabled?: boolean;
}) {
  const gesture = useRef<Gesture | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  const nativeTouch = useRef(false);
  const latest = useRef({ onReply, disabled });
  latest.current = { onReply, disabled };
  const suppressClickUntil = useRef(0);
  const [distance, setDistance] = useState(0);
  const reset = () => {
    gesture.current = null;
    setDistance(0);
  };
  useEffect(() => {
    const cancelPinch = (event: globalThis.PointerEvent) => {
      if (!event.isPrimary && !nativeTouch.current) {
        gesture.current = null;
        setDistance(0);
      }
    };
    window.addEventListener("pointerdown", cancelPinch, true);
    return () => window.removeEventListener("pointerdown", cancelPinch, true);
  }, []);
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const start = (event: TouchEvent) => {
      nativeTouch.current = true;
      gesture.current = null;
      setDistance(0);
      if (event.touches.length !== 1 || latest.current.disabled) return;
      const target = event.target as Element;
      const control = target.closest(
        'button,a,input,textarea,select,audio,video,[role="button"],[contenteditable="true"],[data-no-swipe]',
      );
      if (control && !control.matches("button.open-chat-photo")) return;
      const touch = event.touches[0];
      suppressClickUntil.current = 0;
      gesture.current = {
        id: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
        horizontal: false,
        distance: 0,
      };
    };
    const move = (event: TouchEvent) => {
      const current = gesture.current;
      if (!current) return;
      if (event.touches.length !== 1) {
        gesture.current = null;
        setDistance(0);
        return;
      }
      const touch = event.touches[0],
        dx = touch.clientX - current.x,
        dy = Math.abs(touch.clientY - current.y);
      if (!current.horizontal) {
        if ((dy > 10 && dy >= Math.abs(dx)) || dx < -10) {
          gesture.current = null;
          setDistance(0);
          return;
        }
        if (dx < 8 || dx < dy * 1.2) return;
        current.horizontal = true;
      }
      // Safari can cancel pointer events during a thumb drag. A non-passive
      // touch move keeps an already-horizontal reply gesture until touchend.
      if (event.cancelable) event.preventDefault();
      current.distance = Math.max(0, Math.min(MAX_DISTANCE, dx));
      setDistance(current.distance);
    };
    const end = (event: TouchEvent) => {
      const current = gesture.current;
      gesture.current = null;
      setDistance(0);
      if (!current) return;
      const touch = Array.from(event.changedTouches).find(
        (t) => t.identifier === current.id,
      );
      if (current.horizontal) suppressClickUntil.current = Date.now() + 700;
      if (
        touch &&
        !event.touches.length &&
        current.horizontal &&
        !latest.current.disabled &&
        touch.clientX - current.x >= THRESHOLD
      )
        latest.current.onReply();
    };
    const cancel = () => {
      gesture.current = null;
      setDistance(0);
    };
    element.addEventListener("touchstart", start, { passive: true });
    element.addEventListener("touchmove", move, { passive: false });
    element.addEventListener("touchend", end);
    element.addEventListener("touchcancel", cancel);
    return () => {
      element.removeEventListener("touchstart", start);
      element.removeEventListener("touchmove", move);
      element.removeEventListener("touchend", end);
      element.removeEventListener("touchcancel", cancel);
    };
  }, []);
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (nativeTouch.current && event.pointerType === "touch") return;
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    // Use the release position too: a reversed drag must never reply.
    const dx = event.clientX - current.x;
    const reply = !disabled && current.horizontal && dx >= THRESHOLD;
    if (current.horizontal) suppressClickUntil.current = Date.now() + 700;
    reset();
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (reply) onReply();
  };
  return (
    <div
      {...props}
      ref={surface}
      className={className + " swipe-reply" + (distance ? " swiping" : "")}
      style={{ ...style, "--reply-offset": distance + "px" } as CSSProperties}
      onPointerDown={(event) => {
        if (event.pointerType === "touch" && nativeTouch.current) return;
        if (event.pointerType === "mouse") nativeTouch.current = false;
        if (!event.isPrimary) {
          reset();
          return;
        }
        const target = event.target as Element;
        // Photos can be swiped while a normal tap still opens the gallery.
        const control = target.closest(
          'button,a,input,textarea,select,audio,video,[role="button"],[contenteditable="true"],[data-no-swipe]',
        );
        if (
          disabled ||
          (event.pointerType === "mouse" && event.button !== 0) ||
          gesture.current ||
          (control && !control.matches("button.open-chat-photo"))
        )
          return;
        suppressClickUntil.current = 0;
        gesture.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          horizontal: false,
          distance: 0,
        };
      }}
      onPointerMove={(event) => {
        if (event.pointerType === "touch" && nativeTouch.current) return;
        const current = gesture.current;
        if (!current || current.id !== event.pointerId) return;
        const dx = event.clientX - current.x,
          dy = Math.abs(event.clientY - current.y);
        if (!current.horizontal) {
          if (dy > 10 && dy >= Math.abs(dx)) {
            reset();
            return;
          }
          if (dx < -10) {
            reset();
            return;
          }
          if (dx < 8 || dx < dy * 1.2) return;
          current.horizontal = true;
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }
        if (event.cancelable) event.preventDefault();
        current.distance = Math.max(0, Math.min(MAX_DISTANCE, dx));
        setDistance(current.distance);
      }}
      onPointerUp={finish}
      onPointerCancel={(event) => {
        if (!nativeTouch.current || event.pointerType !== "touch") reset();
      }}
      onLostPointerCapture={(event) => {
        if (!nativeTouch.current || event.pointerType !== "touch") reset();
      }}
      onDragStart={(event) => {
        if ((event.target as Element).closest(".open-chat-photo"))
          event.preventDefault();
        else onDragStart?.(event);
      }}
      onContextMenu={(event) => {
        if (
          gesture.current?.horizontal ||
          Date.now() < suppressClickUntil.current
        ) {
          event.preventDefault();
          return;
        }
        onContextMenu?.(event);
      }}
      onClickCapture={(event) => {
        if (Date.now() < suppressClickUntil.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      {distance > 0 && (
        <span
          className={
            "swipe-reply-indicator" + (distance >= THRESHOLD ? " ready" : "")
          }
          aria-hidden="true"
        >
          <Reply size={19} />
        </span>
      )}
      {children}
    </div>
  );
}
