import type { SocialAPI, Profile } from "../socialApi";
import type { User } from "../types";
import { localFile } from "../Media";
export function demoSocial(user: User): SocialAPI {
  const key = "peakboo-social-demo-v1:" + user.id;
  const sample: Profile[] = [
    {
      id: "demo-ana",
      name: "Ana Costa",
      handle: "ana_costa",
      bio: "Café, trilhas e bons encontros.",
      isPublic: true,
      relationship: "received",
    },
    {
      id: "demo-bruno",
      name: "Bruno Lima",
      handle: "bruno_lima",
      bio: "Sempre pronto para o próximo passeio.",
      isPublic: true,
      relationship: "accepted",
    },
    {
      id: "demo-clara",
      name: "Clara Alves",
      handle: "clara_alves",
      bio: "Vamos combinar?",
      isPublic: true,
    },
  ];
  function read(): { me: Profile; people: Profile[] } {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      if (saved) return saved;
    } catch {}
    return {
      me: { ...user, handle: "meu_perfil", bio: "", isPublic: false },
      people: sample,
    };
  }
  const save = (state: ReturnType<typeof read>) =>
    localStorage.setItem(key, JSON.stringify(state));
  return {
    me: async () => read().me,
    save: async (p) => {
      const s = read();
      if (s.people.some((x) => x.handle === p.handle))
        throw Error("HANDLE_TAKEN");
      s.me = p;
      save(s);
    },
    contacts: async () => read().people.filter((p) => p.relationship),
    search: async (q) =>
      read().people.filter((p) =>
        (p.name + " " + p.handle)
          .toLowerCase()
          .includes(q.replace(/^@/, "").toLowerCase()),
      ),
    publicProfile: async (h) => {
      const s = read(),
        p = [s.me, ...s.people].find((p) => p.handle === h && p.isPublic);
      if (!p) throw Error("NOT_FOUND");
      return p;
    },
    action: async (p, a) => {
      const s = read(),
        target = s.people.find((x) => x.id === p.id);
      if (!target) throw Error("NOT_FOUND");
      if (a === "accept" && target.relationship !== "received")
        throw Error("FORBIDDEN");
      target.relationship =
        a === "accept" ? "accepted" : a === "request" ? "sent" : undefined;
      save(s);
      window.dispatchEvent(new Event("peakboo:demo-social"));
    },
    conversation: async (p) => {
      const s = read();
      if (s.people.find((x) => x.id === p.id)?.relationship !== "accepted")
        throw Error("CONTACT_REQUIRED");
      const id = "direct-" + p.id;
      return {
        id,
        room: {
          id,
          name: p.name,
          image: p.image,
          description: "",
          kind: "direct",
          peerId: p.id,
          peerHandle: p.handle || undefined,
          canMessage: true,
          color: "blue",
          ownerId: user.id,
          memberCount: 2,
          unread: 0,
        },
      };
    },
    photo: async (kind, file) => {
      const url = await localFile(file),
        s = read();
      s.me[kind === "avatar" ? "image" : "cover"] = url;
      save(s);
      return url;
    },
  };
}
