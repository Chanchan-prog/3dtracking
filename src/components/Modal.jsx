// filepath: c:\xampp\htdocs\3D-School-Attendance\src\components\Modal.jsx
// Enhanced Modal (ported from Websitereactvite, adapted for global React in browser)
function Modal({
  show,
  title,
  size = "md", // "sm" | "md" | "lg"
  onClose,
  children,
  closeOnBackdrop = true,
}) {
  // Always call hooks, only do work when show === true
  React.useEffect(() => {
    if (!show) return;

    const handleEsc = (e) => {
      if (e.key === "Escape" && onClose) onClose();
    };

    document.addEventListener("keydown", handleEsc);
    document.body.classList.add("modal-open");

    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.classList.remove("modal-open");
    };
  }, [show, onClose]);

  if (!show) return null;

  const handleBackdropClick = (e) => {
    if (!closeOnBackdrop) return;
    if (e.target === e.currentTarget && onClose) {
      onClose();
    }
  };

  let widthClass = "";
  if (size === "lg") widthClass = "modal-lg";
  if (size === "sm") widthClass = "modal-sm";

  return (
    <div
      className="modal fade show d-block"
      tabIndex="-1"
      onClick={handleBackdropClick}
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className={`modal-dialog modal-dialog-centered ${widthClass}`}>
        <div className="modal-content">
          {title && (
            <div className="modal-header">
              <h5 className="modal-title mb-0">{title}</h5>
              {onClose && (
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={onClose}
                />
              )}
            </div>
          )}

          <div className="modal-body">{children}</div>
        </div>
      </div>
    </div>
  );
}

// expose globally for legacy scripts that expect window.Modal
try { if (typeof window !== 'undefined' && !window.Modal) window.Modal = Modal; } catch (e) {}

// export as ES module default (do not attach to window)
export default Modal;
