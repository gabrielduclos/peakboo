import { AvatarPhoto } from './Media';
import * as Dialog from "@radix-ui/react-dialog";
import { X, LoaderCircle } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { cva } from "class-variance-authority";
export const cn = (...inputs: Parameters<typeof clsx>) => twMerge(clsx(inputs));
const variants = cva("button", {
  variants: {
    variant: {
      default: "primary",
      outline: "outline",
      ghost: "ghost",
      danger: "danger",
    },
  },
  defaultVariants: { variant: "default" },
});
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "default" | "outline" | "ghost" | "danger";
    busy?: boolean;
  }
>(({ className, variant, busy, children, disabled, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(variants({ variant }), className)}
    disabled={disabled || busy}
    aria-busy={busy}
    {...props}
  >
    {busy && <LoaderCircle size={16} className="spin" />}
    {children}
  </button>
));
Button.displayName = "Button";
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  closeLabel = "Fechar",
  className = "",
  preventAutoFocus = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  closeLabel?: string;
  className?: string;
  preventAutoFocus?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className={cn("modal", className)}
          onOpenAutoFocus={preventAutoFocus ? (event)=>{
            event.preventDefault();
            (event.target as HTMLElement | null)?.focus({preventScroll:true});
          } : undefined}
          aria-describedby={description ? "modal-description" : undefined}
        >
          <div className="modal-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              {description && (
                <Dialog.Description id="modal-description">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <button className="icon-button" aria-label={closeLabel}>
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Avatar({
  name,
  color = "purple",
  small = false,
  image,
}: {
  name: string;
  color?: string;
  small?: boolean;
  image?: string | null;
}) {
  return (
    <span className={cn("avatar", color, small && "small")} aria-hidden="true">
      {name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((x) => x[0])
        .join("")}
      {image && <AvatarPhoto key={image} src={image} />}
    </span>
  );
}
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={cn("brand", compact && "brand-compact")}
      aria-label="PedroChat"
    >
      <span className="brand-wordmark">
        <span className="brand-peak">Pedro</span>
        <span className="brand-boo">Chat</span>
      </span>
    </span>
  );
}
