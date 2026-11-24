// Profile presentation and request states adapted from Uorqui UserProfiles/ContactToggleButton.
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  Copy,
  MessageCircle,
  Search,
  UserPlus,
} from "lucide-react";
import { Avatar, Button, Logo, Modal } from "./components";
import { useMedia } from "./Media";
import { profileLink } from "./links";
import { ProfilePhotoCropper } from "./ProfilePhotoCropper";
import type { Profile, SocialAPI } from "./socialApi";
const words = {
  pt: {
    contacts: "Contatos",
    find: "Encontrar pessoas",
    me: "Meu perfil",
    search: "Nome ou @usuário",
    empty: "Nenhum contato por aqui ainda.",
    noResults: "Nenhum perfil público encontrado.",
    received: "Solicitações recebidas",
    sent: "Solicitações enviadas",
    accepted: "Seus contatos",
    add: "Adicionar contato",
    accept: "Aceitar",
    decline: "Recusar",
    cancel: "Cancelar pedido",
    remove: "Remover contato",
    message: "Conversar",
    save: "Salvar perfil",
    saved: "Perfil salvo.",
    name: "Nome",
    handle: "Nome de usuário",
    bio: "Biografia",
    public: "Perfil público",
    publicHint:
      "Seu nome, foto, capa e biografia poderão ser vistos por qualquer pessoa com o link e encontrados na busca.",
    photo: "Alterar foto",
    cover: "Alterar capa",
    copy: "Copiar link do perfil",
    copied: "Link copiado.",
    error: "Não foi possível concluir. Tente novamente.",
    taken: "Este nome de usuário já está em uso.",
    cooldown: "Você pode alterar o nome de usuário a cada 15 dias.",
    private: "Publique seu perfil para compartilhar o link.",
    loading: "Carregando",
    back: "Voltar",
    login: "Entrar no PeakBoo",
    unavailable: "Perfil não encontrado ou privado.",
    signIn: "Entre para adicionar este contato.",
    view: "Ver perfil",
    close: "Fechar",
    confirmRemove:
      "Remover este contato? O envio de mensagens ficará suspenso até um novo aceite.",
  },
  en: {
    contacts: "Contacts",
    find: "Find people",
    me: "My profile",
    search: "Name or @username",
    empty: "No contacts here yet.",
    noResults: "No public profiles found.",
    received: "Received requests",
    sent: "Sent requests",
    accepted: "Your contacts",
    add: "Add contact",
    accept: "Accept",
    decline: "Decline",
    cancel: "Cancel request",
    remove: "Remove contact",
    message: "Message",
    save: "Save profile",
    saved: "Profile saved.",
    name: "Name",
    handle: "Username",
    bio: "Bio",
    public: "Public profile",
    publicHint:
      "Anyone with the link can see your name, photo, cover and bio, and find you in search.",
    photo: "Change photo",
    cover: "Change cover",
    copy: "Copy profile link",
    copied: "Link copied.",
    error: "Could not complete. Please retry.",
    taken: "That username is already taken.",
    cooldown: "You can change your username every 15 days.",
    private: "Publish your profile to share the link.",
    loading: "Loading",
    back: "Back",
    login: "Sign in to PeakBoo",
    unavailable: "Profile not found or private.",
    signIn: "Sign in to add this contact.",
    view: "View profile",
    close: "Close",
    confirmRemove:
      "Remove this contact? Sending messages will pause until a new request is accepted.",
  },
};
export const socialWords = (lang: string) => words[lang === "pt" ? "pt" : "en"];
function Cover({ src }: { src?: string | null }) {
  const { url } = useMedia(src);
  return (
    <div className="profile-cover">
      {src && !url && <span className="media-skeleton" />}
      {url && <img src={url} alt="" />}
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
  }, [api]);
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
    } catch (e) {
      const code = (e as Error).message;
      setError(
        code === "HANDLE_TAKEN"
          ? t.taken
          : code === "USERNAME_CHANGE_COOLDOWN"
            ? t.cooldown
            : t.error,
      );
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
        <div className="social-skeleton" role="status" aria-label={t.loading} />
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
              {t.handle}
              <input
                name="handle"
                value={profile.handle || ""}
                pattern="[a-z][a-z0-9_]{2,31}"
                minLength={3}
                maxLength={32}
                required
                autoCapitalize="none"
                autoCorrect="off"
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    handle: e.target.value.toLowerCase(),
                  })
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
            <label className="profile-visibility">
              <input
                type="checkbox"
                checked={profile.isPublic}
                onChange={(e) =>
                  setProfile({ ...profile, isPublic: e.target.checked })
                }
              />
              {t.public}
            </label>
            <p className="muted">{t.publicHint}</p>
            <Button busy={busy}>{t.save}</Button>
          </form>
          <Button
            variant="outline"
            disabled={!profile.isPublic || !profile.handle}
            onClick={() => {
              void navigator.clipboard
                .writeText(profileLink(profile.handle!))
                .then(() => setNotice(t.copied))
                .catch(() => setError(t.error));
            }}
          >
            <Copy size={16} />
            {t.copy}
          </Button>
          {!profile.isPublic && <p className="muted">{t.private}</p>}
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
export function PublicProfile({
  handle,
  api,
  lang,
  onBack,
  onSignIn,
  signedIn,
  userId,
}: {
  userId: string;
  handle: string;
  api: SocialAPI;
  lang: string;
  onBack: () => void;
  onSignIn: () => void;
  signedIn: boolean;
}) {
  const t = socialWords(lang),
    [p, setP] = useState<Profile | null>(null),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    api
      .publicProfile(handle)
      .then((data) => {
        if (live) setP(data);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [handle, api]);
  return (
    <main className="public-profile-page">
      <header>
        <Logo />
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft size={18} />
          {t.back}
        </Button>
      </header>
      <section className="public-profile-card">
        {failed ? (
          <p role="alert">{t.unavailable}</p>
        ) : !p ? (
          <div
            className="social-skeleton"
            role="status"
            aria-label={t.loading}
          />
        ) : (
          <>
            <Cover src={p.cover} />
            <div className="profile-identity">
              <Avatar image={p.image} name={p.name} />
              <div>
                <h1>{p.name}</h1>
                <p>@{p.handle}</p>
              </div>
            </div>
            <p className="profile-bio">{p.bio}</p>
            {!signedIn ? (
              <Button onClick={onSignIn}>{t.login}</Button>
            ) : p.id === userId ? (
              <Button onClick={onBack}>{t.me}</Button>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
