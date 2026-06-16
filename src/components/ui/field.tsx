import { Field as FieldPrimitive } from "@base-ui/react/field";
import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useId,
} from "react";

import { cn } from "@/lib/utils";
import {
  fieldErrorClasses,
  fieldHintClasses,
  fieldLabelClasses,
  fieldRootClasses,
} from "./control-styles";

type ControlProps = {
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  id: string;
};

interface FieldRenderProps {
  readonly controlProps: ControlProps;
}

interface FieldProps extends Omit<FieldPrimitive.Root.Props, "children"> {
  readonly children: ReactNode | ((props: FieldRenderProps) => ReactNode);
  readonly controlId?: string;
  readonly error?: ReactNode;
  readonly hint?: ReactNode;
  readonly label?: ReactNode;
  readonly labelClassName?: string;
}

function Field({
  children,
  className,
  controlId,
  error,
  hint,
  invalid,
  label,
  labelClassName,
  ...props
}: FieldProps) {
  const generatedId = useId();
  const id = controlId ?? generatedId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const hasError = Boolean(error) || Boolean(invalid);
  const controlProps: ControlProps = {
    ...(describedBy ? { "aria-describedby": describedBy } : {}),
    ...(hasError ? { "aria-invalid": true } : {}),
    id,
  };

  return (
    <FieldPrimitive.Root
      className={cn(fieldRootClasses, className)}
      data-slot="field"
      invalid={hasError}
      {...props}
    >
      {label ? (
        <FieldPrimitive.Label
          className={cn(fieldLabelClasses, labelClassName)}
          htmlFor={id}
        >
          {label}
        </FieldPrimitive.Label>
      ) : null}
      {typeof children === "function"
        ? children({ controlProps })
        : withControlProps(children, controlProps)}
      {hint ? (
        <FieldPrimitive.Description
          className={fieldHintClasses}
          data-slot="field-hint"
          id={hintId}
        >
          {hint}
        </FieldPrimitive.Description>
      ) : null}
      {error ? (
        <FieldPrimitive.Error
          className={fieldErrorClasses}
          data-slot="field-error"
          id={errorId}
          match={true}
        >
          {error}
        </FieldPrimitive.Error>
      ) : null}
    </FieldPrimitive.Root>
  );
}

function withControlProps(children: ReactNode, controlProps: ControlProps) {
  if (!isValidElement(children)) {
    return children;
  }

  const child = children as ReactElement<Partial<ControlProps>>;
  return cloneElement(child, {
    ...controlProps,
    ...child.props,
    "aria-describedby": cn(
      controlProps["aria-describedby"],
      child.props["aria-describedby"],
    ),
    "aria-invalid": child.props["aria-invalid"] ?? controlProps["aria-invalid"],
    id: child.props.id ?? controlProps.id,
  });
}

export { Field };
export type { ControlProps, FieldProps, FieldRenderProps };
