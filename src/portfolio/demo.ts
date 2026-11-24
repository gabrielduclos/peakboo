import type { Boot, Message, Color } from "../types";
export function makeDemo(lang = "pt"): {
  boot: Boot;
  messages: Record<string, Message[]>;
} {
  const en = lang === "en",
    now = new Date(),
    date = (offset: number, h: number, m = 0) => {
      const d = new Date(now);
      d.setDate(d.getDate() + offset);
      d.setHours(h, m, 0, 0);
      return d.toISOString();
    };
  const saturday = (6 - now.getDay() + 7) % 7 || 7;
  const groups = [
    [
      "weekend",
      en ? "Weekend people" : "Pessoal do fim de semana",
      "coral",
      4,
      en ? "Saturday is on! ☕" : "Sábado tá de pé! ☕",
      0,
    ],
    [
      "marina",
      "Marina Costa",
      "purple",
      2,
      en ? "Loved the idea!" : "Adorei a ideia!",
      2,
    ],
    [
      "creative",
      en ? "Creative corner" : "Cantinho criativo",
      "blue",
      5,
      en ? "Let’s put it on the calendar?" : "Vamos colocar na agenda?",
      1,
    ],
    [
      "family",
      en ? "Family" : "Família",
      "green",
      6,
      en ? "Sunday lunch is confirmed 💚" : "Almoço de domingo confirmado 💚",
      0,
    ],
    [
      "lucas",
      "Lucas Almeida",
      "yellow",
      2,
      en ? "See you tomorrow!" : "Até amanhã!",
      0,
    ],
    [
      "run",
      en ? "Easy runners" : "Corrida sem pressa",
      "purple",
      8,
      en ? "Who’s running on Thursday?" : "Quem vai correr na quinta?",
      0,
    ],
  ];
  const rooms = groups.map(
    ([id, name, color, memberCount, lastText, unread], i) => ({
      id: String(id),
      name: String(name),
      description: en
        ? "Good conversations, better plans."
        : "Boas conversas, planos melhores.",
      color: color as Color,
      ownerId: "me",
      memberCount: Number(memberCount),
      lastText: String(lastText),
      lastAt: date(0, 11 - i, 42),
      unread: Number(unread),
    }),
  );
  const events = [
    {
      id: "coffee",
      roomId: "weekend",
      creatorId: "me",
      title: en ? "Coffee & good company" : "Café & boas conversas",
      description: en
        ? "A little time to catch up. Bring your favorite stories!"
        : "Um tempinho para colocar o papo em dia. Traga suas melhores histórias!",
      location: en ? "Coffee around the corner" : "Café da esquina",
      startsAt: date(saturday, 16),
      endsAt: date(saturday, 18),
      color: "coral" as Color,
      cancelled: false,
      roomName: rooms[0].name,
      rsvps: [
        { userId: "me", name: "Alex", status: "yes" as const },
        { userId: "marina", name: "Marina", status: "yes" as const },
        { userId: "lucas", name: "Lucas", status: "yes" as const },
        { userId: "bia", name: "Bia", status: "maybe" as const },
      ],
    },
    {
      id: "design",
      roomId: "creative",
      creatorId: "marina",
      title: en ? "Ideas on the table" : "Ideias na mesa",
      description: "",
      location: en ? "Online meetup" : "Encontro online",
      startsAt: date(1, 10),
      endsAt: date(1, 11),
      color: "purple" as Color,
      cancelled: false,
      roomName: rooms[2].name,
      rsvps: [{ userId: "marina", name: "Marina", status: "yes" as const }],
    },
    {
      id: "run-plan",
      roomId: "run",
      creatorId: "lucas",
      title: en ? "A run in the park" : "Uma volta no parque",
      description: "",
      location: en ? "City park" : "Parque da cidade",
      startsAt: date((4 - now.getDay() + 7) % 7 || 7, 6, 30),
      endsAt: date((4 - now.getDay() + 7) % 7 || 7, 7, 30),
      color: "green" as Color,
      cancelled: false,
      roomName: rooms[5].name,
      rsvps: [{ userId: "lucas", name: "Lucas", status: "yes" as const }],
    },
    {
      id: "lunch",
      roomId: "family",
      creatorId: "me",
      title: en ? "Sunday lunch" : "Almoço de domingo",
      description: "",
      location: en ? "At home" : "Lá em casa",
      startsAt: date(saturday + 1, 12),
      endsAt: date(saturday + 1, 15),
      color: "yellow" as Color,
      cancelled: false,
      roomName: rooms[3].name,
      rsvps: [{ userId: "me", name: "Alex", status: "yes" as const }],
    },
  ].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const msg = (
    id: string,
    senderId: string,
    senderName: string,
    text: string,
    h: number,
    m: number,
    eventId?: string,
  ): Message => ({
    id,
    senderId,
    senderName,
    text,
    createdAt: date(0, h, m),
    eventId,
    reactions: [],
  });
  const messages: Record<string, Message[]> = {
    weekend: [
      msg(
        "m1",
        "marina",
        "Marina Costa",
        en
          ? "Good morning, people! Shall we finally make that coffee happen this weekend? ☕"
          : "Bom dia, pessoal! Bora tirar aquele café do papel neste fim de semana? ☕",
        9,
        41,
      ),
      msg(
        "m2",
        "lucas",
        "Lucas Almeida",
        en
          ? "Count me in! Saturday afternoon works great."
          : "Por mim, fechado! Sábado à tarde fica ótimo.",
        9,
        43,
      ),
      {
        ...msg(
          "m3",
          "me",
          "Alex",
          en
            ? "Yes! A coffee, no rush, and lots to catch up on. ✨"
            : "Sim! Um café, sem pressa, e muito papo pra colocar em dia. ✨",
          9,
          45,
        ),
        reactions: [
          { userId: "marina", emoji: "❤️" },
          { userId: "bia", emoji: "❤️" },
        ],
      },
      msg(
        "m4",
        "bia",
        "Bia Santos",
        en
          ? "Love it! Where are we meeting?"
          : "Amei! Onde a gente se encontra?",
        9,
        47,
      ),
      msg("m5", "me", "Alex", "", 9, 48, "coffee"),
      msg(
        "m6",
        "marina",
        "Marina Costa",
        en
          ? "Perfect! Already on my calendar. 💜"
          : "Perfeito! Já coloquei na minha agenda. 💜",
        9,
        51,
      ),
      msg(
        "m7",
        "lucas",
        "Lucas Almeida",
        en ? "Saturday is on! ☕" : "Sábado tá de pé! ☕",
        9,
        52,
      ),
    ],
    marina: [
      msg(
        "ma1",
        "marina",
        "Marina Costa",
        en
          ? "Hey! Shall we plan something fun?"
          : "Oii! Vamos combinar alguma coisa legal?",
        10,
        30,
      ),
      msg(
        "ma2",
        "marina",
        "Marina Costa",
        en ? "Loved the idea!" : "Adorei a ideia!",
        10,
        32,
      ),
    ],
    creative: [
      msg(
        "c1",
        "marina",
        "Marina Costa",
        en
          ? "Our next idea deserves a little time together."
          : "Nossa próxima ideia merece um tempinho juntos.",
        10,
        10,
      ),
      msg("c2", "me", "Alex", "", 10, 12, "design"),
    ],
    family: [
      msg(
        "f1",
        "bia",
        "Bia Santos",
        en ? "Sunday lunch is confirmed 💚" : "Almoço de domingo confirmado 💚",
        9,
        10,
      ),
    ],
    lucas: [
      msg(
        "l1",
        "lucas",
        "Lucas Almeida",
        en ? "See you tomorrow!" : "Até amanhã!",
        9,
        5,
      ),
    ],
    run: [
      msg(
        "r1",
        "lucas",
        "Lucas Almeida",
        en ? "Who’s running on Thursday?" : "Quem vai correr na quinta?",
        8,
        50,
      ),
      msg("r2", "lucas", "Lucas Almeida", "", 8, 51, "run-plan"),
    ],
  };
  return {
    boot: {
      user: { id: "me", name: "Alex Morgan", email: "alex@example.com" },
      rooms,
      events,
    },
    messages,
  };
}
