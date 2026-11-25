import {displayName} from "../../../shared/display-name.mjs";
import {Fragment,type ReactNode,type RefObject} from "react";
import {ArrowLeft,Users,Search,CalendarPlus,X,ChevronDown,LoaderCircle,Check,MessageCircle,ArrowDown,Plus} from "lucide-react";
import {Avatar,Button,Logo,cn} from "../../components";
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
import type {useChatScroll} from "../../useChatScroll";
import type {PendingMessage} from "../../useOptimisticMessages";
import type {ReactionChange} from "../../realtime";

const colors:Color[]=["purple", "coral", "green", "blue", "yellow"];
type FailedMessage={id:string;text:string;roomId:string};
type ChatPanelProps={
 room:Room|undefined;rooms:Room[];events:Plan[];userId:string;lang:string;locale:string;
 t:(key:string)=>string;time:(date:string)=>string;onBack:()=>void;onRoomPhoto:()=>void;
 onProfile?:(user:{id:string;name:string;image?:string|null})=>void;
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
export function ChatPanel({room,rooms,events,userId,lang,locale,t,time,onBack,onRoomPhoto,onProfile,showMembers,invite,onCreateEvent,onCreateRoom,showChatSearch,setShowChatSearch,chatQuery,setChatQuery,chatFilter,setChatFilter,pinnedMessages,chatScroll,canLoadOlder,onLoadOlder,busy,filtering,historyLoading,loadingMessages,filterLoading,currentMessages,rawMessages,bottomRef,eventCard,openDetail,messageAction,jumpToReply,setGalleryId,galleryId,deliverPending,pendingReactions,react,failed,sendMessage,replying,editing,setReplying,setEditing,selected,text,setText,sendAttachment,sendLocation,composerRef}:ChatPanelProps){
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
            <button
              className="icon-button highlight"
              aria-label={t("createEvent")}
              onClick={onCreateEvent}
            >
              <CalendarPlus size={20} />
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
            currentMessages
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
                        <button type="button" className="sender-name profile-name-link" onClick={()=>onProfile?.({id:m.senderId,name:m.senderName,image:m.senderImage})} disabled={!onProfile}>{displayName(m.senderName)}</button>
                      )}
                      {p ? (
                        eventCard(p)
                      ) : (
                        <>{m.pinned&&<small className="pinned-label">📌 {lang==="pt"?'Fixada':'Pinned'}</small>}
                        {m.replyTo&&!m.deleted&&<ReplyReference message={m} source={rawMessages.find(x=>x.id===m.replyTo)} ownId={userId} lang={lang} onJump={()=>{void jumpToReply(m.replyTo!)}}/>}
                        <div className="message-bubble">{m.deleted?(lang==="pt"?'Mensagem removida':'Message removed'):<><MessageMedia attachment={m.attachment} lang={lang} onOpen={()=>setGalleryId(m.id)}/><MessageText text={m.text}/></>}</div>{m.editedAt&&<small>{lang==="pt"?"editada":"edited"}</small>}</>
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
                                aria-label={t("react") + " " + emoji}
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
                                disabled={!!pendingReactions[m.id]}
                                onClick={() => react(m, emoji)}
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
                      <ReactionPicker label={t("react")} onReact={emoji=>{void react(m,emoji)}}/>
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
          <LiveMessageComposer editing={!!editing} key={selected} value={text} onChange={setText} onSubmit={()=>{void sendMessage()}} onAttach={sendAttachment} onShareLocation={sendLocation} sending={false} locale={locale} textareaRef={composerRef} allowOffice />

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
  </section>
 );
}
