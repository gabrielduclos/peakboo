import {displayName} from "../../../shared/display-name.mjs";
import {Fragment,useEffect,useState,type ReactNode,type RefObject} from "react";
import {ArrowLeft,Users,Search,ListChecks,X,ChevronDown,LoaderCircle,Check,MessageCircle,ArrowDown,Plus} from "lucide-react";
import {Avatar,Button,Logo,Modal,cn} from "../../components";
import type {Room,Message,Plan,Color} from "../../types";
import {ReplyReference} from "../../ReplyReference";
import {SwipeReply} from "../../SwipeReply";
import {ReactionPicker} from "../../ReactionPicker";
import {ChatGallery} from "../../ChatGallery";
import {MessageActions,DaySeparator,ChatFilters,emptyFilter,type ChatFilter,type MessageAction} from "../../ChatTools";
import {LiveMessageComposer} from "../../LiveMessageComposer";
import {MessageMedia,MessageText,mediaLabel} from "../../Media";
import UpcomingEventsBar from "../../UpcomingEventsBar";
import {localDayKey} from "../../messageTimestamp";
import {senderColorIndex} from "../../senderColors";
import type {useChatScroll} from "../../useChatScroll";
import type {PendingMessage} from "../../useOptimisticMessages";
import type {ReactionChange} from "../../realtime";

import {ChecklistDialog,SharedChecklist,type ListDraft} from "./SharedChecklist";
import {suggestChecklist,type ChecklistOperation} from "../../../shared/checklists.mjs";

const colors:Color[]=["purple", "coral", "green", "blue", "yellow"];
type FailedMessage={id:string;text:string;roomId:string};
type ChatPanelProps={
 room:Room|undefined;rooms:Room[];events:Plan[];userId:string;lang:string;locale:string;
 t:(key:string)=>string;time:(date:string)=>string;onBack:()=>void;onRoomPhoto:()=>void;
 onProfile?:(user:{id:string;name:string;image?:string|null})=>void;
 onSaveList:(roomId:string,draft:ListDraft)=>Promise<void>;onUpdateList:(roomId:string,messageId:string,op:ChecklistOperation)=>Promise<void>;
 loadReactionMembers:(roomId:string)=>Promise<{id:string;name:string;image?:string|null}[]>;
 showMembers:()=>void;invite:()=>void;onCreateEvent:()=>void;onCreateRoom:()=>void;
 showChatSearch:boolean;setShowChatSearch:(value:boolean)=>void;chatQuery:string;setChatQuery:(value:string)=>void;
 chatFilter:ChatFilter;setChatFilter:(value:ChatFilter)=>void;pinnedMessages:Message[];
 chatScroll:ReturnType<typeof useChatScroll>;canLoadOlder:boolean;onLoadOlder:()=>void;busy:string|null;
 filtering:boolean;historyLoading:boolean;loadingMessages:boolean;filterLoading:boolean;
 currentMessages:Message[];rawMessages:Message[];bottomRef:RefObject<HTMLDivElement|null>;
 eventCard:(p:Plan)=>ReactNode;openDetail:(p:Plan)=>void;messageAction:(action:MessageAction,m:Message,target?:string)=>Promise<void>;
 jumpToReply:(id:string)=>void;setGalleryId:(id:string|null)=>void;galleryId:string|null;
 deliverPending:(m:PendingMessage)=>void;pendingReactions:Record<string,ReactionChange>;react:(m:Message,emoji:string)=>void;
 failed:FailedMessage|null;sendMessage:(retry?:FailedMessage|null)=>void;
 replying:Message|null;editing:Message|null;setReplying:(m:Message|null)=>void;setEditing:(m:Message|null)=>void;
 selected:string|null;text:string;setText:(text:string)=>void;sendAttachment:(file:File,caption:string)=>Promise<void>;
 sendLocation:(lat:number,lon:number,caption:string)=>Promise<void>;composerRef:RefObject<HTMLTextAreaElement|null>;
};
export function ChatPanel({room,rooms,events,userId,lang,locale,t,time,onBack,onRoomPhoto,onProfile,showMembers,invite,onCreateEvent,onCreateRoom,showChatSearch,setShowChatSearch,chatQuery,setChatQuery,chatFilter,setChatFilter,pinnedMessages,chatScroll,canLoadOlder,onLoadOlder,busy,filtering,historyLoading,loadingMessages,filterLoading,currentMessages,rawMessages,bottomRef,eventCard,openDetail,messageAction,jumpToReply,setGalleryId,galleryId,deliverPending,pendingReactions,react,failed,sendMessage,replying,editing,setReplying,setEditing,selected,text,setText,sendAttachment,sendLocation,composerRef,onSaveList,onUpdateList,loadReactionMembers}:ChatPanelProps){
 const [listDraft,setListDraft]=useState<{roomId:string;title:string;items:string[];source?:Message}|null>(null);
 const [reactionTarget,setReactionTarget]=useState<{roomId:string;userId:string;messageId:string}|null>(null);
 const [reactionPeople,setReactionPeople]=useState<{id:string;name:string;image?:string|null}[]>([]);
 const [reactionLoading,setReactionLoading]=useState(false);
 const [reactionError,setReactionError]=useState(false);
 const [reactionRetry,setReactionRetry]=useState(0);
 const activeReactionTarget=reactionTarget?.roomId===room?.id&&reactionTarget?.userId===userId?reactionTarget:null;
 const reactionMessage=activeReactionTarget?(currentMessages.find(m=>m.id===activeReactionTarget.messageId)||rawMessages.find(m=>m.id===activeReactionTarget.messageId)):undefined;
 useEffect(()=>{setListDraft(null);setReactionTarget(null);setReactionPeople([])},[room?.id,userId]);
 useEffect(()=>{
   if(!activeReactionTarget)return;
   let active=true;setReactionLoading(true);setReactionError(false);setReactionPeople([]);
   loadReactionMembers(activeReactionTarget.roomId).then(people=>{if(active)setReactionPeople(people)}).catch(()=>{if(active)setReactionError(true)}).finally(()=>{if(active)setReactionLoading(false)});
   return()=>{active=false};
 },[activeReactionTarget,reactionRetry]);

 return (
  <section className="chat-panel">
    {room ? (
      <>
        <div className="chat-header">
          <button
            className="icon-button mobile-back"
            aria-label={t("back")}
            onClick={onBack}
          >
            <ArrowLeft size={21} />
          </button>
          <button type="button" className="chat-photo-button" aria-label={lang==="pt"?"Foto do grupo":"Group photo"} onClick={onRoomPhoto}><Avatar image={room.image} name={room.name} color={room.color} /></button>
          <div className="chat-header-title">
            <h2>{room.name}</h2>
            <button onClick={showMembers}>
              <Users size={12} />
              {room.memberCount}{" "}
              {t(room.memberCount === 1 ? "member" : "members")}

            </button>
          </div>
          <div className="chat-header-actions">
            <button
              className="icon-button"
              aria-label={t("searchMessages")}
              aria-expanded={showChatSearch}
              aria-controls="chat-message-search"
              onClick={() => {
                setShowChatSearch(!showChatSearch);
                setChatQuery("");
              }}
            >
              <Search size={19} />
            </button>
            <button
              className="icon-button"
              aria-label={t("invite")}
              onClick={invite}
            >
              <Users size={19} />
            </button>
          </div>
        </div>
        {showChatSearch && (
          <div className="chat-search" id="chat-message-search" role="search">

            <input
              autoFocus
              value={chatQuery}
              onChange={(e) => setChatQuery(e.target.value)}
              placeholder={t("searchMessages")}
              aria-label={t("searchMessages")}
            />
            <button type="button" className="icon-button" aria-label={t("clearSearch")} onClick={()=>{setChatQuery('');setShowChatSearch(false)}}><X size={18}/></button>
          </div>
        )}
        {showChatSearch&&<ChatFilters value={chatFilter} onChange={setChatFilter} pt={lang==="pt"}/>}
        {!!pinnedMessages.length&&<div className="pinned-chat-bar" aria-label={lang==='pt'?'Mensagens fixadas':'Pinned messages'}><span>📌</span><button type="button" onClick={()=>{const first=pinnedMessages[0];const node=document.getElementById('message-'+first.id);if(node){node.scrollIntoView({block:'center',behavior:'smooth'});}else setChatFilter({...emptyFilter,kind:'pinned'})}}><strong>{lang==='pt'?'Mensagem fixada':'Pinned message'}{pinnedMessages.length>1?' · '+pinnedMessages.length:''}</strong><span>{pinnedMessages[0].text||mediaLabel(pinnedMessages[0].attachment?.mime||'',lang==='pt')}</span></button><button type="button" className="icon-button" aria-label={lang==='pt'?'Ver todas as fixadas':'View pinned messages'} onClick={()=>setChatFilter({...emptyFilter,kind:'pinned'})}><ChevronDown size={18}/></button></div>}
        <UpcomingEventsBar
          events={events}
          roomId={room.id}
          lang={lang}
          onSelect={openDetail}
        />
        <div
          ref={chatScroll.historyRef}
          onScroll={chatScroll.onScroll}
          className="chat-history"
          role="log"
          aria-label={t("conversations")}
          aria-live="polite"
        >
          {canLoadOlder && (
            <Button
              variant="ghost"
              className="older-button"
              busy={busy === "older"}
              onClick={onLoadOlder}
            >
              {t("loadOlder")}
            </Button>
          )}

          {!currentMessages.length&&<DaySeparator day={localDayKey(new Date())} value={chatFilter} onChange={setChatFilter} lang={lang}/>}
          {historyLoading ? (
            <div className="message-skeletons">
              <span className="skeleton" />
              <span className="skeleton" />
              <span className="skeleton" />
            </div>
          ) : (
            currentMessages.map(m=>({...m,reactions:m.reactions.filter(r=>r.userId!==m.senderId)}))
              .map((m, i, arr) => {
                const own = m.senderId === userId,
                  p = m.eventId
                    ? events.find((x) => x.id === m.eventId)
                    : null,
                  grouped =
                    i > 0 &&
                    localDayKey(new Date(arr[i-1].createdAt))===localDayKey(new Date(m.createdAt)) &&
                    arr[i - 1].senderId === m.senderId &&
                    !arr[i - 1].eventId &&
                    !p;
                const suggestion=own&&!m.deleted&&!m.pendingStatus&&!m.eventId&&!m.attachment&&!m.checklist?suggestChecklist(m.text):null;
                return (
                  <Fragment key={m.id}>
                  {(i===0||localDayKey(new Date(arr[i-1].createdAt))!==localDayKey(new Date(m.createdAt)))&&<DaySeparator day={localDayKey(new Date(m.createdAt))} value={chatFilter} onChange={setChatFilter} lang={lang}/>}
                  <SwipeReply
                    disabled={!!m.deleted||!!m.pendingStatus||!!p}
                    onReply={()=>{void messageAction('reply',m)}}
                    id={"message-"+m.id}
                    onContextMenu={e=>{if(!m.deleted&&!m.pendingStatus){e.preventDefault();e.currentTarget.querySelector<HTMLButtonElement>('[data-message-actions]')?.click()}}}
                    className={cn(
                      "message",
                      own && "own",
                      p && "event-message",
                      grouped && "grouped",
                    )}
                    key={m.id}
                  >
                    {!own && !grouped ? (
                      <Avatar
                        image={m.senderImage}
                        name={displayName(m.senderName)}
                        color={
                          colors[
                            (m.senderName.charCodeAt(0) || 0) % 5
                          ]
                        }
                        small
                      />
                    ) : (
                      <span className="message-avatar-spacer" />
                    )}
                    <div className="message-body">
                      {!own && !grouped && (
                        <button type="button" className="sender-name profile-name-link" data-sender-color={senderColorIndex(m.senderId)} onClick={()=>onProfile?.({id:m.senderId,name:m.senderName,image:m.senderImage})} disabled={!onProfile}>{displayName(m.senderName)}</button>
                      )}
                      {p ? (
                        eventCard(p)
                      ) : (
                        <>{m.pinned&&<small className="pinned-label">📌 {lang==="pt"?'Fixada':'Pinned'}</small>}
                        {m.replyTo&&!m.deleted&&<ReplyReference message={m} source={rawMessages.find(x=>x.id===m.replyTo)} ownId={userId} lang={lang} onJump={()=>{void jumpToReply(m.replyTo!)}}/>}
                        <div className="message-bubble">{m.deleted?(lang==="pt"?'Mensagem removida':'Message removed'):<><MessageMedia attachment={m.attachment} lang={lang} onOpen={()=>setGalleryId(m.id)}/>{m.checklist?<SharedChecklist list={m.checklist} pt={lang==="pt"} onChange={op=>onUpdateList(room.id,m.id,op)}/>:<MessageText text={m.text} lang={lang}/>} </>}</div>{suggestion&&<button className="shared-list-suggestion" type="button" onClick={()=>setListDraft({roomId:room.id,title:suggestion.title,items:suggestion.items,source:m})}><ListChecks size={16}/>{lang==="pt"?"Transformar em lista":"Turn into a list"}</button>}{m.editedAt&&<small>{lang==="pt"?"editada":"edited"}</small>}</>
                      )}
                      {m.pendingStatus&&<div className="pending-message" role="status">{m.pendingStatus==='sending'?<><LoaderCircle size={12} className="spin"/>{lang==='pt'?'Enviando…':'Sending…'}</>:<><span>{lang==='pt'?'Não enviada':'Not sent'}</span><button type="button" onClick={()=>void deliverPending(m as PendingMessage)}>{lang==='pt'?'Tentar novamente':'Retry'}</button></>}</div>}
                      <div className="message-footer">
                        {m.reactions.length > 0 && (
                          <span className="reactions">
                            {[
                              ...new Set(
                                m.reactions.map((r) => r.emoji),
                              ),
                            ].map((emoji) => (
                              <button
                                aria-label={(lang==="pt"?"Ver quem reagiu":"See who reacted")+" "+emoji}
                                key={emoji}
                                className={
                                  m.reactions.some(
                                    (r) =>
                                      r.userId === userId &&
                                      r.emoji === emoji,
                                  )
                                    ? "mine"
                                    : ""
                                }
                                onClick={() => {setReactionPeople([]);setReactionLoading(true);setReactionError(false);setReactionTarget({roomId:room.id,userId,messageId:m.id})}}
                              >
                                <span className="reaction-emoji" key={emoji+":"+m.reactions.filter(r=>r.emoji===emoji).length+":"+m.reactions.some(r=>r.emoji===emoji&&r.userId===userId)}>{emoji}</span>
                                <small>
                                  {
                                    m.reactions.filter(
                                      (r) => r.emoji === emoji,
                                    ).length
                                  }
                                </small>
                              </button>
                            ))}
                          </span>
                        )}
                        <time dateTime={m.createdAt}>
                          {time(m.createdAt)}
                        </time>
                        {own && !m.pendingStatus && (
                          <Check size={12} aria-label={t("send")} />
                        )}
                      </div>
                    </div>
                    {!m.deleted&&!m.pendingStatus&&<div className="message-actions">
                      {!own&&<ReactionPicker label={t("react")} selectedEmoji={m.reactions.find(r=>r.userId===userId)?.emoji} disabled={!!pendingReactions[m.id]} onReact={emoji=>{void react(m,emoji)}}/>}
                      <MessageActions message={m} own={own} pt={lang==="pt"} rooms={rooms} onAction={messageAction}/>
                    </div>}
                  </SwipeReply></Fragment>
                );
              })
          )}
          {!filtering && !loadingMessages && !currentMessages.length && (
            <div className="empty-state">
              <MessageCircle size={32} />
              <h3>{t("conversationStarted")}</h3>
              <p>{t("conversationStartedDesc")}</p>
            </div>
          )}
          {filtering && !filterLoading && !currentMessages.length &&
            !currentMessages.some((m) =>
              m.text.toLowerCase().includes(chatQuery.toLowerCase()),
            ) && <p className="no-search-result">{t("noResults")}</p>}
          <div ref={bottomRef} />
        </div>
        {chatScroll.away&&<button className="jump-to-latest" type="button" onClick={chatScroll.jump} aria-label={lang==='pt'?'Voltar para a última mensagem':'Go to latest message'}><ArrowDown size={18}/>{chatScroll.newCount>0?<span>{chatScroll.newCount} {lang==='pt'?(chatScroll.newCount===1?'nova mensagem':'novas mensagens'):(chatScroll.newCount===1?'new message':'new messages')}</span>:null}</button>}
        <ChatGallery messages={rawMessages} selectedId={galleryId} onSelect={setGalleryId} onClose={()=>setGalleryId(null)} lang={lang}/>
        {failed && (
          <div className="send-error" role="alert">
            {t("failedSend")}
            <button onClick={() => sendMessage(failed)}>
              {t("retry")}
            </button>
          </div>
        )}
        <div className="composer-wrapper peakboo-composer">
          {replying&&!editing&&<ReplyReference message={replying} source={replying} ownId={userId} lang={lang} onCancel={()=>setReplying(null)}/>}
          {editing&&<div className="composer-context"><span>{editing?(lang==="pt"?'Editando mensagem':'Editing message'):(lang==="pt"?'Respondendo':'Replying')}: {(replying||editing)?.text||mediaLabel((replying||editing)?.attachment?.mime||'',lang==='pt')}</span><button type="button" aria-label={lang==="pt"?'Cancelar':'Cancel'} onClick={()=>{setReplying(null);if(editing)setText('');setEditing(null)}}>×</button></div>}
          <LiveMessageComposer editing={!!editing} key={selected} value={text} onChange={setText} onSubmit={()=>{void sendMessage()}} onAttach={sendAttachment} onShareLocation={sendLocation} sending={false} locale={locale} textareaRef={composerRef} allowOffice onCreateEvent={onCreateEvent} onCreateList={()=>setListDraft({roomId:room.id,title:"",items:[]})}/>
          {listDraft?.roomId===room.id&&<ChecklistDialog key={room.id+":"+(listDraft.source?.id||"new")} pt={lang==="pt"} initial={listDraft} onClose={()=>setListDraft(null)} onSave={draft=>onSaveList(room.id,draft)}/>}

        </div>
      </>
    ) : (
      <div className="empty-state chat-empty">
        <Logo compact />
        <h2>{t("connectTitle")}</h2>
        <p>{t("connectDesc")}</p>
        <Button
          onClick={() => {
            onCreateRoom();
          }}
        >
          <Plus size={17} />
          {t("newConversation")}
        </Button>
      </div>
    )}
    {activeReactionTarget&&reactionMessage&&!reactionMessage.deleted&&<Modal open onOpenChange={v=>{if(!v)setReactionTarget(null)}} title={lang==="pt"?"Reações":"Reactions"} closeLabel={t("close")}>
      {reactionLoading?<div role="status" className="flex justify-center p-4"><LoaderCircle className="spin" aria-label={lang==="pt"?"Carregando":"Loading"}/></div>:reactionError?<div role="alert"><p>{t("error")}</p><Button onClick={()=>setReactionRetry(v=>v+1)}>{t("retry")}</Button></div>:<div className="member-list">
        {reactionMessage.reactions.filter(r=>r.userId!==reactionMessage.senderId).map(r=>{const person=reactionPeople.find(p=>p.id===r.userId);const name=person?.name||(lang==="pt"?"Participante indisponível":"Participant unavailable");return <div key={r.userId}><Avatar name={displayName(name)} image={person?.image} small/><span className="min-w-0 flex-1 break-words">{displayName(name)}</span><span className="shrink-0 text-lg">{r.emoji}</span></div>})}
        {!reactionMessage.reactions.some(r=>r.userId!==reactionMessage.senderId)&&<p className="muted">{lang==="pt"?"Nenhuma reação":"No reactions"}</p>}
      </div>}
    </Modal>}
  </section>
 );
}
