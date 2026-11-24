import {useEffect,useState} from 'react';
import {QrCode} from 'lucide-react';
import {Button,Modal} from './components';
export function InvitationTools({url,name,lang}:{url:string;name:string;lang:string}){
 const pt=lang==='pt';const [open,setOpen]=useState(false),[svg,setSvg]=useState(''),[error,setError]=useState(false);
 useEffect(()=>{if(!open)return;let live=true;setSvg('');setError(false);import('qrcode').then(({default:QRCode})=>QRCode.toString(url,{type:'svg',margin:4,errorCorrectionLevel:'M'})).then(value=>{if(live)setSvg('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(value))}).catch(()=>{if(live)setError(true)});return()=>{live=false}},[open,url]);
 return <><div className="invite-options"><Button variant="outline" onClick={()=>setOpen(true)}><QrCode size={18}/>{pt?'Mostrar QR Code':'Show QR code'}</Button></div><Modal open={open} onOpenChange={setOpen} title="QR Code" description={name} closeLabel={pt?'Fechar':'Close'}>{error?<p role="alert">{pt?'Não foi possível gerar o QR Code.':'Could not generate the QR code.'}</p>:svg?<div className="invite-qr"><img src={svg} width={288} height={288} alt={pt?'QR Code do convite':'Invitation QR code'}/><p>{pt?'Escaneie para entrar no grupo.':'Scan to join the group.'}</p><a href={url}>{url}</a></div>:<div className="social-skeleton" role="status" aria-label={pt?'Carregando':'Loading'}/>}</Modal></>;
}
