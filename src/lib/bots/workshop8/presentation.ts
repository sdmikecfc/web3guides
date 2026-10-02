export type PresentationSettings={quality:'auto'|'standard'|'low';reducedMotion:boolean;steadyCamera:boolean};
export const PRESENTATION_KEY='mk8.presentation.1';
export const DEFAULT_PRESENTATION:PresentationSettings={quality:'auto',reducedMotion:false,steadyCamera:true};
export function readPresentation(value:unknown):PresentationSettings{
 const v=value as Partial<PresentationSettings>|null;
 return {quality:v&&['auto','standard','low'].includes(v.quality??'')?v.quality!: 'auto',reducedMotion:v?.reducedMotion===true,steadyCamera:v?.steadyCamera!==false};
}
