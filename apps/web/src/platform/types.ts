import type {ReactNode} from 'react';
export type Words={en:string;yue:string};
export type PlatformTab={id:string;destinationId:string;workspaceKey:string;pinned:boolean};
export type Destination={id:string;label:Words;description:Words;icon:string;kind:'workspace'|'utility'|'settings'|'tool';render:(tab:PlatformTab)=>ReactNode;canLeave?:(tab:PlatformTab)=>boolean|Promise<boolean>};
export type SettingRegistration={id:string;label:Words;description:Words;destinationId:string;elementId:string;prepare?:(context:{tabId:string})=>void|Promise<void>};
export type ElementRegistration={id:string;label:Words};
export type Appearance={foreground?:string;background?:string;fontFamily?:string;fontSize?:number;fontWeight?:number;padding?:number;gap?:number;radius?:number;borderWidth?:number;reduceMotion?:boolean};
export type SafeStatus={kind:'operation'|'settings'|'export'|'navigation';outcome:'queued'|'running'|'completed'|'failed'|'cancelled'|'partial'|'unavailable';destinationId:string;count:number};
