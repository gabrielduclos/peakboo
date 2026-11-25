import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import {build} from 'esbuild';import {JSDOM} from 'jsdom';import {pathToFileURL} from 'node:url';
// Import React DOM after browser globals so Radix uses its browser portal implementation.
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://main.peakboo.workers.dev',pretendToBeVisual:true});
for(const key of ['window','document','navigator','HTMLElement','Element','Node','NodeFilter','MutationObserver','CustomEvent','Event','localStorage','sessionStorage','location','history','HTMLInputElement'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
const {createElement,act}=await import('react');const {createRoot}=await import('react-dom/client');const dir=await mkdtemp(process.cwd()+'/.ui-test-');
async function mount(entry){const out=dir+'/'+entry.split('/').at(-1)+'.mjs';await build({entryPoints:[entry],outfile:out,bundle:true,platform:'browser',format:'esm',packages:'external',jsx:'automatic',define:{'import.meta.env':'{}'}});const {default:App}=await import(pathToFileURL(out));const root=createRoot(document.getElementById('root'));await act(async()=>{root.render(createElement(App));await new Promise(r=>setTimeout(r,0))});return root;}
try{
 await test('shared checklist supports completing items and reports progress',async()=>{
 const out=dir+'/shared-list.mjs';await build({entryPoints:['src/features/chat/SharedChecklist.tsx'],outfile:out,bundle:true,platform:'browser',format:'esm',packages:'external',jsx:'automatic',define:{'import.meta.env':'{}'}});
 const {SharedChecklist}=await import(pathToFileURL(out));const root=createRoot(document.getElementById('root'));
 let list={title:'Compras',version:1,items:[{id:'rice',text:'Arroz',done:false},{id:'milk',text:'Leite',done:false}]},op;
 const render=async()=>act(async()=>root.render(createElement(SharedChecklist,{list,pt:true,onChange:async change=>{op=change;list={...list,version:2,items:list.items.map(i=>i.id===change.id?{...i,done:change.done}:i)}}})));
 try{await render();assert.equal(document.querySelector('progress').value,0);await act(async()=>document.querySelector('.shared-list-item input').click());assert.deepEqual(op,{kind:'toggle',id:'rice',done:true});await render();assert.equal(document.querySelector('progress').value,1);assert.ok(document.querySelector('.shared-list-item label.done'));assert.ok(document.querySelector('[aria-label="Adicionar item"]'))}finally{await act(async()=>root.unmount())}
 });
 await test('shared chat panel preserves empty state and create-group callback',async()=>{
 const out=dir+'/chat-panel.mjs';await build({entryPoints:['src/features/chat/ChatPanel.tsx'],outfile:out,bundle:true,platform:'browser',format:'esm',packages:'external',jsx:'automatic',define:{'import.meta.env':'{}'}});
 const {ChatPanel}=await import(pathToFileURL(out));const root=createRoot(document.getElementById('root'));let created=0;
 try{await act(async()=>root.render(createElement(ChatPanel,{room:undefined,t:k=>k,onCreateRoom:()=>created++})));assert.ok(document.querySelector('.chat-panel .chat-empty'));assert.equal(document.querySelector('.chat-empty h2').textContent,'connectTitle');await act(async()=>document.querySelector('.chat-empty button').click());assert.equal(created,1);assert.equal(document.querySelector('.chat-history'),null)}finally{await act(async()=>root.unmount())}
 });
 await test('shared calendar preserves month week agenda views and event callbacks',async()=>{
 const out=dir+'/calendar-views.mjs';await build({entryPoints:['src/features/calendar/CalendarViews.tsx'],outfile:out,bundle:true,platform:'browser',format:'esm',packages:'external',jsx:'automatic',define:{'import.meta.env':'{}'}});
 const {CalendarPage,EventCard}=await import(pathToFileURL(out));const root=createRoot(document.getElementById('root'));
 const date=new Date(2026,10,25,12),plan={id:'event',roomId:'room',creatorId:'me',title:'Test event',description:'',location:'Park',startsAt:new Date(2026,10,25,12).toISOString(),endsAt:new Date(2026,10,25,13).toISOString(),color:'blue',cancelled:false,rsvps:[{userId:'me',name:'Alex',status:'yes'}]};
 const room={id:'room',name:'Test group',description:'',color:'blue',ownerId:'me',memberCount:1,unread:0};
 let calendarMode='month',chosenDay=null,calendarDate=date,hiddenCalendars=[],opened,createdDay,moved,created=0,rsvp;
 const setter=(get,set)=>v=>set(typeof v==='function'?v(get()):v);const fmt=(d,o)=>new Date(d).toLocaleString('en-US',o),time=d=>fmt(d,{hour:'2-digit',minute:'2-digit'}),t=k=>k;
 const render=async()=>act(async()=>root.render(createElement(CalendarPage,{calendarDate,chosenDay,events:[plan],rooms:[room],hiddenCalendars,calendarMode,fmt,time,t,today:date,onMove:n=>moved=n,onChooseMiniDay:d=>chosenDay=d,onNewEvent:()=>created++,onNewEventOnDay:d=>createdDay=d,onDetail:p=>opened=p.id,setHiddenCalendars:setter(()=>hiddenCalendars,v=>hiddenCalendars=v),setCalendarDate:setter(()=>calendarDate,v=>calendarDate=v),setChosenDay:setter(()=>chosenDay,v=>chosenDay=v),setCalendarMode:setter(()=>calendarMode,v=>calendarMode=v)})));
 try{await render();assert.equal(document.querySelectorAll('.month-cell').length,42);await act(async()=>document.querySelector('.calendar-event').click());assert.equal(opened,'event');await act(async()=>document.querySelector('.day-number').click());assert.ok(createdDay instanceof Date);await act(async()=>document.querySelector('.calendar-actions button').click());assert.equal(created,1);await act(async()=>document.querySelector('.month-label [aria-label=next]').click());assert.equal(moved,1);await act(async()=>document.querySelectorAll('.segmented button')[1].click());await render();assert.equal(document.querySelectorAll('.week-day').length,7);assert.ok(document.querySelector('.week-event'));await act(async()=>document.querySelectorAll('.segmented button')[2].click());await render();assert.ok(document.querySelector('.agenda-row'));await act(async()=>document.querySelector('.your-calendars input').click());await render();assert.equal(document.querySelector('.agenda-row'),null);await act(async()=>root.render(createElement(EventCard,{plan,userId:'me',fmt,time,t,busy:null,onDetail:p=>opened=p.id,onRsvp:(p,status)=>rsvp=status})));await act(async()=>document.querySelector('.rsvp-button').click());assert.equal(rsvp,'maybe')}finally{await act(async()=>root.unmount())}
 });
 await test('shared groups panel preserves previews, filtering, loading and navigation callbacks',async()=>{
 const out=dir+'/groups-panel.mjs';await build({entryPoints:['src/features/groups/GroupsPanel.tsx'],outfile:out,bundle:true,platform:'browser',format:'esm',packages:'external',jsx:'automatic',define:{'import.meta.env':'{}'}});
 const {GroupsPanel}=await import(pathToFileURL(out));const root=createRoot(document.getElementById('root'));let chosen,created=0,joined=0,query='',filter='all';
 const rooms=[{id:'a',name:'Alpha',description:'',color:'blue',ownerId:'me',memberCount:2,unread:2,preview:{kind:'message',senderId:'peer',senderName:'Ana',text:'Olá'}},{id:'b',name:'Beta',description:'',color:'green',ownerId:'me',memberCount:3,unread:0,preview:{kind:'reaction',actorName:'Bia',emoji:'❤️',text:'Tudo bem'}}];
 const render=async(loading=false)=>act(async()=>root.render(createElement(GroupsPanel,{rooms,userId:'me',lang:'pt',selected:'a',loading,query,filter,t:key=>key,time:date=>date,onQueryChange:v=>query=v,onFilterChange:v=>filter=v,onSelect:r=>chosen=r.id,onCreate:()=>created++,onJoin:()=>joined++})));
 try{await render(true);assert.equal(document.querySelectorAll('.room-skeleton').length,4);await render();const rows=()=>[...document.querySelectorAll('.conversation-item')];assert.equal(rows().length,2);assert.ok(rows()[0].textContent.includes('Ana: Olá'));assert.ok(rows()[1].textContent.includes('Bia reagiu ❤️'));assert.ok(rows()[0].classList.contains('selected'));await act(async()=>rows()[1].click());assert.equal(chosen,'b');await act(async()=>document.querySelector('.new-chat').click());await act(async()=>document.querySelector('.join-shortcut').click());assert.equal(created,1);assert.equal(joined,1);await act(async()=>document.querySelectorAll('.conversation-tabs button')[1].click());assert.equal(filter,'unread');await render();assert.equal(rows().length,1);filter='all';query='beta';await render();assert.equal(rows().length,1);assert.ok(rows()[0].textContent.includes('Beta'));await act(async()=>document.querySelector('[aria-label="clearSearch"]').click());assert.equal(query,'');query='no match';await render();assert.ok(document.querySelector('.small-empty').textContent.includes('noResults'))}finally{await act(async()=>root.unmount())}
 });
 await test('PWA install invite is limited to one local day and skips installed apps',async()=>{
 const out=dir+'/pwa-install.mjs';await build({entryPoints:['src/pwaInstall.ts'],outfile:out,bundle:true,platform:'browser',format:'esm'});
 const pwa=await import(pathToFileURL(out));const day=pwa.localDay(new Date(2026,10,25,7));assert.equal(day,'2026-11-25');
 assert.equal(pwa.shouldInviteInstall(false,'2026-11-24',day,true),true);
 assert.equal(pwa.shouldInviteInstall(false,day,day,true),false);
 assert.equal(pwa.shouldInviteInstall(true,'',day,true),false);
 assert.equal(pwa.shouldInviteInstall(false,'',day,false),false);
 const event=new Event('beforeinstallprompt',{cancelable:true});let calls=0;Object.defineProperties(event,{prompt:{value:async()=>{calls++}},userChoice:{value:Promise.resolve({outcome:'dismissed'})}});
 window.dispatchEvent(event);assert.ok(event.defaultPrevented);assert.equal(pwa.installationState().native,true);
 assert.equal(await pwa.installNative(),'dismissed');assert.equal(calls,1);assert.equal(await pwa.installNative(),'unavailable');
 pwa.markInstallInvite();assert.equal(pwa.installationState().lastDay,pwa.localDay());localStorage.removeItem('peakboo-install-invite-day');
 localStorage.setItem('peakboo-pwa-installed','1');
 assert.equal(pwa.installedPwa(),true);assert.equal(pwa.isPwaWindow(),false);
 const originalMatch=window.matchMedia;window.matchMedia=q=>({matches:q==='(display-mode: standalone)'});
 try{assert.equal(pwa.isPwaWindow(),true);window.matchMedia=q=>({matches:q==='(display-mode: fullscreen)'});assert.equal(pwa.isPwaWindow(),false)}finally{window.matchMedia=originalMatch;localStorage.removeItem('peakboo-pwa-installed')}

 });
 await test('mobile history restores the previous internal page and visual viewport tracks the keyboard',async()=>{
 const out=dir+'/app-navigation.mjs';await build({entryPoints:['src/appNavigation.ts'],outfile:out,bundle:true,platform:'browser',format:'esm',packages:'external'});
 const {useAppNavigation,useMobileViewport}=await import(pathToFileURL(out));const {useState}=await import('react');
 const originalWidth=window.innerWidth,originalViewport=Object.getOwnPropertyDescriptor(window,'visualViewport');
 const viewport=new dom.window.EventTarget();Object.assign(viewport,{height:740,offsetTop:0,scale:1});
 Object.defineProperty(window,'visualViewport',{value:viewport,configurable:true});window.innerWidth=390;
 const root=createRoot(document.getElementById('root'));let navigate;
 function Harness(){const [view,setView]=useState('chats'),[mobile,setMobile]=useState(false),[selected,setSelected]=useState(null);
 useMobileViewport();useAppNavigation('navigation-test',view,mobile,selected,['room-a'],setView,setMobile,setSelected);
 navigate=(next)=>{setView(next==='calendar'?'calendar':'chats');setMobile(next==='room');if(next==='room')setSelected('room-a')};
 return createElement('div',{id:'route'},view==='calendar'?'calendar':mobile?selected:'groups')}
 const back=()=>act(async()=>{const done=new Promise(resolve=>window.addEventListener('popstate',resolve,{once:true}));history.back();await done});
 try{
 await act(async()=>root.render(createElement(Harness)));
 assert.equal(document.querySelector('#route').textContent,'groups');
 await act(async()=>navigate('room'));assert.equal(history.state.peakbooNavigation.route,'room:room-a');
 await act(async()=>navigate('calendar'));assert.equal(history.state.peakbooNavigation.route,'calendar');
 await back();assert.equal(document.querySelector('#route').textContent,'room-a');
 await back();assert.equal(document.querySelector('#route').textContent,'groups');
 viewport.height=410;viewport.offsetTop=12;viewport.dispatchEvent(new Event('resize'));
 assert.equal(document.documentElement.style.getPropertyValue('--peakboo-visible-height'),'410px');
 assert.equal(document.documentElement.style.getPropertyValue('--peakboo-visible-top'),'12px');
 viewport.scale=2;viewport.dispatchEvent(new Event('resize'));assert.equal(document.documentElement.style.getPropertyValue('--peakboo-visible-height'),'');
 }finally{await act(async()=>root.unmount());window.innerWidth=originalWidth;if(originalViewport)Object.defineProperty(window,'visualViewport',originalViewport);else delete window.visualViewport}
 });
 await test('reaction replacement is idempotent and preserves other users',async()=>{
 const out=dir+'/reaction.mjs';await build({entryPoints:['src/realtime.ts'],outfile:out,bundle:true,platform:'browser',format:'esm'});const {applyReaction}=await import(pathToFileURL(out));
 const message={id:'m',reactions:[{userId:'me',emoji:'👍'},{userId:'other',emoji:'❤️'}]};
 const change={messageId:'m',userId:'me',emoji:'🔥',active:true};
 assert.equal(applyReaction({...message,senderId:'me'},change).reactions[0].emoji,'👍');
 const changed=applyReaction(message,change);assert.deepEqual(changed.reactions,[{userId:'other',emoji:'❤️'},{userId:'me',emoji:'🔥'}]);
 assert.equal(applyReaction(changed,change),changed);
 assert.equal(applyReaction(changed,{...change,emoji:'👍',active:false}),changed);
 assert.deepEqual(applyReaction(changed,{...change,active:false}).reactions,[{userId:'other',emoji:'❤️'}]);
 });
 await test('reply reference shows author, media fallback and redacts deleted sources',async()=>{
 const out=dir+'/reply-reference.mjs';await build({entryPoints:['src/ReplyReference.tsx'],outfile:out,bundle:true,platform:'browser',format:'esm',packages:'external',jsx:'automatic'});const {ReplyReference,replySnapshot}=await import(pathToFileURL(out));
 const source={id:'original',text:'Full original text',senderId:'peer',senderName:'Maria',createdAt:'2026-11-24',reactions:[]};let jumped=0,cancelled=0;const root=createRoot(document.getElementById('root'));
 const render=props=>act(async()=>root.render(createElement(ReplyReference,{message:{...source,...replySnapshot(source)},ownId:'me',lang:'pt',...props})));
 try{await render({onJump:()=>jumped++});assert.ok(document.querySelector('.reply-reference svg'));assert.ok(document.body.textContent.includes('Maria:Full original text'));await act(async()=>document.querySelector('.reply-reference-line').click());assert.equal(jumped,1);
 await render({source:{...source,text:'',attachment:{mime:'audio/webm'}},onCancel:()=>cancelled++});assert.ok(document.body.textContent.includes('Áudio'));await act(async()=>document.querySelector('[aria-label="Cancelar resposta"]').click());assert.equal(cancelled,1);
 await render({source:{...source,deleted:true},onJump:()=>jumped++});assert.ok(document.body.textContent.includes('Mensagem excluída'));assert.ok(!document.body.textContent.includes('Full original text'));assert.equal(document.querySelector('button.reply-reference-line'),null);
 await render({source:{...source,senderId:'me'},lang:'en'});assert.ok(document.body.textContent.includes('You:'));
 }finally{await act(async()=>root.unmount())}
 });

 await test('session persists across tab storage loss, survives temporary failures, and clears on confirmed expiry',async()=>{
 const out=dir+'/session-api.mjs';await build({entryPoints:['src/api.ts'],outfile:out,bundle:true,platform:'browser',format:'esm',define:{'import.meta.env':'{}'}});const api=await import(pathToFileURL(out));
 localStorage.removeItem(api.SESSION_KEY);sessionStorage.setItem(api.SESSION_KEY,'legacy-token');
 try{
 assert.equal(api.getToken(),'legacy-token');assert.equal(sessionStorage.getItem(api.SESSION_KEY),null);assert.equal(localStorage.getItem(api.SESSION_KEY),'legacy-token');
 sessionStorage.clear();assert.equal(api.getToken(),'legacy-token');
 globalThis.fetch=async()=>{throw Error('offline')};await assert.rejects(api.request('/api/bootstrap'),/NETWORK_ERROR/);assert.equal(api.getToken(),'legacy-token');
 globalThis.fetch=async()=>new Response(JSON.stringify({error:'SERVICE_UNAVAILABLE'}),{status:503});await assert.rejects(api.request('/api/bootstrap'),/SERVICE_UNAVAILABLE/);assert.equal(api.getToken(),'legacy-token');
 globalThis.fetch=async()=>new Response(JSON.stringify({error:'UNAUTHORIZED'}),{status:401});await assert.rejects(api.request('/api/bootstrap'),/UNAUTHORIZED/);assert.equal(api.getToken(),null);
 globalThis.fetch=async()=>new Response('{}',{headers:{'set-auth-token':'fresh-token'}});await api.request('/api/auth/sign-in/email','POST',{});assert.equal(localStorage.getItem(api.SESSION_KEY),'fresh-token');api.clearToken();assert.equal(api.getToken(),null);
 }finally{api.clearToken()}
 });
 await test('offline startup keeps the persisted session and offers retry rather than login',async()=>{
 localStorage.setItem('peakboo-session','offline-session');globalThis.fetch=async()=>{throw Error('offline')};const root=await mount('src/App.tsx');
 try{assert.equal(localStorage.getItem('peakboo-session'),'offline-session');assert.equal(document.querySelector('input[type=password]'),null);assert.ok(document.body.textContent.includes('Sua sessão foi mantida'));assert.ok([...document.querySelectorAll('button')].some(b=>b.textContent==='Tentar novamente'))}
 finally{await act(async()=>root.unmount());localStorage.removeItem('peakboo-session')}
 });
 await test('production ignores stored examples and requires real authentication',async()=>{localStorage.setItem('peakboo-demo-v1',JSON.stringify({boot:{user:{name:'FAKE ACCOUNT'},rooms:[{name:'FAKE ROOM'}]}}));let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected network')};const root=await mount('src/App.tsx');try{assert.ok(document.querySelector('input[type=password]'));assert.ok(document.querySelector('[role=dialog]'));assert.equal(document.querySelector('.auth-tabs .active').textContent,'Entrar');assert.ok(!document.activeElement.closest('.auth-tabs'));assert.equal(document.querySelector('input[name=name]'),null);assert.equal(document.querySelector('input[name=password]').minLength,8);await act(async()=>document.querySelector('.auth-tabs button:first-child').click());assert.ok(document.querySelector('input[name=name]'));assert.equal(document.querySelector('input[name=password]').autocomplete,'new-password');await act(async()=>document.querySelector('.password-input button').click());assert.equal(document.querySelector('input[name=password]').type,'text');await act(async()=>document.querySelector('.password-input button').click());assert.equal(document.querySelector('input[name=password]').type,'password');await act(async()=>document.querySelector('.auth-tabs button:last-child').click());assert.equal(document.querySelector('input[name=name]'),null);assert.equal(document.querySelector('input[name=password]').autocomplete,'current-password');assert.ok(!document.body.textContent.includes('FAKE ROOM'));assert.ok(!document.body.textContent.includes('Alex Morgan'));assert.ok(!document.querySelector('.demo-banner'));assert.equal(calls,0)}finally{await act(async()=>root.unmount())}});
 await test('portfolio ignores real sessions, renders sample rooms and never requests authentication',async()=>{localStorage.removeItem('peakboo-demo-v1');localStorage.setItem('peakboo-session','real-session-must-not-be-used');let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected network')};const root=await mount('src/portfolio/PortfolioApp.tsx');try{assert.ok(document.body.textContent.includes('Pessoal do fim de semana'));assert.ok(document.querySelector('.demo-banner'));assert.equal(document.querySelector('.sidebar-note'),null);assert.ok(document.querySelector('.chat-events-bar'));assert.equal(document.querySelector('input[type=password]'),null);
 assert.ok(document.querySelector('.search-field input'));assert.equal(document.querySelector('.conversation-title [aria-expanded]'),null);
 const searchToggle=document.querySelector('.chat-header [aria-controls="chat-message-search"]');assert.ok(searchToggle);await act(async()=>searchToggle.click());assert.ok(document.querySelector('.chat-panel > .chat-search'));assert.ok(document.querySelector('.chat-header-title h2'));await act(async()=>searchToggle.click());assert.equal(document.querySelector('.chat-search'),null);assert.ok(document.querySelector('.search-field input'));
 const day=document.querySelector('.day-separator button');assert.ok(day);await act(async()=>day.click());assert.ok(document.querySelector('[role=menu][aria-label="Filtrar período"]'));assert.equal(document.querySelector('.chat-search'),null);await act(async()=>document.querySelector('.bubble-menu-backdrop').dispatchEvent(new Event('pointerdown',{bubbles:true})));
 const plus=document.querySelector('[data-live-message-composer] button[aria-haspopup=dialog]');assert.ok(plus);await act(async()=>plus.click());
 const menu=document.querySelector('.attachment-popover[role=dialog]');assert.ok(menu);assert.ok(menu.querySelector('.grid-cols-4'));assert.equal(menu.querySelector('.grid-cols-4').children.length,6);assert.equal(document.querySelector('[data-message-composer]').getAttribute('enterkeyhint'),'enter');for(const label of ['Galeria','Câmera','Arquivo','Localização','Criar compromisso','Criar lista'])assert.ok(menu.textContent.includes(label));assert.equal(document.querySelector('.chat-header [aria-label="Criar compromisso"]'),null);
 await act(async()=>menu.querySelector('[aria-label="Fechar anexos"]').click());assert.equal(document.querySelector('.attachment-popover'),null);
 const action=document.querySelector('[aria-label="Ações da mensagem"]');assert.ok(action);await act(async()=>action.click());const reply=[...document.querySelectorAll('[role=menuitem]')].find(x=>x.textContent==='Responder');assert.ok(reply);await act(async()=>reply.click());assert.ok(document.querySelector('.reply-draft svg'));assert.ok(document.querySelector('.reply-draft strong').textContent.endsWith(':'));await act(async()=>document.querySelector('[aria-label="Cancelar resposta"]').click());assert.equal(document.querySelector('.reply-draft'),null);
 const pinAction=document.querySelector('[aria-label="Ações da mensagem"]');await act(async()=>pinAction.click());const pinButton=[...document.querySelectorAll('[role=menuitem]')].find(x=>x.textContent==='Fixar mensagem');await act(async()=>pinButton.click());assert.ok(document.querySelector('.pinned-chat-bar'));
 const reaction=document.querySelector('.message-actions [aria-haspopup="menu"]');await act(async()=>reaction.click());assert.equal(document.querySelectorAll('.reaction-grid [role=menuitem]').length,24);await act(async()=>document.querySelector('.bubble-menu-backdrop').dispatchEvent(new Event('pointerdown',{bubbles:true})));
 assert.equal(document.querySelector('.message.own .reaction-grid'),null);assert.equal(document.querySelector('.message.own .message-actions [aria-label="Reagir"]'),null);
 const badge=document.querySelector('.reactions button');assert.ok(badge);const before=badge.textContent;
 await act(async()=>badge.click());const peopleDialog=document.querySelector('[role=dialog]');assert.ok(peopleDialog.textContent.includes('Reações'));assert.ok(peopleDialog.textContent.includes('Marina'));assert.ok(peopleDialog.textContent.includes('Bia'));assert.equal(peopleDialog.querySelectorAll('.member-list>div').length,2);
 await act(async()=>peopleDialog.querySelector('[aria-label="Fechar"]').click());assert.equal(document.querySelector('.reactions button').textContent,before);assert.equal(calls,0);
 const chatSearch=document.querySelector('.chat-header [aria-expanded]');await act(async()=>chatSearch.click());assert.ok(document.querySelector('.chat-panel > .chat-search'));await act(async()=>chatSearch.click());assert.equal(document.querySelector('.chat-search'),null);assert.equal(document.querySelector('.compact-event'),null);
 const about=[...document.querySelectorAll('button')].find(x=>x.textContent==='Sobre a demonstração');assert.ok(about);await act(async()=>about.click());assert.equal(document.querySelector('input[type=password]'),null);assert.equal(calls,0)}finally{await act(async()=>root.unmount());localStorage.removeItem('peakboo-session')}});
 await test('upcoming bar hides empty, past, cancelled and other-room events and sorts future events',async()=>{const out=dir+'/bar.mjs';await build({entryPoints:['src/UpcomingEventsBar.tsx'],outfile:out,bundle:true,platform:'browser',format:'esm',packages:'external',jsx:'automatic'});const {default:Bar}=await import(pathToFileURL(out));const {renderToStaticMarkup}=await import('react-dom/server');const now=new Date('2026-11-24T12:00:00Z');const events=[{id:'later',roomId:'a',title:'Later',startsAt:'2026-11-25T15:00:00Z'},{id:'past',roomId:'a',title:'Past',startsAt:'2026-11-23T12:00:00Z'},{id:'cancelled',roomId:'a',title:'Cancelled',startsAt:'2026-11-25T12:00:00Z',cancelled:true},{id:'other',roomId:'b',title:'Other room',startsAt:'2026-11-25T12:00:00Z'},{id:'earlier',roomId:'a',title:'Earlier',startsAt:'2026-11-25T12:00:00Z'}];const html=renderToStaticMarkup(createElement(Bar,{events,roomId:'a',lang:'pt',now,onSelect:()=>{}}));assert.ok(html.includes('Próximos eventos'));assert.ok(html.indexOf('Earlier')<html.indexOf('Later'));for(const absent of ['Past','Cancelled','Other room'])assert.ok(!html.includes(absent));assert.equal(renderToStaticMarkup(createElement(Bar,{events,roomId:'empty',lang:'en',now,onSelect:()=>{}})),'');});
 await test('media cache deduplicates requests and isolates sessions; skeleton reserves dimensions without filenames',async()=>{
 const out=dir+'/media.mjs';await build({entryPoints:['src/Media.tsx'],outfile:out,bundle:true,platform:'browser',format:'esm',packages:'external',jsx:'automatic',define:{'import.meta.env':'{}'}});const media=await import(pathToFileURL(out));
 const create=URL.createObjectURL,revoke=URL.revokeObjectURL;let calls=0,seq=0;URL.createObjectURL=()=>`blob:media-${++seq}`;URL.revokeObjectURL=()=>{};localStorage.setItem('peakboo-session','test-a');
 globalThis.fetch=async()=>{calls++;return {ok:true,blob:async()=>new Blob(['photo'],{type:'image/png'})}};
 const src='/api/media/12345678-1234-1234-1234-123456789abc';media.setMediaAccount('a');
 const urls=await Promise.all([media.cachedMedia(src),media.cachedMedia(src)]);assert.equal(calls,1);assert.equal(urls[0],urls[1]);await media.cachedMedia(src);assert.equal(calls,1);
 media.setMediaAccount('b');localStorage.setItem('peakboo-session','test-b');await media.cachedMedia(src);assert.equal(calls,2);
 const {renderToStaticMarkup}=await import('react-dom/server');const html=renderToStaticMarkup(createElement(media.MessageMedia,{attachment:{id:'12345678-1234-1234-1234-123456789abc',mime:'image/png',name:'internal-uuid-technical.png',size:123,width:800,height:400}}));assert.ok(html.includes('aspect-ratio:2'));assert.ok(html.includes('media-skeleton'));assert.ok(!html.includes('internal-uuid'));
 media.setMediaAccount('');localStorage.removeItem('peakboo-session');URL.createObjectURL=create;URL.revokeObjectURL=revoke;
 });
 await test('optimistic send is immediate, fails visibly and retries with one message ID',async()=>{
 localStorage.setItem('peakboo-session','optimistic-test');const roomId='12345678-1234-1234-1234-123456789abc';let rejectPost,posted=[],confirmed=[];
 const response=data=>({ok:true,headers:{get:()=>null},json:async()=>data});
 globalThis.fetch=async(url,options={})=>{const path=String(url);if(path.endsWith('/api/bootstrap'))return response({user:{id:'me',name:'Tester',email:'test@example.invalid'},rooms:[{id:roomId,name:'Test room',ownerId:'me',color:'purple',description:'',memberCount:1,unread:0}],events:[]});if(path.endsWith('/messages')&&options.method==='POST'){const body=JSON.parse(options.body);posted.push(body);if(posted.length===1)return new Promise((_,reject)=>{rejectPost=reject});confirmed=[{...body,senderId:'me',senderName:'Tester',createdAt:new Date().toISOString(),reactions:[]}];return response({id:body.id})}if(path.includes('/messages'))return response({messages:confirmed,hasMore:false});if(path.endsWith('/api/live'))throw Error('No live stream in test');return response({ok:true})};
 const root=await mount('src/App.tsx');try{
 await act(async()=>{await new Promise(r=>setTimeout(r,10))});
 const emoji=document.querySelector('[aria-label="Abrir lista de emojis"]');assert.ok(emoji);await act(async()=>emoji.click());const smile=[...document.querySelectorAll('[data-live-message-composer] button')].find(b=>b.textContent==='😊');await act(async()=>smile.click());
 await act(async()=>document.querySelector('[aria-label="Enviar mensagem"]').click());assert.equal(posted.length,1);assert.ok(document.querySelector('.pending-message').textContent.includes('Enviando'));assert.ok(document.querySelector('.message-bubble').textContent.includes('😊'));assert.equal(document.querySelector('[data-live-message-composer] textarea').value,'');
 await act(async()=>{rejectPost(Error('Offline'));await new Promise(r=>setTimeout(r,0))});assert.ok(document.querySelector('.pending-message').textContent.includes('Não enviada'));
 await act(async()=>{document.querySelector('.pending-message button').click();await new Promise(r=>setTimeout(r,10))});assert.equal(posted.length,2);assert.equal(posted[0].id,posted[1].id);assert.equal(document.querySelectorAll('.message').length,1);assert.equal(document.querySelector('.pending-message'),null);
 }finally{await act(async()=>root.unmount());localStorage.removeItem('peakboo-session')}
 });
 await test('reaction appears before API confirmation and rolls back on failure',async()=>{
 localStorage.setItem('peakboo-session','reaction-test');const roomId='12345678-1234-1234-1234-123456789abc',messageId='12345678-1234-1234-1234-123456789abd';
 let rejectReaction,posted=[];const original={id:messageId,senderId:'peer',senderName:'Peer',text:'Hello',createdAt:new Date().toISOString(),reactions:[]};
 const response=data=>({ok:true,headers:{get:()=>null},json:async()=>data});
 globalThis.fetch=async(url,options={})=>{const path=String(url);if(path.endsWith('/api/bootstrap'))return response({user:{id:'me',name:'Tester',email:'test@example.invalid'},rooms:[{id:roomId,name:'Reaction room',ownerId:'me',color:'purple',description:'',memberCount:2,unread:0}],events:[]});if(path.endsWith('/reaction')){posted.push(JSON.parse(options.body));return new Promise((_,reject)=>{rejectReaction=reject})}if(path.includes('/messages'))return response({messages:[original],hasMore:false});if(path.endsWith('/api/live'))throw Error('offline');return response({ok:true})};
 const root=await mount('src/App.tsx');try{
 await act(async()=>new Promise(r=>setTimeout(r,10)));await act(async()=>document.querySelector('.message-actions [aria-haspopup=menu]').click());
 await act(async()=>document.querySelector('.reaction-grid [aria-label="👍"]').click());
 assert.equal(posted.length,1);assert.equal(posted[0].active,true);assert.ok(document.querySelector('.reactions .mine'));
 await act(async()=>{rejectReaction(Error('Offline'));await new Promise(r=>setTimeout(r,0))});assert.equal(document.querySelector('.reactions .mine'),null);
 }finally{await act(async()=>root.unmount());localStorage.removeItem('peakboo-session')}
 });
 await test('chat scroll follows latest on open, preserves reading and counts incoming messages',async()=>{
 const fixture=dir+'/scroll-fixture.tsx';await writeFile(fixture,`import {useState} from 'react';import {useChatScroll} from '../src/useChatScroll';export default function Fixture(){const [messages,setMessages]=useState(()=>Array.from({length:5},(_,i)=>({id:String(i+1),createdAt:new Date(2026,10,24,12,i+1).toISOString(),senderId:'peer',senderName:'Peer',text:'message',reactions:[]})));const scroll=useChatScroll('room',messages,false,false,'me');return <><div className="scroll-fixture" ref={scroll.historyRef} onScroll={scroll.onScroll}>{messages.map(m=><span key={m.id}>{m.id}</span>)}</div><button id="incoming" onClick={()=>setMessages(old=>[...old,{...old.at(-1)!,id:'incoming',createdAt:new Date(2026,10,24,13).toISOString()}])}>incoming</button><button id="older" onClick={()=>{scroll.preserveOlder();setMessages(old=>[{...old[0],id:'older',createdAt:new Date(2026,10,24,11).toISOString()},...old])}}>older</button><button id="jump" onClick={scroll.jump}>jump</button><output>{scroll.away?'away':'bottom'}:{scroll.newCount}</output></>}`);
 const proto=dom.window.HTMLElement.prototype,oldHeight=Object.getOwnPropertyDescriptor(proto,'scrollHeight'),oldClient=Object.getOwnPropertyDescriptor(proto,'clientHeight');Object.defineProperty(proto,'scrollHeight',{configurable:true,get(){return this.className==='scroll-fixture'?this.children.length*200:0}});Object.defineProperty(proto,'clientHeight',{configurable:true,get(){return this.className==='scroll-fixture'?200:0}});
 const root=await mount(fixture);try{const box=document.querySelector('.scroll-fixture');assert.ok(box.scrollTop>=800);await act(async()=>{box.scrollTop=100;box.dispatchEvent(new Event('scroll',{bubbles:true}))});await act(async()=>document.getElementById('incoming').click());assert.equal(box.scrollTop,100);assert.equal(document.querySelector('output').textContent,'away:1');await act(async()=>document.getElementById('older').click());assert.equal(box.scrollTop,300);assert.equal(document.querySelector('output').textContent,'away:1');await act(async()=>document.getElementById('jump').click());assert.ok(box.scrollTop>=1200);assert.equal(document.querySelector('output').textContent,'bottom:0')}finally{await act(async()=>root.unmount());if(oldHeight)Object.defineProperty(proto,'scrollHeight',oldHeight);else delete proto.scrollHeight;if(oldClient)Object.defineProperty(proto,'clientHeight',oldClient);else delete proto.clientHeight}
 });
 await test('audio speed cycles and image zoom responds to wheel and pinch',async()=>{
 const fixture=dir+'/media-controls.tsx';await writeFile(fixture,`import {ChatAudioPlayer} from '../src/ChatAudioPlayer';import {ZoomableChatImage} from '../src/ZoomableChatImage';export default function Fixture(){return <><ChatAudioPlayer src="blob:test-audio"/><div id="zoom-fixture"><ZoomableChatImage src="data:image/png;base64,iVBORw0KGgo=" alt="Foto"/></div></>}`);
 const root=await mount(fixture);try{
 const rate=document.querySelector('.voice-rate');assert.equal(rate.textContent,'1×');await act(async()=>rate.click());assert.equal(rate.textContent,'1.5×');await act(async()=>rate.click());assert.equal(rate.textContent,'2×');await act(async()=>rate.click());assert.equal(rate.textContent,'1×');assert.ok(document.querySelector('.voice-waveform'));assert.ok(document.querySelector('.voice-play'));
 const viewport=document.querySelector('#zoom-fixture>div>div'),image=document.querySelector('#zoom-fixture img');Object.defineProperty(viewport,'clientWidth',{value:400});Object.defineProperty(viewport,'clientHeight',{value:300});Object.defineProperty(image,'offsetWidth',{value:400});Object.defineProperty(image,'offsetHeight',{value:300});viewport.getBoundingClientRect=()=>({left:0,top:0,width:400,height:300});viewport.setPointerCapture=()=>{};viewport.hasPointerCapture=()=>false;
 await act(async()=>viewport.dispatchEvent(new dom.window.WheelEvent('wheel',{deltaY:-300,clientX:200,clientY:150,bubbles:true,cancelable:true})));assert.ok(!document.getElementById('zoom-fixture').textContent.includes('100%'));
 await act(async()=>document.querySelector('[aria-label="Restaurar tamanho"]').click());assert.ok(document.getElementById('zoom-fixture').textContent.includes('100%'));
 await act(async()=>{for(const [id,x] of [[1,100],[2,300]])viewport.dispatchEvent(new dom.window.PointerEvent('pointerdown',{pointerId:id,pointerType:'touch',clientX:x,clientY:150,bubbles:true,cancelable:true}));viewport.dispatchEvent(new dom.window.PointerEvent('pointermove',{pointerId:2,pointerType:'touch',clientX:400,clientY:150,bubbles:true,cancelable:true}))});assert.ok(document.getElementById('zoom-fixture').textContent.includes('150%'));
 }finally{await act(async()=>root.unmount())}
 });
 await test('pinned cache survives remounts, stays visible while refreshing and clears on account change',async()=>{
 const fixture=dir+'/pinned-cache.tsx';await writeFile(fixture,`import {useState} from 'react';import {usePinnedMessages} from '../src/usePinnedMessages';export default function Fixture(){const [user,setUser]=useState('pin-user'),[room,setRoom]=useState('a'),[revision,setRevision]=useState(0);const pins=usePinnedMessages(user,room,revision);return <><button id="switch-room" onClick={()=>setRoom(room==='a'?'b':'a')}/><button id="refresh-pins" onClick={()=>setRevision(x=>x+1)}/><button id="logout-pins" onClick={()=>setUser('')}/><output>{pins.map(p=>p.text).join(',')}</output></>}`);
 let calls=0,resolvePending;globalThis.fetch=async(url)=>{calls++;if(calls===3)return new Promise(resolve=>{resolvePending=resolve});return new Response(JSON.stringify({messages:[{id:'pin-'+calls,text:String(url).includes('/a/')?'Pinned A':'Pinned B',pinned:true}]}),{headers:{'Content-Type':'application/json'}})};
 const root=await mount(fixture);try{
 assert.equal(document.querySelector('output').textContent,'Pinned A');assert.equal(calls,1);
 await act(async()=>document.getElementById('switch-room').click());assert.equal(document.querySelector('output').textContent,'Pinned B');assert.equal(calls,2);
 await act(async()=>document.getElementById('switch-room').click());assert.equal(document.querySelector('output').textContent,'Pinned A');assert.equal(calls,2);
 await act(async()=>document.getElementById('refresh-pins').click());assert.equal(document.querySelector('output').textContent,'Pinned A');assert.equal(calls,3);
 await act(async()=>resolvePending(new Response(JSON.stringify({messages:[]}))));assert.equal(document.querySelector('output').textContent,'');
 await act(async()=>document.getElementById('logout-pins').click());assert.deepEqual(Object.keys(localStorage).filter(k=>k.startsWith('peakboo-pins-v2:pin-user:')),[]);
 }finally{await act(async()=>root.unmount())}
 // A separate authenticated mount reads durable data without a loading flash or request.
 localStorage.setItem('peakboo-pins-v2:pin-user:a',JSON.stringify({at:Date.now(),messages:[{id:'saved',text:'Durable pin',pinned:true}]}));
 const remounted=await mount(fixture);try{assert.equal(document.querySelector('output').textContent,'Durable pin');assert.equal(calls,3)}finally{await act(async()=>remounted.unmount());localStorage.removeItem('peakboo-pins-v2:pin-user:a')}
 });

 await test('swipe reply requires a deliberate right drag and ignores scrolling, controls and cancellation',async()=>{
 const fixture=dir+'/swipe-reply.tsx';await writeFile(fixture,`import {useState} from 'react';import {SwipeReply} from '../src/SwipeReply';export default function Fixture(){const [count,setCount]=useState(0);return <><SwipeReply id="swipe-test" onReply={()=>setCount(x=>x+1)}><span id="swipe-text">Message</span><button id="swipe-control">Play</button></SwipeReply><output>{count}</output></>}`);
 const root=await mount(fixture);try{
 const row=document.getElementById('swipe-test'),text=document.getElementById('swipe-text');row.setPointerCapture=()=>{};row.hasPointerCapture=()=>false;
 const pointer=async(target,type,x,y)=>act(async()=>target.dispatchEvent(new dom.window.PointerEvent(type,{pointerId:1,pointerType:'touch',isPrimary:true,clientX:x,clientY:y,bubbles:true})));
 await pointer(text,'pointerdown',100,100);await pointer(row,'pointermove',175,103);assert.ok(row.querySelector('.ready'));await pointer(row,'pointerup',175,103);assert.equal(document.querySelector('output').textContent,'1');
 for(const [dx,dy] of [[15,80],[-80,0],[30,0]]){await pointer(text,'pointerdown',100,100);await pointer(row,'pointermove',100+dx,100+dy);await pointer(row,'pointerup',100+dx,100+dy)}assert.equal(document.querySelector('output').textContent,'1');
 await pointer(text,'pointerdown',100,100);await pointer(row,'pointermove',180,100);await pointer(row,'pointercancel',180,100);await pointer(row,'pointerup',180,100);assert.equal(document.querySelector('output').textContent,'1');
 await pointer(document.getElementById('swipe-control'),'pointerdown',100,100);await pointer(row,'pointermove',180,100);await pointer(row,'pointerup',180,100);assert.equal(document.querySelector('output').textContent,'1');
 }finally{await act(async()=>root.unmount())}
 });

 await test('group deletion asks for confirmation, cancels safely and removes demo data without API calls',async()=>{
 localStorage.removeItem('peakboo-session');localStorage.removeItem('peakboo-demo-v1');let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected network')};
 const root=await mount('src/portfolio/PortfolioApp.tsx');try{
 assert.ok(document.querySelector('.mobile-brand .brand-wordmark'));assert.equal(document.querySelector('.topbar .mobile-settings'),null);assert.ok(document.querySelector('.chat-photo-button'));
 const groupName=document.querySelector('.chat-header h2').textContent;
 await act(async()=>document.querySelector('.chat-photo-button').click());assert.ok(document.querySelector('.room-photo-picker'));
 await act(async()=>document.querySelector('.delete-group-entry').click());assert.ok(document.querySelector('[role=dialog]').textContent.includes('Esta ação não pode ser desfeita'));
 await act(async()=>[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Cancelar').click());assert.equal(document.querySelector('[role=dialog]'),null);assert.equal(document.querySelector('.chat-header h2').textContent,groupName);
 await act(async()=>document.querySelector('.chat-photo-button').click());await act(async()=>document.querySelector('.delete-group-entry').click());await act(async()=>[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Excluir grupo').click());
 assert.equal(document.querySelector('[role=dialog]'),null);assert.ok(!document.querySelector('.conversation-panel').textContent.includes(groupName));assert.equal(calls,0);
 const saved=JSON.parse(localStorage.getItem('peakboo-demo-v1'));assert.ok(!saved.boot.rooms.some(r=>r.id==='weekend'));assert.equal(saved.messages.weekend,undefined);assert.ok(!saved.boot.events.some(e=>e.roomId==='weekend'));
 }finally{await act(async()=>root.unmount());localStorage.removeItem('peakboo-demo-v1')}
 });

 await test('real group deletion preserves data on error, prevents duplicate requests and allows retry',async()=>{
 const roomId='12345678-1234-1234-1234-123456789abc';localStorage.setItem('peakboo-session','delete-test');let resolveDelete,deleted=false,deleteCalls=0;
 const response=(data,ok=true)=>({ok,headers:{get:()=>null},json:async()=>data});
 globalThis.fetch=async(url,options={})=>{const path=String(url);if(options.method==='DELETE'){deleteCalls++;return new Promise(resolve=>{resolveDelete=resolve})}if(path.endsWith('/api/bootstrap'))return response({user:{id:'me',name:'Owner',email:'owner@example.invalid'},rooms:deleted?[]:[{id:roomId,name:'Delete test group',ownerId:'me',color:'purple',memberCount:1,unread:0}],events:[]});if(path.includes('/messages'))return response({messages:[],hasMore:false});if(path.endsWith('/api/live'))throw Error('No live stream in test');return response({ok:true})};
 const root=await mount('src/App.tsx');try{
 await act(async()=>document.querySelector('.chat-photo-button').click());await act(async()=>document.querySelector('.delete-group-entry').click());
 const confirm=()=>[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Excluir grupo');
 await act(async()=>{confirm().click();confirm().click()});assert.equal(deleteCalls,1);assert.equal(confirm().disabled,true);assert.equal(confirm().getAttribute('aria-busy'),'true');
 await act(async()=>resolveDelete(response({error:'SERVER_ERROR'},false)));assert.ok(document.querySelector('[role=alert]'));assert.ok(document.querySelector('.conversation-panel').textContent.includes('Delete test group'));assert.equal(confirm().disabled,false);
 await act(async()=>confirm().click());assert.equal(deleteCalls,2);deleted=true;await act(async()=>resolveDelete(response({ok:true})));assert.equal(document.querySelector('[role=dialog]'),null);assert.ok(!document.querySelector('.conversation-panel').textContent.includes('Delete test group'));
 }finally{await act(async()=>root.unmount());localStorage.removeItem('peakboo-session')}
 });


 await test('chat header search is never hidden by the mobile first-button rule',async()=>{
 const entry=await readFile('src/styles.css','utf8');
 const imports=[...entry.matchAll(/@import "\.\/(styles\/[^"]+\.css)";/g)].map(m=>m[1]);
 assert.ok(imports.length>1);const css=(await Promise.all(imports.map(path=>readFile('src/'+path,'utf8')))).join('\n');
 assert.ok(!css.includes('.chat-header-actions > .icon-button:first-child'));
 });

 await test('photo swipe replies once without opening gallery; taps, reversal, pinch and mouse work independently',async()=>{
 const fixture=dir+'/photo-swipe.tsx';await writeFile(fixture,`import {useState} from 'react';import {SwipeReply} from '../src/SwipeReply';export default function Fixture(){const [replies,setReplies]=useState(0),[photos,setPhotos]=useState(0);return <><SwipeReply id="photo-row" onReply={()=>setReplies(x=>x+1)}><button className="open-chat-photo" onClick={()=>setPhotos(x=>x+1)}><img id="swipe-photo" alt="Photo"/></button></SwipeReply><output>{replies}:{photos}</output></>}`);
 const root=await mount(fixture);try{
 const row=document.getElementById('photo-row'),photo=document.getElementById('swipe-photo'),button=photo.parentElement;
 row.setPointerCapture=()=>{};row.hasPointerCapture=()=>false;
 const pointer=async(target,type,x,y,extra={})=>act(async()=>target.dispatchEvent(new dom.window.PointerEvent(type,{pointerId:1,pointerType:'touch',isPrimary:true,clientX:x,clientY:y,bubbles:true,cancelable:true,...extra})));
 await pointer(photo,'pointerdown',100,100);await pointer(row,'pointermove',152,103);assert.ok(row.querySelector('.ready'));await pointer(row,'pointerup',152,103);
 await act(async()=>button.click());assert.equal(document.querySelector('output').textContent,'1:0');
 await pointer(photo,'pointerdown',100,100);await pointer(photo,'pointerup',100,100);await act(async()=>button.click());assert.equal(document.querySelector('output').textContent,'1:1');
 await pointer(photo,'pointerdown',100,100);await pointer(row,'pointermove',170,100);await pointer(row,'pointerup',120,100);assert.equal(document.querySelector('output').textContent,'1:1');
 await pointer(photo,'pointerdown',100,100);await pointer(row,'pointermove',170,100);await pointer(document.body,'pointerdown',200,100,{pointerId:2,isPrimary:false});await pointer(row,'pointerup',170,100);assert.equal(document.querySelector('output').textContent,'1:1');assert.equal(row.querySelector('.ready'),null);
 await pointer(photo,'pointerdown',100,100,{pointerType:'mouse',button:0});await pointer(row,'pointermove',155,100,{pointerType:'mouse'});await pointer(row,'pointerup',155,100,{pointerType:'mouse'});assert.equal(document.querySelector('output').textContent,'2:1');
 await pointer(photo,'pointerdown',100,100,{pointerType:'mouse',button:2});await pointer(row,'pointermove',180,100,{pointerType:'mouse',button:2});await pointer(row,'pointerup',180,100,{pointerType:'mouse',button:2});assert.equal(document.querySelector('output').textContent,'2:1');
 }finally{await act(async()=>root.unmount())}
 });


 await test('groups-only navigation shows unread badges and internal notifications without decorative title dots',async()=>{localStorage.removeItem('peakboo-demo-v1');const root=await mount('src/portfolio/PortfolioApp.tsx');try{const nav=[...document.querySelectorAll('.mobile-nav button')];assert.equal(nav.length,4);assert.ok(nav[0].textContent.includes('Grupos'));assert.ok(nav[1].textContent.includes('Agenda'));assert.ok(nav[2].textContent.includes('Notificações'));assert.ok(nav[0].querySelector('.notification-count'));assert.equal(document.querySelector('.title-dot'),null);await act(async()=>nav[2].click());assert.ok(document.querySelector('.notification-center'));await act(async()=>document.querySelector('[role=dialog] [aria-label=Fechar]').click());await act(async()=>nav[1].click());assert.equal(document.querySelector('.calendar-page h1').textContent,'Agenda');assert.equal(document.querySelector('.title-dot'),null)}finally{await act(async()=>root.unmount())}});
 await test('group invitation modal shows a token and manual entry uses a token',async()=>{localStorage.removeItem('peakboo-demo-v1');const root=await mount('src/portfolio/PortfolioApp.tsx');try{await act(async()=>document.querySelector('.chat-photo-button').click());const token=document.querySelector('input[aria-label="Token de convite"]'),link=document.querySelector('input[aria-label="Link de convite"]');assert.ok(token.value);assert.ok(link.value.endsWith(encodeURIComponent(token.value)));assert.ok([...document.querySelectorAll('[role=dialog] button')].some(b=>b.textContent==='Copiar token'));await act(async()=>document.querySelector('[role=dialog] [aria-label=Fechar]').click());await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Entrar com token').click());assert.ok(document.querySelector('input[name=code]'));assert.equal(document.querySelector('input[name=code]').placeholder,'Cole o token de convite')}finally{await act(async()=>root.unmount())}});
 await test('calendar reminders and read state are computed locally',async()=>{localStorage.removeItem('peakboo-notifications-v1:notice-user');const fixture=dir+'/notifications.tsx';await writeFile(fixture,`import {useInternalNotifications,NotificationCenter} from '../src/InternalNotifications';const now=Date.now();const boot={user:{id:'notice-user',name:'Test',email:''},rooms:[{id:'r',name:'Friends',unread:2}],events:[{id:'e',roomId:'r',title:'Meet',startsAt:new Date(now+600000).toISOString(),endsAt:new Date(now+3600000).toISOString(),rsvps:[],cancelled:false}],activity:[{id:'a',eventId:'e',roomId:'r',eventTitle:'Meet',roomName:'Friends',action:'created',createdAt:new Date(now).toISOString()}]} as any;export default function Fixture(){const center=useInternalNotifications(boot);return <><output>{center.agendaUnread}:{center.messageUnread}</output><NotificationCenter boot={boot} center={center} lang="pt" onRoom={()=>{}} onEvent={()=>{}}/></>}`);const root=await mount(fixture);try{assert.equal(document.querySelector('output').textContent,'3:2');assert.ok(document.body.textContent.includes('60 min'));assert.ok(document.body.textContent.includes('15 min'));await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Marcar avisos')).click());assert.equal(document.querySelector('output').textContent,'0:2');assert.equal(JSON.parse(localStorage.getItem('peakboo-notifications-v1:notice-user')).length,3)}finally{await act(async()=>root.unmount())}});
 await test('private invitation generates canonical local QR',async()=>{const fixture=dir+'/invite-tools.tsx';await writeFile(fixture,`import {InvitationTools} from '../src/InvitationTools';export default function Fixture(){return <InvitationTools url="https://main.peakboo.workers.dev/#invite=sample" name="Friends" lang="pt"/>}`);const root=await mount(fixture);try{await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Mostrar QR Code').click());await act(async()=>new Promise(r=>setTimeout(r,0)));const img=document.querySelector('.invite-qr img');assert.ok(img);const {default:QRCode}=await import('qrcode');const expected=await QRCode.toString('https://main.peakboo.workers.dev/#invite=sample',{type:'svg',margin:4,errorCorrectionLevel:'M'});assert.equal(decodeURIComponent(img.getAttribute('src').split(',').slice(1).join(',')),expected)}finally{await act(async()=>root.unmount())}});
 await test('legacy username routes no longer render a public profile',async()=>{localStorage.removeItem('peakboo-session');history.replaceState(null,'','/@alice');const root=await mount('src/App.tsx');try{assert.equal(document.querySelector('.public-profile-page'),null);assert.equal(document.querySelector('input[name=handle]'),null)}finally{await act(async()=>root.unmount());history.replaceState(null,'','/')}});
 await test('native touch reply survives Safari pointer cancellation and keeps scrolling and pinch available',async()=>{
 const fixture=dir+'/touch-reply.tsx';await writeFile(fixture,`import {useState} from 'react';import {SwipeReply} from '../src/SwipeReply';export default function Fixture(){const [n,setN]=useState(0);return <><SwipeReply id="native-swipe" onReply={()=>setN(x=>x+1)}><span>Message</span></SwipeReply><output>{n}</output></>}`);
 const root=await mount(fixture);try{
 const row=document.getElementById('native-swipe');const touch=(x,y,id=1)=>({identifier:id,clientX:x,clientY:y});
 const fire=async(type,touches,changedTouches=touches)=>{const event=new dom.window.TouchEvent(type,{bubbles:true,cancelable:true,touches,changedTouches});await act(async()=>row.dispatchEvent(event));return event};
 await fire('touchstart',[touch(100,100)]);const move=await fire('touchmove',[touch(125,105)]);assert.equal(move.defaultPrevented,true);
 await act(async()=>row.dispatchEvent(new dom.window.PointerEvent('pointercancel',{pointerId:1,pointerType:'touch',isPrimary:true,bubbles:true})));assert.ok(row.className.includes('swiping'));
 await fire('touchmove',[touch(158,108)]);assert.ok(row.querySelector('.ready'));await fire('touchend',[],[touch(158,108)]);assert.equal(document.querySelector('output').textContent,'1');
 await fire('touchstart',[touch(100,100)]);const scroll=await fire('touchmove',[touch(105,140)]);assert.equal(scroll.defaultPrevented,false);await fire('touchend',[],[touch(160,170)]);assert.equal(document.querySelector('output').textContent,'1');
 await fire('touchstart',[touch(100,100)]);await fire('touchmove',[touch(160,100)]);const pinch=await fire('touchstart',[touch(160,100),touch(200,100,2)]);assert.equal(pinch.defaultPrevented,false);await fire('touchend',[],[touch(180,100)]);assert.equal(document.querySelector('output').textContent,'1');
 await fire('touchstart',[touch(100,100)]);await fire('touchmove',[touch(160,100)]);await fire('touchcancel',[],[touch(160,100)]);assert.equal(document.querySelector('output').textContent,'1');
 }finally{await act(async()=>root.unmount())}
 });


 await test('avatar falls back to initials after failed media and failed image decode',async()=>{
 const fixture=dir+'/avatar-failure.tsx';await writeFile(fixture,`import {useState} from 'react';import {Avatar} from '../src/components';export default function Fixture(){const [src,setSrc]=useState('/api/media/12345678-1234-1234-1234-123456789abc');return <><Avatar name="Ana Silva" image={src}/><button id="bad-decode" onClick={()=>setSrc('data:image/png;base64,broken')}/><button id="good" onClick={()=>setSrc('data:image/png;base64,valid')}/></>}`);
 globalThis.fetch=async()=>new Response('{}',{status:404});const root=await mount(fixture);
 try{await act(async()=>new Promise(r=>setTimeout(r,0)));assert.equal(document.querySelector('.avatar').textContent,'AS');assert.equal(document.querySelector('.avatar .media-skeleton'),null);
 await act(async()=>document.querySelector('#bad-decode').click());const img=document.querySelector('.avatar img');assert.ok(img);await act(async()=>img.dispatchEvent(new Event('error')));assert.equal(document.querySelector('.avatar img'),null);assert.equal(document.querySelector('.avatar .media-skeleton'),null);
 await act(async()=>document.querySelector('#good').click());const good=document.querySelector('.avatar img');assert.ok(good);await act(async()=>good.dispatchEvent(new Event('load')));assert.equal(good.style.opacity,'1');assert.equal(document.querySelector('.avatar .media-skeleton'),null)
 }finally{await act(async()=>root.unmount())}
 });
 await test('portfolio sender names open a local read-only profile without network',async()=>{
 localStorage.removeItem('peakboo-demo-v1');let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected network')};const root=await mount('src/portfolio/PortfolioApp.tsx');
 try{const sender=document.querySelector('button.sender-name');assert.ok(sender);const name=sender.textContent;await act(async()=>sender.click());const profile=document.querySelector('[role=dialog] .profile-editor');assert.ok(profile);assert.ok(profile.textContent.includes(name));assert.equal(profile.querySelector('form'),null);assert.equal(calls,0);await act(async()=>document.querySelector('[role=dialog] [aria-label=Fechar]').click());assert.equal(document.querySelector('[role=dialog]'),null)}finally{await act(async()=>root.unmount());localStorage.removeItem('peakboo-demo-v1')}
 });

 await test('camera JPEG dimensions are parsed before a bounded resize and canvas is released',async()=>{
 const out=dir+'/camera-prepare.mjs';await build({entryPoints:['src/imageCompression.ts'],outfile:out,bundle:true,platform:'browser',format:'esm'});const {jpegDimensions,prepareCameraPhoto}=await import(pathToFileURL(out));
 const jpeg=new File([new Uint8Array([255,216,255,192,0,11,8,15,160,23,112,1,1,17,0,255,217])],'camera.jpg',{type:'image/jpeg'});
 assert.deepEqual(await jpegDimensions(jpeg),{width:6000,height:4000});
 const oldBitmap=globalThis.createImageBitmap,oldContext=window.HTMLCanvasElement.prototype.getContext,oldBlob=window.HTMLCanvasElement.prototype.toBlob;let options,closed=0,canvas;
 globalThis.createImageBitmap=async(_file,opts)=>{options=opts;return {width:1067,height:711,close(){closed++}}};
 window.HTMLCanvasElement.prototype.getContext=function(){canvas=this;return {drawImage(){}}};
 window.HTMLCanvasElement.prototype.toBlob=function(cb){assert.equal(closed,1);cb(new Blob(['photo'],{type:'image/jpeg'}))};
 try{const result=await prepareCameraPhoto(jpeg);assert.equal(options.resizeWidth,1067);assert.equal(result.type,'image/jpeg');assert.equal(closed,1);assert.equal(canvas.width,0);assert.equal(canvas.height,0);await assert.rejects(prepareCameraPhoto(new File(['bad'],'bad.jpg',{type:'image/jpeg'})),/CAMERA_PHOTO_UNSUPPORTED/)}
 finally{globalThis.createImageBitmap=oldBitmap;window.HTMLCanvasElement.prototype.getContext=oldContext;window.HTMLCanvasElement.prototype.toBlob=oldBlob}
 });

 await test('shared event form preserves room choice, local date and submit callback',async()=>{
 const out=dir+'/event-form.mjs';await build({entryPoints:['src/features/calendar/EventFormDialog.tsx'],outfile:out,bundle:true,platform:'browser',format:'esm',packages:'external',jsx:'automatic',define:{'import.meta.env':'{}'}});const {EventFormDialog}=await import(pathToFileURL(out));const root=createRoot(document.getElementById('root'));let saved,closed=0;
 const room={id:'r',name:'Group',description:'',color:'blue',ownerId:'me',memberCount:1,unread:0};
 try{await act(async()=>root.render(createElement(EventFormDialog,{open:true,onClose:()=>closed++,t:k=>k,editPlan:null,selected:'r',rooms:[room],eventTitle:'Meeting',setEventTitle:()=>{},eventDay:'2026-12-01',setEventDay:()=>{},eventColor:'blue',setEventColor:()=>{},formError:'',busy:null,saveEvent:e=>{e.preventDefault();saved=new window.FormData(e.currentTarget)}})));
 const form=document.querySelector('[role=dialog] form');assert.equal(form.querySelector('select').value,'r');assert.equal(form.querySelector('[name=date]').value,'2026-12-01');assert.equal(form.querySelector('[name=start]').value,'16:00');assert.ok(form.querySelector('[aria-label=blue][aria-pressed=true]'));
 await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(saved.get('roomId'),'r');await act(async()=>form.querySelector('.form-footer button').click());assert.equal(closed,1);
 }finally{await act(async()=>root.unmount())}
 });
}finally{await rm(dir,{recursive:true,force:true});dom.window.close()}
