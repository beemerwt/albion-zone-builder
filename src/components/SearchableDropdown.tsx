import { useCallback, useId } from "react";
import Select from "react-select";

export type Option = { value: string; label: string };

export default function SearchableDropdown({
  options,
  value,
  onChange,
  isDisabled = false,
  placeholder = "Select...",
}: {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  isDisabled?: boolean;
  placeholder?: string;
}) {
  const inputId = useId();

  const scrollMenuIntoView = useCallback(() => {
    window.requestAnimationFrame(() => {
      const control = document.getElementById(inputId);
      const root = control?.closest(".rs__control");
      const menu = root?.parentElement?.querySelector<HTMLElement>(".rs__menu");

      if (!menu) return;

      const padding = 8;
      const menuRect = menu.getBoundingClientRect();

      const getScrollableParent = (el: HTMLElement | null) => {
        let current = el?.parentElement;
        while (current) {
          const style = window.getComputedStyle(current);
          const canScroll = /(auto|scroll|overlay)/.test(`${style.overflowY} ${style.overflow}`);
          if (canScroll && current.scrollHeight > current.clientHeight) {
            return current;
          }
          current = current.parentElement;
        }
        return null;
      };

      const scrollParent = getScrollableParent(menu);

      if (scrollParent) {
        const parentRect = scrollParent.getBoundingClientRect();
        const overflow = menuRect.bottom - (parentRect.bottom - padding);
        if (overflow > 0) {
          scrollParent.scrollBy({ top: overflow, behavior: "smooth" });
        }
        return;
      }

      const viewportBottom = window.innerHeight - padding;
      const overflow = menuRect.bottom - viewportBottom;
      if (overflow > 0) {
        window.scrollBy({ top: overflow, behavior: "smooth" });
      }
    });
  }, [inputId]);

  return (
    <Select
      inputId={inputId}
      classNamePrefix="rs"
      options={options}
      value={options.find((o) => o.value === value) ?? null}
      onChange={(opt) => onChange((opt as Option | null)?.value ?? "")}
      isSearchable
      isClearable
      isDisabled={isDisabled}
      placeholder={placeholder}
      menuPlacement="bottom"
      onMenuOpen={scrollMenuIntoView}
    />
  );
}
