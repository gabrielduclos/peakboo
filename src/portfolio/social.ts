import type {SocialAPI,Profile} from "../socialApi";
import type {User} from "../types";
import {localFile} from "../Media";
export function demoSocial(user:User):SocialAPI{
 const key="peakboo-social-demo-v1:"+user.id;
 const read=():Profile=>{try{const p=JSON.parse(localStorage.getItem(key)||"null")?.me;if(p)return {id:user.id,name:p.name||user.name,bio:p.bio||"",image:p.image,cover:p.cover}}catch{}return {...user,bio:""}};
 const save=(p:Profile)=>localStorage.setItem(key,JSON.stringify({me:p}));
 return {me:async()=>read(),save:async p=>save(p),photo:async(kind,file)=>{const url=await localFile(file);save({...read(),[kind==="avatar"?"image":"cover"]:url});return url}};
}
