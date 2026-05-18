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
  return (
    <Select
      classNamePrefix="rs"
      options={options}
      value={options.find((o) => o.value === value) ?? null}
      onChange={(opt) => onChange((opt as Option | null)?.value ?? "")}
      isSearchable
      isClearable
      isDisabled={isDisabled}
      placeholder={placeholder}
    />
  );
}
