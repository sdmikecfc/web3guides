/** Shared runtime equipment contract; no authoring or renderer dependency. */
export const SLOTS=['head','torso','armL','armR','legL','legR','weapon'] as const;
export type Slot=typeof SLOTS[number];
export type Entry={id:string;style:'tank'|'speed'|'ranged';family:string;tier:number;name:string;description:string;url:string;sha256:string;approval:string;weapon:string;hands?:number;thumbnailRoot?:string;offhand:boolean;slots:Slot[]};
export type Choices=Record<Slot,string>;
