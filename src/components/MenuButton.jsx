import './MenuButton.css';

const VARIANT_CLASS_MAP = {
  toggle: 'menu-button-toggle',
  action: 'menu-button-action',
};

export function MenuButton({
  variant = 'action',
  className = '',
  type = 'button',
  children,
  ...buttonProps
}) {
  const variantClass = VARIANT_CLASS_MAP[variant] ?? VARIANT_CLASS_MAP.action;
  const combinedClassName = `menu-button ${variantClass}${className ? ` ${className}` : ''}`;

  return (
    <button className={combinedClassName} type={type} {...buttonProps}>
      {children}
    </button>
  );
}
