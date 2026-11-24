import {useRef,useState} from 'react';
import {Smile} from 'lucide-react';
import {AnchoredMenu} from './AnchoredMenu';
export const reactions=['❤️','👍','😂','🎉','🔥','😊','😍','🥰','😮','😢','😭','😡','🤔','😎','🙏','👏','🙌','💪','👀','✅','💯','🤝','👎','💔'];
export function ReactionPicker({label,onReact}:{label:string;onReact:(emoji:string)=>void}){const [open,setOpen]=useState(false),trigger=useRef<HTMLButtonElement>(null);return <><button type="button" ref={trigger} className="icon-button tiny" aria-label={label} aria-expanded={open} aria-haspopup="menu" onClick={()=>setOpen(!open)}><Smile size={17}/></button><AnchoredMenu open={open} onClose={()=>setOpen(false)} anchor={trigger} label={label}><div className="reaction-grid">{reactions.map(emoji=><button role="menuitem" type="button" key={emoji} aria-label={emoji} onClick={()=>{onReact(emoji);setOpen(false)}}>{emoji}</button>)}</div></AnchoredMenu></>}
