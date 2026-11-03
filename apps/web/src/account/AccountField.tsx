import React,{useEffect,useRef} from 'react';
import '@material/web/textfield/outlined-text-field.js';
import {IconButton} from '../material';
import {useUI} from '../preferences';
type TextField=HTMLElement&{value:string};
export function AccountField({label,value,onChange,password=false,autocomplete,disabled=false,help='',maxLength=256}:{label:string;value:string;onChange:(value:string)=>void;password?:boolean;autocomplete:'username'|'current-password'|'new-password';disabled?:boolean;help?:string;maxLength?:number}){
 const ref=useRef<TextField>(null),{t}=useUI();
 useEffect(()=>{const field=ref.current;if(!field)return;const input=()=>onChange(field.value);field.addEventListener('input',input);return()=>field.removeEventListener('input',input);},[onChange]);
 return <div className="field">{React.createElement('md-outlined-text-field',{ref,label,value,type:password?'password':'text',autocomplete,required:true,disabled,maxLength,supportingText:help,spellcheck:false,autocapitalize:'none',className:'material-field'},value?<IconButton slot="trailing-icon" label={`${t('Clear','清除')} ${label}`} icon="close" disabled={disabled} onClick={()=>{onChange('');ref.current?.focus();}}/>:undefined)}</div>;
}
