import { CalendarDays } from "lucide-react";
import type { Plan } from "./types";

export default function UpcomingEventsBar({
  events,
  roomId,
  lang,
  onSelect,
  now = new Date(),
}: {
  events: Plan[];
  roomId: string;
  lang: string;
  onSelect: (event: Plan) => void;
  now?: Date;
}) {
  const upcoming = events
    .filter(
      (event) =>
        event.roomId === roomId &&
        !event.cancelled &&
        new Date(event.startsAt) >= now,
    )
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .slice(0, 3);
  if (!upcoming.length) return null;
  const label = lang === "pt" ? "Próximos eventos" : "Upcoming events";
  const format = new Intl.DateTimeFormat(lang === "pt" ? "pt-BR" : "en-US", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <section className="chat-events-bar" aria-label={label}>
      <span className="chat-events-label">
        <CalendarDays size={16} />
        {label}
      </span>
      <div className="chat-events-items">
        {upcoming.map((event) => (
          <button
            key={event.id}
            onClick={() => onSelect(event)}
            title={event.title}
          >
            <strong>{event.title}</strong>
            <time dateTime={event.startsAt}>
              {format.format(new Date(event.startsAt))}
            </time>
          </button>
        ))}
      </div>
    </section>
  );
}
