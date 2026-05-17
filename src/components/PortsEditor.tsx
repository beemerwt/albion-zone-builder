import PortRow from './PortRow';
export default function PortsEditor(props:any){return <div>{props.rows.map((r:any,i:number)=><PortRow key={r.key} {...props} row={r} index={i} active={props.selecting===i}/>)}<button className="btn btn-sm btn-outline-success" onClick={props.onAdd}>Add Port</button></div>}
