import { useId, useState, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import './Tooltip.css';

export function Tooltip({ content, children, className = '' }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const bubbleRef = useRef(null);
  const [fixedPos, setFixedPos] = useState(null);
  const hasContent = content != null && String(content).length > 0;
  const show = open && hasContent;

  function handleTriggerMouseLeave(e) {
    const next = e.relatedTarget;
    if (next && bubbleRef.current && (bubbleRef.current === next || bubbleRef.current.contains(next))) return;
    setOpen(false);
  }

  function handleBubbleMouseLeave(e) {
    const next = e.relatedTarget;
    if (next && triggerRef.current && (triggerRef.current === next || triggerRef.current.contains(next))) return;
    setOpen(false);
  }

  useLayoutEffect(() => {
    if (!show) {
      setFixedPos(null);
      return;
    }
    function update() {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setFixedPos({
        left: rect.left + rect.width / 2,
        top: rect.top,
      });
    }
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [show]);

  return (
    <>
      <div
        ref={triggerRef}
        className={`tooltip-root${className ? ` ${className}` : ''}`}
        tabIndex={0}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={handleTriggerMouseLeave}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-describedby={show && fixedPos != null ? id : undefined}
      >
        {children}
      </div>
      {show &&
        fixedPos != null &&
        createPortal(
          <div
            ref={bubbleRef}
            id={id}
            role="tooltip"
            className="tooltip-bubble tooltip-bubble--fixed"
            style={{
              left: fixedPos.left,
              top: fixedPos.top,
              transform: 'translate(-50%, calc(-100% - 6px))',
            }}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={handleBubbleMouseLeave}
          >
            {content}
          </div>,
          document.body
        )}
    </>
  );
}
