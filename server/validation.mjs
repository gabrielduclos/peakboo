import { z } from "zod";
export const roomInput = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).default(""),
  color: z
    .enum(["purple", "coral", "green", "blue", "yellow"])
    .default("purple"),
});
export const messageInput = z.object({
  id: z.uuid(),
  text: z.string().trim().max(4000),
  attachmentId: z.uuid().optional(),
  replyTo: z.uuid().optional(),
}).refine(x => !!x.text || !!x.attachmentId);
export const eventInput = z
  .object({
    title: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1000).default(""),
    location: z.string().trim().max(180).default(""),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    color: z
      .enum(["purple", "coral", "green", "blue", "yellow"])
      .default("purple"),
  })
  .refine((x) => new Date(x.endsAt) > new Date(x.startsAt), {
    message: "END_BEFORE_START",
    path: ["endsAt"],
  });
export const rsvpInput = z.object({ status: z.enum(["yes", "maybe", "no"]) });
export const reactionInput = z.object({
  emoji: z.enum(["❤️", "👍", "😂", "🎉", "🔥", "😊", "😍", "🥰", "😮", "😢", "😭", "😡", "🤔", "😎", "🙏", "👏", "🙌", "💪", "👀", "✅", "💯", "🤝", "👎", "💔"]),
});
