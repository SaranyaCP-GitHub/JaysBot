import React from "react";
import { LucideIcon } from "lucide-react";

interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon | React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  title?: string;
  disabled?: boolean;
  iconProps?: React.SVGProps<SVGSVGElement> & {
    className?: string;
    size?: number;
    strokeWidth?: number;
    width?: number | string;
    height?: number | string;
  };
}

/**
 * Reusable IconButton atom component
 */
const IconButton: React.FC<IconButtonProps> = ({
  icon: Icon,
  onClick,
  className = "",
  title,
  disabled = false,
  iconProps = {},
  ...rest
}) => {
  // Filter out invalid props (height/width < 1) and only pass valid props
  const validIconProps = React.useMemo(() => {
    if (!iconProps) return {};

    const { height, width, ...restProps } = iconProps;
    const props: Record<string, any> = { ...restProps };

    // Only include width/height if they're valid (numbers > 0 or valid strings)
    if (width !== undefined) {
      if (
        (typeof width === "number" && width > 0) ||
        typeof width === "string"
      ) {
        props.width = width;
      }
    }
    if (height !== undefined) {
      if (
        (typeof height === "number" && height > 0) ||
        typeof height === "string"
      ) {
        props.height = height;
      }
    }

    return props;
  }, [iconProps]);

  // Memoize the rendered icon to avoid re-rendering on every render cycle
  const renderedIcon = React.useMemo((): React.ReactNode => {
    if (Icon == null) return null;
    if (React.isValidElement(Icon)) return Icon;

    const iconType = typeof Icon;
    // Handle primitives
    if (
      iconType === "string" ||
      iconType === "number" ||
      iconType === "boolean"
    ) {
      return Icon as React.ReactNode;
    }

    // Handle component types (function, forwardRef, memo, class components)
    try {
      return React.createElement(
        Icon as React.ComponentType<any>,
        validIconProps
      );
    } catch (e) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("IconButton: Error rendering icon component", e, Icon);
      }
      return null;
    }
  }, [Icon, validIconProps]);

  return (
    <button
      onClick={onClick}
      className={className}
      title={title}
      disabled={disabled}
      {...rest}
    >
      {renderedIcon}
    </button>
  );
};

export default IconButton;
