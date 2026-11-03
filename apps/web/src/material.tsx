import React,{useEffect,useRef} from 'react';
import '@material/web/textfield/outlined-text-field.js';
import '@material/web/checkbox/checkbox.js';
import '@material/web/switch/switch.js';
import '@material/web/slider/slider.js';
import '@material/web/icon/icon.js';
import '@material/web/iconbutton/icon-button.js';

export function Icon({name,className=''}:{name:string;className?:string}) {
 return React.createElement('md-icon',{'aria-hidden':'true',className:`material-symbol ${className}`},name);
}
export function IconButton({label,icon,onClick,disabled=false,slot}:{label:string;icon:string;onClick:()=>void;disabled?:boolean;slot?:string}) {
 return React.createElement('md-icon-button',{'aria-label':label,title:label,type:'button',disabled,onClick,slot},<Icon name={icon}/>);
}
type ValueElement=HTMLElement&{value:string;checked:boolean;selected:boolean};
function useInput(ref:React.RefObject<ValueElement|null>,callback:(element:ValueElement)=>void) {
 useEffect(()=>{const element=ref.current;if(!element)return;const listener=()=>callback(element);element.addEventListener('input',listener);return()=>element.removeEventListener('input',listener);},[ref,callback]);
}
export function MaterialField({label,value,onChange,type='text',required=false,help='',min,max,disabled=false,clearLabel}:{label:string;value:string|number;onChange:(value:string)=>void;type?:string;required?:boolean;help?:string;min?:number;max?:number;disabled?:boolean;clearLabel:string}) {
 const ref=useRef<ValueElement>(null);useInput(ref,element=>onChange(element.value));
 return React.createElement('md-outlined-text-field',{ref,label,value:String(value),type,required,disabled,supportingText:help,min:min===undefined?undefined:String(min),max:max===undefined?undefined:String(max),autocomplete:type==='password'?'off':undefined,className:'material-field'},String(value).length>0?<IconButton slot="trailing-icon" label={clearLabel} icon="close" disabled={disabled} onClick={()=>{onChange('');ref.current?.focus();}}/>:undefined);
}
export function MaterialCheckbox({label,checked,onChange,disabled=false}:{label:string;checked:boolean;onChange:(value:boolean)=>void;disabled?:boolean}) {
 const ref=useRef<ValueElement>(null);useInput(ref,element=>onChange(element.checked));
 return React.createElement('md-checkbox',{ref,'aria-label':label,checked,disabled,touchTarget:'wrapper'});
}
export function MaterialSwitch({label,checked,onChange}:{label:string;checked:boolean;onChange:(value:boolean)=>void}) {
 const ref=useRef<ValueElement>(null);useInput(ref,element=>onChange(element.selected));
 return React.createElement('md-switch',{ref,'aria-label':label,selected:checked,icons:true});
}
export function MaterialSlider({label,value,onChange,min=0,max=100,step=1,disabled=false}:{label:string;value:number;onChange:(value:number)=>void;min?:number;max?:number;step?:number;disabled?:boolean}) {
 const ref=useRef<ValueElement>(null);useInput(ref,element=>onChange(Number(element.value)));
 return React.createElement('md-slider',{ref,'aria-label':label,value,min,max,step,disabled,labeled:true,ticks:max-min<=10,className:'material-slider'});
}
