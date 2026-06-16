import { Search } from "lucide-react";

import { Input, type InputProps } from "./input";

interface SearchInputProps extends Omit<InputProps, "leadingIcon" | "type"> {
  readonly onClear?: () => void;
}

type SearchKeyDownEvent = Parameters<NonNullable<InputProps["onKeyDown"]>>[0];

function SearchInput({ onClear, onKeyDown, ...props }: SearchInputProps) {
  function handleKeyDown(event: SearchKeyDownEvent) {
    if (event.key === "Escape" && onClear) {
      onClear();
      event.preventDefault();
    }
    onKeyDown?.(event);
  }

  return (
    <Input
      clearable={Boolean(onClear)}
      leadingIcon={<Search aria-hidden="true" />}
      onClear={onClear}
      onKeyDown={handleKeyDown}
      type="search"
      {...props}
    />
  );
}

export { SearchInput };
export type { SearchInputProps };
