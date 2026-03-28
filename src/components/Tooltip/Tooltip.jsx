import { useId, useState } from 'react';
import './Tooltip.css';

export function Tooltip({ content, children, className = '' }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const hasContent = content != null && String(content).length > 0;
  const show = open && hasContent;

  return (
    <div
      className={`tooltip-root${className ? ` ${className}` : ''}`}
      tabIndex={0}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      aria-describedby={show ? id : undefined}
    >
      {children}
      {show && (
        <div id={id} role="tooltip" className="tooltip-bubble">
          {content}
        </div>
      )}
    </div>
  );
}
