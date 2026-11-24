import { request } from "./api";
export type Profile = {
  id: string;
  name: string;
  handle: string | null;
  bio: string;
  image?: string | null;
  cover?: string | null;
  isPublic: boolean;
  createdAt?: string;
  handleChangedAt?: string;
  relationship?: "sent" | "received" | "accepted";
};
export type SocialAPI = {
  me: () => Promise<Profile>;
  save: (p: Profile) => Promise<void>;
  search: (q: string) => Promise<Profile[]>;
  contacts: () => Promise<Profile[]>;
  publicProfile: (h: string) => Promise<Profile>;
  action: (p: Profile, a: "request" | "accept" | "remove") => Promise<void>;
  conversation: (
    p: Profile,
  ) => Promise<{ id: string; room?: import("./types").Room }>;
  photo: (kind: "avatar" | "cover", file: File) => Promise<string>;
};
export const socialAPI: SocialAPI = {
  me: async () => (await request("/api/me/profile")).profile,
  save: async (p) => {
    await request("/api/me/profile", "PUT", {
      name: p.name,
      handle: p.handle,
      bio: p.bio,
      isPublic: p.isPublic,
    });
  },
  search: async (q) =>
    (await request("/api/profiles/search?q=" + encodeURIComponent(q))).profiles,
  contacts: async () => (await request("/api/contacts")).contacts,
  publicProfile: async (h) =>
    (await request("/api/public/profiles/" + encodeURIComponent(h))).profile,
  action: async (p, a) => {
    if (a === "request")
      await request("/api/contacts/requests", "POST", { handle: p.handle });
    else
      await request(
        "/api/contacts/" +
          encodeURIComponent(p.id) +
          (a === "accept" ? "/accept" : ""),
        a === "accept" ? "POST" : "DELETE",
      );
  },
  conversation: (p) =>
    request(
      "/api/contacts/" + encodeURIComponent(p.id) + "/conversation",
      "POST",
    ),
  photo: async (kind, file) => {
    const { uploadMedia } = await import("./Media");
    return (
      await uploadMedia(
        "/api/profile/" + (kind === "avatar" ? "photo" : "cover"),
        file,
      )
    ).image;
  },
};
