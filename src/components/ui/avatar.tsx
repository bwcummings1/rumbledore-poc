import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

const avatarVariants = cva(
  "bezel inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full align-middle text-center font-display font-semibold uppercase text-foreground",
  {
    variants: {
      size: {
        xs: "size-6 text-xs",
        sm: "size-8 text-xs",
        md: "size-10 text-sm",
        lg: "size-12 text-base",
        xl: "size-16 text-lg",
      },
      tone: {
        amber: "bg-warning/15 text-warning",
        jade: "bg-positive/15 text-positive",
        lilac: "bg-primary/15 text-primary",
        steel: "bg-elevated text-[var(--steel-soft)]",
      },
    },
    defaultVariants: {
      size: "md",
      tone: "lilac",
    },
  },
);

interface AvatarProps
  extends Omit<
      ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>,
      "children"
    >,
    VariantProps<typeof avatarVariants> {
  readonly decorative?: boolean;
  readonly imageSrc?: string | null;
  readonly name: string;
}

interface AvatarGroupProps extends ComponentPropsWithoutRef<"div"> {
  readonly avatars: readonly Pick<AvatarProps, "imageSrc" | "name" | "tone">[];
  readonly max?: number;
  readonly size?: AvatarProps["size"];
}

function Avatar({
  className,
  decorative = false,
  imageSrc,
  name,
  size,
  tone,
  ...props
}: AvatarProps) {
  const initials = monogram(name);
  const resolvedTone = tone ?? toneForName(name);

  return (
    <AvatarPrimitive.Root
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : name}
      className={cn(avatarVariants({ className, size, tone: resolvedTone }))}
      data-slot="avatar"
      {...props}
    >
      {imageSrc ? (
        <AvatarPrimitive.Image
          alt={name}
          className="size-full rounded-full object-cover"
          data-slot="avatar-image"
          src={imageSrc}
        />
      ) : null}
      <AvatarPrimitive.Fallback
        aria-hidden="true"
        className="flex size-full items-center justify-center rounded-full"
        data-slot="avatar-fallback"
      >
        {initials}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

function AvatarGroup({
  avatars,
  className,
  max = 4,
  size = "md",
  ...props
}: AvatarGroupProps) {
  const visible = avatars.slice(0, max);
  const overflow = Math.max(avatars.length - visible.length, 0);

  return (
    <div
      className={cn("flex items-center", className)}
      data-slot="avatar-group"
      {...props}
    >
      <span className="sr-only">{avatars.length} avatars</span>
      {visible.map((avatar, index) => (
        <Avatar
          className={cn(index > 0 ? "-ml-2" : "")}
          imageSrc={avatar.imageSrc}
          key={`${avatar.name}:${index}`}
          name={avatar.name}
          size={size}
          tone={avatar.tone}
        />
      ))}
      {overflow > 0 ? (
        <span
          className={cn(
            avatarVariants({ size, tone: "steel" }),
            visible.length > 0 ? "-ml-2" : "",
          )}
          data-slot="avatar-overflow"
        >
          <span aria-hidden="true">+{overflow}</span>
          <span className="sr-only">{overflow} more avatars</span>
        </span>
      ) : null}
    </div>
  );
}

function monogram(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);

  if (parts.length === 0) {
    return "?";
  }

  const letters =
    parts.length === 1
      ? parts[0].slice(0, 2)
      : `${parts[0][0] ?? ""}${parts.at(-1)?.[0] ?? ""}`;

  return letters.toUpperCase();
}

function toneForName(name: string): NonNullable<AvatarProps["tone"]> {
  const tones = ["lilac", "steel", "amber", "jade"] as const;
  const sum = Array.from(name).reduce(
    (current, char) => current + char.charCodeAt(0),
    0,
  );
  return tones[sum % tones.length];
}

export { Avatar, AvatarGroup, avatarVariants, monogram };
export type { AvatarGroupProps, AvatarProps };
