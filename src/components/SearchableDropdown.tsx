import Select from 'react-select';
export type Option={value:string;label:string};
export default function SearchableDropdown({options,value,onChange,isDisabled=false}:{options:Option[];value:string;onChange:(v:string)=>void;isDisabled?:boolean}){return <Select classNamePrefix="rs" options={options} value={options.find(o=>o.value===value)??null} onChange={(opt)=>onChange((opt as Option | null)?.value ?? '')} isDisabled={isDisabled} isClearable isSearchable/>}
