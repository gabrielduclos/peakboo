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
    },
    {
      id: "demo-bruno",
      name: "Bruno Lima",
      handle: "bruno_lima",
      bio: "Sempre pronto para o próximo passeio.",
      isPublic: true,
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
    publicProfile: async (h) => {
      const s = read(),
        p = [s.me, ...s.people].find((p) => p.handle === h && p.isPublic);
      if (!p) throw Error("NOT_FOUND");
      return p;
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
