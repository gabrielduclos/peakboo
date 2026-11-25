// Profile presentation adapted from Uorqui.
import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Avatar, Button, Modal } from "./components";
import { MediaImage, useMedia } from "./Media";
import { ProfilePhotoCropper } from "./ProfilePhotoCropper";
import type { Profile, SocialAPI } from "./socialApi";
const words = {
  pt: {
    me: "Meu perfil",
    save: "Salvar perfil",
    saved: "Perfil salvo.",
    name: "Nome",
    bio: "Biografia",
    photo: "Alterar foto",
    cover: "Alterar capa",
    error: "Não foi possível concluir. Tente novamente.",
    loading: "Carregando",
    close: "Fechar",
  },
  en: {
    me: "My profile",
    save: "Save profile",
    saved: "Profile saved.",
    name: "Name",
    bio: "Bio",
    photo: "Change photo",
    cover: "Change cover",
    error: "Could not complete. Please retry.",
    loading: "Loading",
    close: "Close",
  },
};
export const socialWords = (lang: string) => words[lang === "pt" ? "pt" : "en"];
function Cover({ src }: { src?: string | null }) {
  const { url, error } = useMedia(src);
  return (
    <div className="profile-cover">
      {src && !url && !error && <span className="media-skeleton" />}
      {url && <MediaImage key={url} url={url}/>}
    </div>
  );
}
export function ProfileEditor({
  api,
  lang,
  onSaved,
}: {
  api: SocialAPI;
  lang: string;
  onSaved: () => void;
}) {
  const t = socialWords(lang),
    [profile, setProfile] = useState<Profile | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [crop, setCrop] = useState<{ file: File; kind: "avatar" | "cover" } | null>(
      null,
    );
  const lock = useRef(false);
  useEffect(() => {
    let live = true;
    api
      .me()
      .then((p) => {
        if (live) setProfile(p);
      })
      .catch(() => {
        if (live) setError(t.error);
      });
    return () => {
      live = false;
    };
  }, [api, attempt]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.save(profile);
      setProfile(await api.me());
      onSaved();
      setNotice(t.saved);
    } catch {
      setError(t.error);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function choose(kind: "avatar" | "cover", file?: File) {
    if (!file) return;
    if (
      !/^image\/(jpeg|png|webp|gif)$/.test(file.type) ||
      file.size > 15 * 1048576
    ) {
      setError(t.error);
      return;
    }
    setCrop({ file, kind });
  }
  return (
    <div className="profile-editor">
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {!profile ? (
        error ? <Button variant="outline" onClick={()=>{setError("");setAttempt(x=>x+1)}}>{lang==="pt"?"Tentar novamente":"Retry"}</Button> : <div className="social-skeleton" role="status" aria-label={t.loading} />
      ) : (
        <>
          <Cover src={profile.cover} />
          <div className="profile-identity">
            <Avatar name={profile.name} image={profile.image} />
            <strong>{profile.name}</strong>
          </div>
          <div className="profile-photo-actions">
            {(["avatar", "cover"] as const).map((kind) => (
              <label key={kind} className="button outline photo-picker">
                <Camera size={16} />
                {kind === "avatar" ? t.photo : t.cover}
                <input
                  aria-label={kind === "avatar" ? t.photo : t.cover}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  disabled={busy}
                  onChange={(e) => {
                    choose(kind, e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            ))}
          </div>
          <form className="form" onSubmit={save}>
            <label>
              {t.name}
              <input
                name="name"
                value={profile.name}
                minLength={2}
                maxLength={80}
                required
                onChange={(e) =>
                  setProfile({ ...profile, name: e.target.value })
                }
              />
            </label>
            <label>
              {t.bio}
              <textarea
                name="bio"
                value={profile.bio}
                maxLength={500}
                rows={3}
                onChange={(e) =>
                  setProfile({ ...profile, bio: e.target.value })
                }
              />
            </label>
            <Button busy={busy}>{t.save}</Button>
          </form>
          {notice && <p role="status">{notice}</p>}
          {crop && (
            <ProfilePhotoCropper
              {...crop}
              lang={lang}
              onCancel={() => setCrop(null)}
              onSave={async (blob) => {
                const file = new File([blob], crop.kind + ".webp", {
                  type: blob.type,
                });
                const url = await api.photo(crop.kind, file);
                setProfile({
                  ...profile,
                  [crop.kind === "avatar" ? "image" : "cover"]: url,
                });
                setCrop(null);
                onSaved();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

export type ProfileTarget={id:string;name:string;image?:string|null};
export function ProfileDialog({target,load,lang,onClose}:{target:ProfileTarget;load:()=>Promise<Profile>;lang:string;onClose:()=>void}){
 const t=socialWords(lang);
 const [profile,setProfile]=useState<Profile|null>(null),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;const timer=setTimeout(()=>{if(active){active=false;setFailed(true)}},25000);load().then(p=>{if(active)setProfile(p)}).catch(()=>{if(active)setFailed(true)}).finally(()=>clearTimeout(timer));return()=>{active=false;clearTimeout(timer)}},[attempt]);
 return <Modal open onOpenChange={v=>{if(!v)onClose()}} title={lang==="pt"?"Perfil":"Profile"} closeLabel={t.close}>
 {profile?<div className="profile-editor"><Cover src={profile.cover}/><div className="profile-identity"><Avatar name={profile.name} image={profile.image}/><strong>{profile.name}</strong></div>{profile.bio&&<p className="profile-bio">{profile.bio}</p>}</div>:failed?<><p role="alert" className="form-error">{t.error}</p><Button variant="outline" onClick={()=>{setFailed(false);setAttempt(x=>x+1)}}>{lang==="pt"?"Tentar novamente":"Retry"}</Button></>:<div className="profile-editor"><div className="profile-identity"><Avatar name={target.name}/><strong>{target.name}</strong></div><div className="social-skeleton" role="status" aria-label={t.loading}/></div>}
 </Modal>;
}
