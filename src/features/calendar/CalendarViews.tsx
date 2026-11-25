import {Avatar,Button,cn} from "../../components";
import {CalendarDays,Clock,MapPin,Check,Plus,ChevronLeft,ChevronRight,Globe,X} from "lucide-react";
import type {Plan,Room,Color} from "../../types";
import type {Dispatch,SetStateAction} from "react";

type Translate=(key:string)=>string;
type Format=(date:string|Date,options:Intl.DateTimeFormatOptions)=>string;
type Time=(date:string)=>string;
const colors:Color[]=["purple", "coral", "green", "blue", "yellow"];
function localDate(d:Date){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function sameDay(a:Date,b:Date){return localDate(a)===localDate(b)}
type EventCardProps={plan:Plan;compact?:boolean;userId:string;fmt:Format;time:Time;t:Translate;busy:string|null;onDetail:(p:Plan)=>void;onRsvp:(p:Plan,status:"yes"|"maybe"|"no")=>void};
type MiniCalendarProps={calendarDate:Date;chosenDay:Date|null;events:Plan[];fmt:Format;t:Translate;today:Date;onMove:(amount:number)=>void;onChooseDay:(d:Date)=>void};
type CalendarPageProps=Omit<MiniCalendarProps,"onChooseDay">&{rooms:Room[];hiddenCalendars:string[];calendarMode:string;time:Time;onChooseMiniDay:(d:Date)=>void;onNewEvent:()=>void;onNewEventOnDay:(d:Date)=>void;onDetail:(p:Plan)=>void;setHiddenCalendars:Dispatch<SetStateAction<string[]>>;setCalendarDate:Dispatch<SetStateAction<Date>>;setChosenDay:Dispatch<SetStateAction<Date|null>>;setCalendarMode:Dispatch<SetStateAction<string>>};
export function EventCard({plan:p,compact=false,userId,fmt,time,t,busy,onDetail,onRsvp}:EventCardProps) {
    const mine = p.rsvps.find((r) => r.userId === userId)?.status;
    return (
      <div
        className={cn(
          "event-card",
          p.color,
          compact && "compact",
          p.cancelled && "cancelled",
        )}
      >
        <div className="event-card-top">
          <span className="event-date">
            <span>{fmt(p.startsAt, { month: "short" }).replace(".", "")}</span>
            <strong>{new Date(p.startsAt).getDate()}</strong>
          </span>
          <span className="event-tag">
            <CalendarDays size={12} />
            {t("sharedCalendar")}
          </span>
        </div>
        <button className="event-title" onClick={() => onDetail(p)}>
          {p.title}
        </button>
        <div className="event-meta">
          <Clock size={14} />
          {fmt(p.startsAt, { weekday: "short" })} · {time(p.startsAt)} –{" "}
          {time(p.endsAt)}
        </div>
        {p.location && (
          <div className="event-meta">
            <MapPin size={14} />
            {p.location}
          </div>
        )}
        <div className="event-card-bottom">
          <span className="attendees">
            <span className="avatar-stack">
              {p.rsvps
                .filter((r) => r.status === "yes")
                .slice(0, 3)
                .map((r, i) => (
                  <Avatar
                    key={r.userId}
                    name={r.name}
                    color={colors[i]}
                    small
                  />
                ))}
            </span>
            <span>
              {p.rsvps.filter((r) => r.status === "yes").length}{" "}
              {t("confirmed")}
            </span>
          </span>
          {p.cancelled ? (
            <span className="muted">{t("cancelled")}</span>
          ) : (
            <Button
              variant={mine === "yes" ? "default" : "outline"}
              className={cn(
                "rsvp-button",
                mine === "yes" && "confirmed-button",
              )}
              busy={busy === "rsvp-" + p.id}
              onClick={() => onRsvp(p, mine === "yes" ? "maybe" : "yes")}
            >
              {mine === "yes" ? <Check size={14} /> : <Plus size={14} />}{" "}
              {mine === "yes" ? t("going") : t("going")}
            </Button>
          )}
        </div>
      </div>
    );
  }

export function MiniCalendar({calendarDate,chosenDay,events,fmt,t,today,onMove,onChooseDay}:MiniCalendarProps) {
    const first = new Date(
      calendarDate.getFullYear(),
      calendarDate.getMonth(),
      1,
    );
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7));
    return (
      <div className="mini-calendar">
        <div className="mini-calendar-title">
          <strong>
            {fmt(calendarDate, { month: "long", year: "numeric" })}
          </strong>
          <span>
            <button
              className="icon-button tiny"
              aria-label={t("previous")}
              onClick={() => onMove(-1)}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              className="icon-button tiny"
              aria-label={t("next")}
              onClick={() => onMove(1)}
            >
              <ChevronRight size={16} />
            </button>
          </span>
        </div>
        <div className="mini-grid">
          {Array.from({ length: 7 }, (_, i) => (
            <span className="weekday" key={i}>
              {fmt(new Date(2026, 10, 23 + i), { weekday: "narrow" })}
            </span>
          ))}
          {Array.from(
            {
              length:
                35 +
                (((first.getDay() + 6) % 7) +
                  new Date(
                    first.getFullYear(),
                    first.getMonth() + 1,
                    0,
                  ).getDate() >
                35
                  ? 7
                  : 0),
            },
            (_, i) => {
              const d = new Date(start);
              d.setDate(start.getDate() + i);
              return (
                <button
                  key={i}
                  className={cn(
                    "mini-day",
                    d.getMonth() !== first.getMonth() && "outside",
                    sameDay(d, today) && "is-today",
                    chosenDay && sameDay(d, chosenDay) && "chosen",
                  )}
                  onClick={() => onChooseDay(d)}
                >
                  {d.getDate()}
                  {events.some((e) => sameDay(new Date(e.startsAt), d)) && (
                    <i />
                  )}
                </button>
              );
            },
          )}
        </div>
      </div>
    );
  }

export function CalendarPage({calendarDate,chosenDay,events,rooms,hiddenCalendars,calendarMode,fmt,time,t,today,onMove,onChooseMiniDay,onNewEvent,onNewEventOnDay,onDetail,setHiddenCalendars,setCalendarDate,setChosenDay,setCalendarMode}:CalendarPageProps) {
    const first = new Date(
        calendarDate.getFullYear(),
        calendarDate.getMonth(),
        1,
      ),
      start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7));
    const visible = events.filter((e) => !hiddenCalendars.includes(e.roomId));
    const currentMonth = fmt(calendarDate, { month: "long", year: "numeric" });
    return (
      <section className="calendar-page">
        <div className="calendar-actions conversation-title">
          <h1>{t("calendar")}</h1>
          <Button onClick={() => onNewEvent()}>
            <Plus size={17} />
            {t("newEvent")}
          </Button>
        </div>
        <div className="calendar-layout">
          <aside className="calendar-sidebar">
            <MiniCalendar calendarDate={calendarDate} chosenDay={chosenDay} events={events} fmt={fmt} t={t} today={today} onMove={onMove} onChooseDay={onChooseMiniDay}/>
            <div className="your-calendars">
              <h4>{t("yourCalendars")}</h4>
              {rooms.map((r) => (
                <label key={r.id}>
                  <input
                    type="checkbox"
                    checked={!hiddenCalendars.includes(r.id)}
                    onChange={() =>
                      setHiddenCalendars((h) =>
                        h.includes(r.id)
                          ? h.filter((x) => x !== r.id)
                          : [...h, r.id],
                      )
                    }
                    style={{ accentColor: `var(--${r.color})` }}
                  />
                  <span>{r.name}</span>
                </label>
              ))}
            </div>
            <p className="timezone">
              <Globe size={14} />
              {t("timeZone")}
            </p>
          </aside>
          <div className="calendar-board">
            <div className="calendar-toolbar">
              <div className="month-label">
                <h3>{currentMonth}</h3>
                <button
                  className="icon-button"
                  aria-label={t("previous")}
                  onClick={() => onMove(-1)}
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label={t("next")}
                  onClick={() => onMove(1)}
                >
                  <ChevronRight size={17} />
                </button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setCalendarDate(new Date());
                    setChosenDay(null);
                  }}
                >
                  {t("today")}
                </Button>
              </div>
              <div className="segmented">
                {["month", "week", "agenda"].map((m) => (
                  <button
                    key={m}
                    className={calendarMode === m ? "active" : ""}
                    onClick={() => {
                      setCalendarMode(m);
                      setChosenDay(null);
                    }}
                  >
                    {t(m)}
                  </button>
                ))}
              </div>
            </div>
            <select
              className="calendar-mobile-filter"
              aria-label={t("filter")}
              value={
                hiddenCalendars.length === rooms.length - 1
                  ? rooms.find((r) => !hiddenCalendars.includes(r.id))
                      ?.id || ""
                  : ""
              }
              onChange={(e) =>
                setHiddenCalendars(
                  e.target.value
                    ? rooms
                        .filter((r) => r.id !== e.target.value)
                        .map((r) => r.id)
                    : [],
                )
              }
            >
              <option value="">{t("allCalendars")}</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            {calendarMode === "month" ? (
              <div className="month-grid">
                {Array.from({ length: 7 }, (_, i) => (
                  <div className="month-weekday" key={i}>
                    {fmt(new Date(2026, 10, 23 + i), { weekday: "short" })}
                  </div>
                ))}
                {Array.from({ length: 42 }, (_, i) => {
                  const d = new Date(start);
                  d.setDate(start.getDate() + i);
                  const dayEvents = visible.filter((e) =>
                    sameDay(d, new Date(e.startsAt)),
                  );
                  return (
                    <div
                      className={cn(
                        "month-cell",
                        d.getMonth() !== first.getMonth() && "outside",
                      )}
                      key={i}
                    >
                      <button
                        className={cn(
                          "day-number",
                          sameDay(d, today) && "is-today",
                        )}
                        aria-label={fmt(d, { dateStyle: "full" })}
                        onClick={() => onNewEventOnDay(d)}
                      >
                        {d.getDate()}
                      </button>
                      {dayEvents.slice(0, 2).map((p) => (
                        <button
                          key={p.id}
                          className={cn("calendar-event", p.color)}
                          onClick={() => onDetail(p)}
                        >
                          <span>{time(p.startsAt)}</span>
                          <strong>{p.title}</strong>
                        </button>
                      ))}
                      {dayEvents.length > 2 && (
                        <button
                          className="more-events"
                          onClick={() => {
                            setChosenDay(d);
                            setCalendarMode("agenda");
                          }}
                        >
                          +{dayEvents.length - 2}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : calendarMode === "week" ? (
              <div className="week-grid">
                {Array.from({ length: 7 }, (_, i) => {
                  const d = new Date(calendarDate);
                  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + i);
                  const dayEvents = visible.filter((e) =>
                    sameDay(d, new Date(e.startsAt)),
                  );
                  return (
                    <div className="week-day" key={i}>
                      <div className="week-day-title">
                        <span>{fmt(d, { weekday: "short" })}</span>
                        <strong className={sameDay(d, today) ? "is-today" : ""}>
                          {d.getDate()}
                        </strong>
                      </div>
                      {dayEvents.map((p) => (
                        <button
                          key={p.id}
                          className={cn("week-event", p.color)}
                          onClick={() => onDetail(p)}
                        >
                          <Clock size={14} />
                          <span>{time(p.startsAt)}</span>
                          <strong>{p.title}</strong>
                          <small>{p.location}</small>
                        </button>
                      ))}
                      <button
                        className="week-add"
                        aria-label={
                          t("newEvent") + " " + fmt(d, { dateStyle: "short" })
                        }
                        onClick={() => onNewEventOnDay(d)}
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="agenda-list">
                {chosenDay && (
                  <div className="selected-day">
                    <h3>{fmt(chosenDay, { dateStyle: "full" })}</h3>
                    <button
                      className="icon-button"
                      aria-label={t("all")}
                      onClick={() => setChosenDay(null)}
                    >
                      <X size={17} />
                    </button>
                  </div>
                )}
                {visible
                  .filter((p) =>
                    chosenDay
                      ? sameDay(new Date(p.startsAt), chosenDay)
                      : new Date(p.startsAt).getMonth() ===
                          calendarDate.getMonth() &&
                        new Date(p.startsAt).getFullYear() ===
                          calendarDate.getFullYear(),
                  )
                  .map((p) => (
                    <button
                      className="agenda-row"
                      key={p.id}
                      onClick={() => onDetail(p)}
                    >
                      <span className={cn("agenda-date", p.color)}>
                        <small>{fmt(p.startsAt, { month: "short" })}</small>
                        <strong>{new Date(p.startsAt).getDate()}</strong>
                      </span>
                      <span className="agenda-info">
                        <strong>{p.title}</strong>
                        <small>
                          {p.roomName ||
                            rooms.find((r) => r.id === p.roomId)?.name}
                        </small>
                        <small>
                          <MapPin size={12} />
                          {p.location || "—"}
                        </small>
                      </span>
                      <span className="agenda-time">
                        {time(p.startsAt)}
                        <small>{time(p.endsAt)}</small>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                  ))}
                {!visible.some((p) =>
                  chosenDay
                    ? sameDay(new Date(p.startsAt), chosenDay)
                    : new Date(p.startsAt).getMonth() ===
                        calendarDate.getMonth() &&
                      new Date(p.startsAt).getFullYear() ===
                        calendarDate.getFullYear(),
                ) && (
                  <div className="empty-state">
                    <CalendarDays />
                    <h3>{t("noEvents")}</h3>
                    <p>{t("noEventsDesc")}</p>
                    <Button variant="outline" onClick={() => onNewEvent()}>
                      <Plus size={16} />
                      {t("newEvent")}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }
