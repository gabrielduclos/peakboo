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
import type { Room } from "./types";
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
export function ContactActions({
  profile,
  api,
  lang,
  onChanged,
  onConversation,
}: {
  profile: Profile;
  api: SocialAPI;
  lang: string;
  onChanged: () => Promise<void>;
  onConversation: (id: string, room?: Room) => void | Promise<void>;
}) {
  const t = socialWords(lang),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false),
    lock = useRef(false);
  async function action(a: "request" | "accept" | "remove" | "message") {
    if (lock.current) return;
    lock.current = true;
    setBusy(a);
    setError("");
    try {
      if (a === "message") {
        const r = await api.conversation(profile);
        await onConversation(r.id, r.room);
      } else {
        await api.action(profile, a);
        await onChanged();
        setConfirm(false);
      }
    } catch {
      setError(t.error);
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  const status = profile.relationship;
  return (
    <div className="contact-actions">
      {status === "accepted" ? (
        <>
          <Button
            busy={busy === "message"}
            disabled={!!busy}
            onClick={() => void action("message")}
          >
            <MessageCircle size={16} />
            {t.message}
          </Button>
          <Button
            variant="ghost"
            disabled={!!busy}
            onClick={() => setConfirm(true)}
          >
            {t.remove}
          </Button>
        </>
      ) : status === "received" ? (
        <>
          <Button
            busy={busy === "accept"}
            disabled={!!busy}
            onClick={() => void action("accept")}
          >
            {t.accept}
          </Button>
          <Button
            variant="outline"
            busy={busy === "remove"}
            disabled={!!busy}
            onClick={() => void action("remove")}
          >
            {t.decline}
          </Button>
        </>
      ) : (
        <Button
          variant="outline"
          disabled={!!busy || !profile.handle}
          busy={!!busy}
          onClick={() => void action(status === "sent" ? "remove" : "request")}
        >
          <UserPlus size={16} />
          {status === "sent" ? t.cancel : t.add}
        </Button>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <Modal
        open={confirm}
        onOpenChange={(v) => {
          if (!busy) setConfirm(v);
        }}
        title={t.remove}
        description={t.confirmRemove}
        closeLabel={t.close}
      >
        <div className="form-footer">
          <Button
            variant="outline"
            disabled={!!busy}
            onClick={() => setConfirm(false)}
          >
            {lang === "pt" ? "Cancelar" : "Cancel"}
          </Button>
          <Button
            variant="danger"
            busy={busy === "remove"}
            onClick={() => void action("remove")}
          >
            {t.remove}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
export function SocialHub({
  api,
  lang,
  onConversation,
  onSaved,
}: {
  api: SocialAPI;
  lang: string;
  onConversation: (id: string, room?: Room) => void | Promise<void>;
  onSaved: () => void;
}) {
  const t = socialWords(lang),
    [tab, setTab] = useState("contacts"),
    [contacts, setContacts] = useState<Profile[]>([]),
    [results, setResults] = useState<Profile[]>([]),
    [q, setQ] = useState(""),
    [loading, setLoading] = useState(true),
    [searching, setSearching] = useState(false),
    [error, setError] = useState(""),
    [person, setPerson] = useState<Profile | null>(null);
  const searchSeq = useRef(0);
  async function refresh() {
    const list = await api.contacts();
    setContacts(list);
  }
  useEffect(() => {
    let live = true;
    api
      .contacts()
      .then((data) => {
        if (live) setContacts(data);
      })
      .catch(() => {
        if (live) setError(t.error);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    const update = () => {
      void refresh().catch(() => setError(t.error));
    };
    window.addEventListener("peakboo:social", update);
    return () => {
      live = false;
      window.removeEventListener("peakboo:social", update);
    };
  }, [api]);
  useEffect(() => {
    const seq = ++searchSeq.current;
    setSearching(q.trim().length >= 2);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      api
        .search(q.trim())
        .then((data) => {
          if (seq === searchSeq.current) setResults(data);
        })
        .catch(() => {
          if (seq === searchSeq.current) setError(t.error);
        })
        .finally(() => {
          if (seq === searchSeq.current) setSearching(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      searchSeq.current++;
    };
  }, [q, api]);
  const relation = (p: Profile) => ({
    ...p,
    relationship: contacts.find((c) => c.id === p.id)?.relationship,
  });
  const row = (p: Profile) => (
    <article className="contact-row" key={p.id}>
      <button
        className="contact-identity"
        onClick={() => setPerson(p)}
        aria-label={t.view + " " + p.name}
      >
        <Avatar image={p.image} name={p.name} />
        <span>
          <strong>{p.name}</strong>
          <small>{p.handle ? "@" + p.handle : ""}</small>
        </span>
      </button>
      <ContactActions
        profile={relation(p)}
        api={api}
        lang={lang}
        onChanged={refresh}
        onConversation={onConversation}
      />
    </article>
  );
  return (
    <div className="social-hub">
      <div className="social-tabs" role="tablist">
        {(["contacts", "find", "me"] as const).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
          >
            {t[key]}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {tab === "me" ? (
        <ProfileEditor api={api} lang={lang} onSaved={onSaved} />
      ) : tab === "find" ? (
        <>
          <label className="social-search">
            <Search size={18} />
            <input
              aria-label={t.search}
              placeholder={t.search}
              value={q}
              onChange={(e) => {
                setError("");
                setQ(e.target.value);
              }}
              maxLength={40}
            />
          </label>
          {searching ? (
            <div
              className="social-skeleton"
              role="status"
              aria-label={t.loading}
            />
          ) : (
            results.map(row)
          )}
          {!searching && q.trim().length >= 2 && !results.length && !error && (
            <p className="social-empty">{t.noResults}</p>
          )}
        </>
      ) : loading ? (
        <div className="social-skeleton" role="status" aria-label={t.loading} />
      ) : (
        <>
          {(["received", "sent", "accepted"] as const).map((status) => {
            const list = contacts.filter((c) => c.relationship === status);
            return list.length ? (
              <section className="contact-section" key={status}>
                <h3>
                  {t[status]} <small>{list.length}</small>
                </h3>
                {list.map(row)}
              </section>
            ) : null;
          })}
          {!contacts.length && <p className="social-empty">{t.empty}</p>}
        </>
      )}
      <Modal
        open={!!person}
        onOpenChange={(v) => {
          if (!v) setPerson(null);
        }}
        title={person?.name || t.view}
        closeLabel={t.close}
      >
        {person && (
          <>
            <Cover src={person.cover} />
            <div className="profile-identity">
              <Avatar image={person.image} name={person.name} />
              <div>
                <h3>{person.name}</h3>
                <p>@{person.handle}</p>
              </div>
            </div>
            <p className="profile-bio">{person.bio}</p>
            <ContactActions
              profile={relation(person)}
              api={api}
              lang={lang}
              onChanged={refresh}
              onConversation={onConversation}
            />
            {person.isPublic && person.handle && (
              <a className="button outline" href={"/@" + person.handle}>
                {t.view}
              </a>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
export function PublicProfile({
  handle,
  api,
  lang,
  onBack,
  onSignIn,
  onConversation,
  signedIn,
  userId,
}: {
  userId: string;
  handle: string;
  api: SocialAPI;
  lang: string;
  onBack: () => void;
  onSignIn: () => void;
  onConversation: (id: string, room?: Room) => void | Promise<void>;
  signedIn: boolean;
}) {
  const t = socialWords(lang),
    [p, setP] = useState<Profile | null>(null),
    [contacts, setContacts] = useState<Profile[]>([]),
    [failed, setFailed] = useState(false);
  async function refresh() {
    setContacts(await api.contacts());
  }
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
  useEffect(() => {
    if (signedIn) void refresh().catch(() => {});
  }, [signedIn, api]);
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
            {signedIn && p.id !== userId ? (
              <ContactActions
                profile={{
                  ...p,
                  relationship: contacts.find((c) => c.id === p.id)
                    ?.relationship,
                }}
                api={api}
                lang={lang}
                onChanged={refresh}
                onConversation={onConversation}
              />
            ) : !signedIn ? (
              <Button onClick={onSignIn}>{t.login}</Button>
            ) : (
              <Button onClick={onBack}>{t.me}</Button>
            )}
          </>
        )}
      </section>
    </main>
  );
}
