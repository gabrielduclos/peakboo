import { useEffect, useRef, useState } from "react";
import { QrCode, Send } from "lucide-react";
import { Avatar, Button, Modal } from "./components";
import type { Profile, SocialAPI } from "./socialApi";
export function InvitationTools({
  url,
  name,
  api,
  lang,
  onSend,
}: {
  url: string;
  name: string;
  api: SocialAPI;
  lang: string;
  onSend: (contact: Profile, text: string, id: string) => Promise<void>;
}) {
  const pt = lang === "pt",
    [mode, setMode] = useState<"qr" | "send" | null>(null),
    [svg, setSvg] = useState(""),
    [people, setPeople] = useState<Profile[]>([]),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [sent, setSent] = useState<string[]>([]);
  const lock = useRef(false),
    ids = useRef(new Map<string, string>());
  useEffect(() => {
    setMode(null);
    setSent([]);
    ids.current.clear();
  }, [url]);
  useEffect(() => {
    let live = true;
    setError("");
    setSvg("");
    if (!mode) return;
    setLoading(true);
    const task =
      mode === "qr"
        ? import("qrcode").then(({default:QRCode})=>QRCode.toString(url, {
            type: "svg",
            margin: 4,
            errorCorrectionLevel: "M",
          })).then((s) => {
            if (live)
              setSvg(
                "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s),
              );
          })
        : api.contacts().then((data) => {
            if (live)
              setPeople(data.filter((p) => p.relationship === "accepted"));
          });
    task
      .catch(() => {
        if (live)
          setError(
            pt
              ? "Não foi possível carregar. Tente novamente."
              : "Could not load. Please retry.",
          );
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [mode, url, api]);
  async function send(p: Profile) {
    if (lock.current) return;
    lock.current = true;
    setBusy(p.id);
    setError("");
    try {
      let id = ids.current.get(p.id);
      if (!id) {
        id = crypto.randomUUID();
        ids.current.set(p.id, id);
      }
      await onSend(
        p,
        (pt ? "Convite para " : "Invitation to ") + name + "\n" + url,
        id,
      );
      setSent((old) => [...old, p.id]);
    } catch {
      setError(
        pt
          ? "Não foi possível enviar o convite. Tente novamente."
          : "Could not send the invitation. Please retry.",
      );
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  return (
    <>
      <div className="invite-options">
        <Button variant="outline" onClick={() => setMode("send")}>
          <Send size={17} />
          {pt ? "Enviar por mensagem" : "Send in a message"}
        </Button>
        <Button variant="outline" onClick={() => setMode("qr")}>
          <QrCode size={18} />
          {pt ? "Mostrar QR Code" : "Show QR code"}
        </Button>
      </div>
      <Modal
        open={!!mode}
        onOpenChange={(v) => {
          if (!v && !busy) setMode(null);
        }}
        title={
          mode === "qr" ? "QR Code" : pt ? "Enviar convite" : "Send invitation"
        }
        description={name}
        closeLabel={pt ? "Fechar" : "Close"}
      >
        {loading && (
          <div
            className="social-skeleton"
            role="status"
            aria-label={pt ? "Carregando" : "Loading"}
          />
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {mode === "qr" && svg && (
          <div className="invite-qr">
            <img
              src={svg}
              width={288}
              height={288}
              alt={pt ? "QR Code do convite" : "Invitation QR code"}
            />
            <p>
              {pt
                ? "Escaneie para entrar na conversa."
                : "Scan to join the conversation."}
            </p>
            <a href={url}>{url}</a>
          </div>
        )}
        {mode === "send" && !loading && (
          <>
            {!people.length && (
              <p>
                {pt
                  ? "Adicione um contato e aguarde o aceite para enviar um convite por mensagem."
                  : "Add a contact and wait for acceptance to send an invitation in a message."}
              </p>
            )}
            {people.map((p) => (
              <div className="contact-row" key={p.id}>
                <span className="contact-identity">
                  <Avatar image={p.image} name={p.name} />
                  <strong>{p.name}</strong>
                </span>
                <Button
                  busy={busy === p.id}
                  disabled={!!busy || sent.includes(p.id)}
                  onClick={() => void send(p)}
                >
                  {sent.includes(p.id)
                    ? pt
                      ? "Enviado"
                      : "Sent"
                    : pt
                      ? "Enviar convite"
                      : "Send invitation"}
                </Button>
              </div>
            ))}
          </>
        )}
      </Modal>
    </>
  );
}
