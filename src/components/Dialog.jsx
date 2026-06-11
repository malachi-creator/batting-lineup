import React, { useEffect, useRef } from "react";
import { tap } from "../haptics.js";

export function Dialog({ open, title, message, children, confirmLabel = "OK", cancelLabel = "Cancel", onConfirm, onCancel, danger, hideCancel }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        {title && <h3>{title}</h3>}
        {message && <p className="dialog-msg">{message}</p>}
        {children}
        <div className="dialog-actions">
          {!hideCancel && (
            <button className="btn small" onClick={() => { tap(); onCancel?.(); }}>
              {cancelLabel}
            </button>
          )}
          {onConfirm && (
            <button
              className={`btn small${danger ? " danger" : " primary"}`}
              style={{ padding: "0 18px" }}
              onClick={() => { tap(); onConfirm(); }}
            >
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function PromptDialog({ open, title, label, defaultValue = "", confirmLabel = "Save", onSubmit, onCancel }) {
  const [value, setValue] = React.useState(defaultValue);

  useEffect(() => {
    if (open) setValue(defaultValue);
  }, [open, defaultValue]);

  if (!open) return null;

  return (
    <Dialog
      open
      title={title}
      confirmLabel={confirmLabel}
      onConfirm={() => onSubmit(value.trim())}
      onCancel={onCancel}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={label}
        onKeyDown={(e) => e.key === "Enter" && value.trim() && onSubmit(value.trim())}
        autoFocus
      />
    </Dialog>
  );
}
