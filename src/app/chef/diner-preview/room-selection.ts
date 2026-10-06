/** Chair selections retain the table's stable identity, including imported IDs. */
export function roomChairSelection(id:string|null|undefined):{tableId:string;index:number}|null {
  const match=id?.match(/^chair:(.+):(\d+)$/);
  return match?{tableId:match[1],index:Number(match[2])}:null;
}
