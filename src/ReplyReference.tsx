import {CornerDownRight, X} from 'lucide-react';
import type {Message} from './types';
import {attachmentLabel} from './chatAttachmentLabels';

export function replySnapshot(source:Message|null){
  return source?{replyTo:source.id,replyText:source.text,replySenderId:source.senderId,replySenderName:source.senderName,replyDeleted:!!source.deleted,replyMime:source.attachment?.mime}:{};
}
export function ReplyReference({message,source,ownId,lang,onJump,onCancel}:{message:Message;source?:Message;ownId:string;lang:string;onJump?:()=>void;onCancel?:()=>void}){
  const pt=lang==='pt',deleted=source?source.deleted:message.replyDeleted;
  const authorId=source?.senderId??message.replySenderId;
  const author=authorId===ownId?(pt?'Você':'You'):(source?.senderName??message.replySenderName??(pt?'Mensagem anterior':'Earlier message'));
  const text=deleted?(pt?'Mensagem excluída':'Deleted message'):((source?source.text:message.replyText)?.trim()||attachmentLabel(source?.attachment?.mime??message.replyMime,pt?'pt-BR':'en')).replace(/\s+/g,' ');
  const content=<><strong>{author}:</strong><span>{text}</span></>;
  return <div className={'reply-reference'+(onCancel?' reply-draft':'')}>
    <CornerDownRight size={15} aria-hidden="true"/>
    {onJump&&!deleted?<button type="button" className="reply-reference-line" onClick={onJump} title={author+': '+text} aria-label={(pt?'Ir para mensagem de ':'Jump to message from ')+author}>{content}</button>:<span className="reply-reference-line" title={author+': '+text}>{content}</span>}
    {onCancel&&<button type="button" className="reply-cancel" onClick={onCancel} aria-label={pt?'Cancelar resposta':'Cancel reply'}><X size={16}/></button>}
  </div>;
}
