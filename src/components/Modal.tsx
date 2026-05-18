import { useEffect, useId } from "react";
import type { ReactNode } from "react";

type ModalProps = {
  open: boolean;
  title?: string;
  children: ReactNode;
  onClose?: () => void;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  className?: string;
  panelClassName?: string;
};

export default function Modal({
  open,
  title,
  children,
  onClose,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  className,
  panelClassName,
}: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open || !closeOnEscape || !onClose) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeOnEscape, onClose, open]);

  if (!open) return null;

  return (
    <div
      className={`app-modal-overlay ${className ?? ""}`.trim()}
      onClick={(event) => {
        if (closeOnOverlayClick && event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div
        className={`app-modal-panel modal-content ${panelClassName ?? ""}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
      >
        {title && (
          <div className="modal-header">
            <h5 className="modal-title" id={titleId}>
              {title}
            </h5>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
