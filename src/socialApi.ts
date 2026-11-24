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
};
export type SocialAPI = {
  me: () => Promise<Profile>;
  save: (p: Profile) => Promise<void>;
  publicProfile: (h: string) => Promise<Profile>;
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
  publicProfile: async (h) =>
    (await request("/api/public/profiles/" + encodeURIComponent(h))).profile,
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
