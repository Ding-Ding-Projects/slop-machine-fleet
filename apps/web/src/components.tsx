import React,{useEffect,useRef,useId} from 'react';
import '@material/web/button/filled-button.js';
import '@material/web/button/outlined-button.js';
import {useUI} from './preferences';
import {Icon,IconButton,MaterialField,MaterialCheckbox,MaterialSlider} from './material';

export function BilingualLabel({children}:{children:React.ReactNode}) {
 const {prefs}=useUI();
 if(prefs.language!=='both'||typeof children!=='string'||!children.includes(' · '))return <>{children}</>;
 const split=children.indexOf(' · ');
 return <span className="bilingual-label"><span>{children.slice(0,split)}</span><span className="bilingual-secondary">{children.slice(split+3)}</span></span>;
}
export function Button({children,primary=false,...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&{primary?:boolean}) {
 return React.createElement(primary?'md-filled-button':'md-outlined-button',{...props,type:props.type||'button',className:[props.className,primary?'brand-action':''].filter(Boolean).join(' ')},<BilingualLabel>{children}</BilingualLabel>);
}
export function Badge({value}:{value:string}) {
 const state=value.toLowerCase();
 const group=['running','ready','connected','verified','succeeded','completed'].includes(state)?'running':['failed','error','unavailable'].includes(state)?'failed':['pending','code-issued','provisioning','starting','booting','checking','dispatching'].includes(state)?'provisioning':['draining','stopping','cancelling','expired'].includes(state)?'draining':'idle';
 const icon={running:'check_circle',failed:'error',provisioning:'progress_activity',draining:'hourglass_top',idle:'pause_circle'}[group];
 return <span className={`badge status-${group}`} title={value}><Icon name={icon}/><span>{value.replaceAll('_',' ')}</span></span>;
}
export function Empty({title,description,action}:{title:string;description:string;action?:React.ReactNode}) {
 return <div className="empty"><Icon name="desktop_windows" className="empty-icon"/><h2><BilingualLabel>{title}</BilingualLabel></h2><p>{description}</p>{action}</div>;
}
export function Modal({title,children,onClose,wide=false}:{title:string;children:React.ReactNode;onClose:()=>void;wide?:boolean}) {
 const ref=useRef<HTMLDialogElement>(null),titleId=useId(),{t}=useUI();
 useEffect(()=>{const before=document.activeElement as HTMLElement;ref.current?.showModal();return()=>{ref.current?.close();before?.focus();};},[]);
 return <dialog ref={ref} aria-labelledby={titleId} className={wide?'wide':''} onCancel={event=>{event.preventDefault();onClose();}}><header><h2 id={titleId}><BilingualLabel>{title}</BilingualLabel></h2><IconButton label={t('Close dialog','關閉對話框')} icon="close" onClick={onClose}/></header><div className="dialog-body">{children}</div></dialog>;
}
export function Field({label,value,onChange,type='text',required=false,help='',min,max,secret=false}:{label:string;value:string|number;onChange:(value:string)=>void;type?:string;required?:boolean;help?:string;min?:number;max?:number;secret?:boolean}) {
 const {t,prefs}=useUI();
 const split=prefs.language==='both'?label.indexOf(' · '):-1;
 return <div className="field"><MaterialField label={split<0?label:label.slice(0,split)} value={value} onChange={onChange} type={secret?'password':type} required={required} help={split<0?help:`${label.slice(split+3)}${help?' · '+help:''}`} min={min} max={max} clearLabel={`${t('Clear','清除')} ${label}`}/></div>;
}
export function Confirm({title,description,onConfirm,onClose,busy=false}:{title:string;description:string;onConfirm:()=>void;onClose:()=>void;busy?:boolean}) {
 const {t}=useUI(),[first,a]=React.useState(false),[second,b]=React.useState(false),[position,c]=React.useState(0);
 const firstLabel=t('I reviewed the exact affected targets.','已核對受影響對象。'),secondLabel=t('I understand the consequences and want to proceed.','明白後果並確認繼續。');
 return <Modal title={title} onClose={onClose}><p>{description}</p><label className="check"><MaterialCheckbox label={firstLabel} checked={first} onChange={value=>{a(value);c(0);}}/><BilingualLabel>{firstLabel}</BilingualLabel></label><label className="check"><MaterialCheckbox label={secondLabel} checked={second} onChange={value=>{b(value);c(0);}}/><BilingualLabel>{secondLabel}</BilingualLabel></label><div className="confirmation-slider"><span>{t('Move to 100 to authorize','移至 100 以授權')}</span><MaterialSlider label={t('Move to 100 to authorize','移至 100 以授權')} value={position} disabled={!first||!second} onChange={c}/><output>{position}%</output></div><div className="actions"><Button onClick={onClose}>{t('Emergency exit','立即取消')}</Button><Button primary disabled={busy||!first||!second||position!==100} onClick={onConfirm}>{busy?t('Working…','處理中…'):t('Confirm action','確認操作')}</Button></div></Modal>;
}
