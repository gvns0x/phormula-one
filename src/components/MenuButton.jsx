import './MenuButton.css';

export function MenuButton({
  className = '',
  type = 'button',
  children,
  ...buttonProps
}) {
  const combinedClassName = `menu-button${className ? ` ${className}` : ''}`;

  return (
    <button className={combinedClassName} type={type} {...buttonProps}>
      {children}
    </button>
  );
}
