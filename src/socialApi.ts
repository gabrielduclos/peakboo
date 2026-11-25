import { request } from "./api";
export type Profile = {
  id: string;
  name: string;
  bio: string;
  image?: string | null;
  cover?: string | null;
  createdAt?: string;
};
export type SocialAPI = {
  me: () => Promise<Profile>;
  save: (p: Profile) => Promise<void>;
  photo: (kind: "avatar" | "cover", file: File) => Promise<string>;
};
export const socialAPI: SocialAPI = {
  me: async () => (await request("/api/me/profile")).profile,
  save: async (p) => {
    await request("/api/me/profile", "PUT", {
      name: p.name,
          bio: p.bio,
        });
  },
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
