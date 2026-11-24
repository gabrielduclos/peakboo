import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type FormEvent,
} from "react";
import * as Tabs from "@radix-ui/react-tabs";
import {
  MessageCircle,
  CalendarDays,
  Settings,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowUp,
  Sun,
  Moon,
  Users,
  MapPin,
  Clock,
  Check,
  CheckCheck,
  Smile,
  CalendarPlus,
  LogOut,
  Eye,
  EyeOff,
  Copy,
  Link,
  ArrowLeft,
  X,
  Sparkles,
  Globe,
  Download,
  Pencil,
  Trash2,
  LoaderCircle,
  WifiOff,
  Inbox,
  Heart,
  LayoutGrid,
  List,
  ExternalLink,
} from "lucide-react";
import { Button, Modal, Avatar, Logo, cn } from "./components";
import type { Boot, Room, Message, Plan, Color } from "./types";
import { strings } from "./i18n";
import { request, getToken, watchChanges, API } from "./api";
const COLORS: Color[] = ["purple", "coral", "green", "blue", "yellow"];
const EMOJIS = ["❤️", "👍", "😂", "🎉", "🔥"];
const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const localTime = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const sameDay = (a: Date, b: Date) => localDate(a) === localDate(b);
const today = new Date();
const emptyBoot: Boot = {
  user: { id: "", name: "", email: "" },
  rooms: [],
  events: [],
};
export default function App() {
  const [lang, setLang] = useState(
    localStorage.getItem("peakboo-language") || "pt",
  );
  const t = (key: string) => strings[lang]?.[key] || strings.pt[key] || key;
  const [theme, setTheme] = useState(
    localStorage.getItem("peakboo-theme") || "light",
  );

  const [boot, setBoot] = useState<Boot>(() => emptyBoot);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [selected, setSelected] = useState<string | null>(() => null);
  const [view, setView] = useState<"chats" | "calendar">("chats");
  const [mobileChat, setMobileChat] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [chatQuery, setChatQuery] = useState("");
  const [showChatSearch, setShowChatSearch] = useState(false);
  const [text, setText] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [reactionOpen, setReactionOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!getToken());
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [connected, setConnected] = useState(true);
  const [hasMore, setHasMore] = useState<Record<string, boolean>>({});
  const [modal, setModal] = useState<
    | "new"
    | "invite"
    | "members"
    | "settings"
    | "auth"
    | "event"
    | "detail"
    | null
  >(null);
  const [authMode, setAuthMode] = useState("login");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState("");
  const [newTab, setNewTab] = useState("create");
  const [newColor, setNewColor] = useState<Color>("purple");
  const [activeEvent, setActiveEvent] = useState<Plan | null>(null);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [eventTitle, setEventTitle] = useState("");
  const [eventColor, setEventColor] = useState<Color>("purple");
  const [eventDay, setEventDay] = useState(localDate(today));
  const [chosenDay, setChosenDay] = useState<Date | null>(null);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calendarMode, setCalendarMode] = useState("month");
  const [hiddenCalendars, setHiddenCalendars] = useState<string[]>([]);
  const [members, setMembers] = useState<
    {
      id: string;
      name: string;
    }[]
  >([]);
  const [pendingInvite, setPendingInvite] = useState(
    () => new URLSearchParams(location.hash.slice(1)).get("invite") || "",
  );
  const [failed, setFailed] = useState<{
    id: string;
    text: string;
    roomId: string;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const signedOutRef = useRef(!getToken());
  signedOutRef.current = !getToken();
  const room = boot.rooms.find((r) => r.id === selected);
  const events = boot.events
    .filter((e) => !e.cancelled)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const upcoming = events.filter((e) => new Date(e.endsAt) >= new Date());
  const currentMessages = selected ? messages[selected] || [] : [];
  const locale = lang === "pt" ? "pt-BR" : "en-US";
  const fmt = (d: string | Date, options: Intl.DateTimeFormatOptions) =>
    new Date(d).toLocaleDateString(locale, options);
  const time = (d: string) =>
    new Date(d).toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });
  const notify = (message: string) => setToast(message);
  const errorText = (e: unknown) => {
    const k = e instanceof Error ? e.message : "";
    const codes: Record<string, string> = {
      UNAUTHORIZED: "sessionExpired",
      NETWORK_ERROR: "networkError",
      INVALID_INPUT: "invalid",
      INVITE_NOT_FOUND: "inviteInvalid",
      RATE_LIMIT: "rateLimit",
      TOO_MANY_REQUESTS: "rateLimit",
      FORBIDDEN: "forbidden",
      CONFLICT: "conflict",
      INVALID_EMAIL_OR_PASSWORD: "authError",
      USER_ALREADY_EXISTS: "emailExists",
      USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "emailExists",
      PASSWORD_TOO_SHORT: "shortPassword",
      INVALID_PASSWORD: "authError",
    };
    return t(codes[k] || "error");
  };
  const openModal = (m: typeof modal) => {
    setFormError("");
    setModal(m);
  };
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("peakboo-theme", theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
    localStorage.setItem("peakboo-language", lang);
    document.title =
      lang === "pt"
        ? "Peakboo · Conversas que viram planos"
        : "Peakboo · Conversations become plans";
  }, [lang]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(id);
  }, [toast]);
  const fetchMessages = useCallback(async (id: string) => {
    const data = await request("/api/rooms/" + id + "/messages");
    if (!signedOutRef.current)
      setMessages((m) => ({
        ...m,
        [id]: [
          ...(m[id] || []).filter(
            (old) =>
              !data.messages.some((fresh: Message) => fresh.id === old.id),
          ),
          ...data.messages,
        ]
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .slice(-2000),
      }));
    setHasMore((m) => ({ ...m, [id]: data.hasMore }));
  }, []);
  const refresh = useCallback(async () => {
    const data: Boot = await request("/api/bootstrap");
    if (signedOutRef.current) return;
    setBoot(data);
    setSelected((id) =>
      data.rooms.some((r: Room) => r.id === id)
        ? id
        : data.rooms[0]?.id || null,
    );
  }, []);
  useEffect(() => {
    if (!getToken()) return;
    let alive = true;
    setLoading(true);
    refresh()
      .catch((e) => {
        if (alive) {
          setFormError(errorText(e));
          if (e.message === "UNAUTHORIZED") {
            sessionStorage.removeItem("peakboo-session");
            setBoot(emptyBoot);
            setMessages({});
            setSelected(null);
            setAuthMode("login");
            setModal("auth");
          }
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [refresh]);
  useEffect(() => {
    if (!selected) return;
    let alive = true;
    setLoadingMessages(!messages[selected]);
    fetchMessages(selected)
      .catch((e) => notify(errorText(e)))
      .finally(() => alive && setLoadingMessages(false));
    request("/api/rooms/" + selected + "/read", "POST")
      .then(() =>
        setBoot((b) => ({
          ...b,
          rooms: b.rooms.map((r) =>
            r.id === selected ? { ...r, unread: 0 } : r,
          ),
        })),
      )
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [selected, fetchMessages]);
  useEffect(() => {
    if (!getToken()) return;
    let stopped = false,
      controller: AbortController | null = null,
      reconnect: ReturnType<typeof setTimeout> | null = null;
    let delay = 1000;
    const sync = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        refresh()
          .then(() => {
            const id = selectedRef.current;
            if (!id) return;
            return fetchMessages(id).then(async () => {
              await request("/api/rooms/" + id + "/read", "POST");
              setBoot((b) => ({
                ...b,
                rooms: b.rooms.map((r) =>
                  r.id === id ? { ...r, unread: 0 } : r,
                ),
              }));
            });
          })
          .catch(() => setConnected(false));
      }, 180);
    };
    const connect = async () => {
      if (stopped || document.hidden) return;
      controller = new AbortController();
      try {
        await watchChanges(controller.signal, sync, (v) => {
          setConnected(v);
          delay = 1000;
        });
      } catch {}
      if (!stopped && !document.hidden) {
        setConnected(false);
        reconnect = setTimeout(() => {
          sync();
          connect();
        }, delay);
        delay = Math.min(delay * 2, 30000);
      }
    };
    const visibility = () => {
      controller?.abort();
      if (reconnect) clearTimeout(reconnect);
      if (!document.hidden) {
        sync();
        connect();
      }
    };
    connect();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      stopped = true;
      controller?.abort();
      if (reconnect) clearTimeout(reconnect);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [boot.user.id, refresh, fetchMessages]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "instant" as ScrollBehavior,
    });
  }, [selected, currentMessages.length, view, mobileChat]);
  useEffect(() => {
    if (!getToken()) return;
    if (pendingInvite && !loading) {
      request("/api/join", "POST", { code: pendingInvite })
        .then(async (data) => {
          await refresh();
          setSelected(data.id);
          setView("chats");
          setMobileChat(true);
          notify(t("joined"));
          setPendingInvite("");
          history.replaceState(null, "", location.pathname);
        })
        .catch((e) => {
          notify(errorText(e));
          setPendingInvite("");
        });
    }
  }, [pendingInvite, boot.user.id, loading]);
  function selectRoom(r: Room) {
    setSelected(r.id);
    setView("chats");
    setMobileChat(true);
    setChatQuery("");
    setFailed(null);
    setText("");
    setBoot((b) => ({
      ...b,
      rooms: b.rooms.map((x) => (x.id === r.id ? { ...x, unread: 0 } : x)),
    }));
  }
  function openEvent(initial?: string, edit?: Plan) {
    setEditPlan(edit || null);
    setEventTitle(edit?.title || initial || "");
    setEventColor(edit?.color || room?.color || "purple");
    setEventDay(
      localDate(edit ? new Date(edit.startsAt) : chosenDay || new Date()),
    );
    openModal("event");
  }
  async function authenticate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setBusy("auth");
    setFormError("");
    try {
      await request(
        "/api/auth/" +
          (authMode === "signup" ? "sign-up/email" : "sign-in/email"),
        "POST",
        {
          email: d.get("email"),
          password: d.get("password"),
          ...(authMode === "signup" ? { name: d.get("name") } : {}),
        },
      );
      if (!getToken()) throw new Error("SERVER_ERROR");
      setBoot(emptyBoot);
      setMessages({});
      setSelected(null);
      setHiddenCalendars([]);
      signedOutRef.current = false;
      await refresh();
      setModal(null);
      notify(t("authSuccess"));
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setBusy(null);
    }
  }
  async function signOut() {
    setBusy("signout");
    try {
      await request("/api/auth/sign-out", "POST", {});
      sessionStorage.removeItem("peakboo-session");
      setBoot(emptyBoot);
      setMessages({});
      setSelected(null);
      setHiddenCalendars([]);
      setModal(null);
      setView("chats");
    } catch (e) {
      setFormError(errorText(e));
    } finally {
      setBusy(null);
    }
  }
  async function createRoom(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy("new");
    setFormError("");
    const d = new FormData(e.currentTarget);
    try {
      let id: string;
      if (newTab === "join") {
        let code = String(d.get("code") || "").trim();
        try {
          code =
            new URLSearchParams(new URL(code).hash.slice(1)).get("invite") ||
            code;
        } catch {}
        id = (await request("/api/join", "POST", { code })).id;
      } else {
        const data = {
          name: String(d.get("name") || "").trim(),
          description: String(d.get("description") || ""),
          color: newColor,
        };
        if (data.name.length < 2) throw new Error("INVALID_INPUT");
        {
          id = (await request("/api/rooms", "POST", data)).id;
        }
      }
      await refresh();
      setSelected(id);
      setMobileChat(true);
      setView("chats");
      setModal(null);
      notify(t(newTab === "join" ? "joined" : "groupCreated"));
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setBusy(null);
    }
  }
  async function sendMessage(retry?: typeof failed) {
    const content = (retry?.text || text).trim(),
      id = retry?.id || crypto.randomUUID(),
      roomId = retry?.roomId || selected;
    if (!content || !roomId || busy === "send") return;
    setBusy("send");
    setFailed(null);
    try {
      {
        await request("/api/rooms/" + roomId + "/messages", "POST", {
          id,
          text: content,
        });
        await fetchMessages(roomId);
        await refresh();
      }
      setText("");
      setEmojiOpen(false);
      composerRef.current?.focus();
    } catch (e) {
      setFailed({ id, text: content, roomId });
      notify(errorText(e));
    } finally {
      setBusy(null);
    }
  }
  async function react(m: Message, emoji: string) {
    setReactionOpen(null);
    if (!selected) return;
    setBusy("reaction-" + m.id);
    try {
      {
        await request(
          "/api/rooms/" + selected + "/messages/" + m.id + "/reaction",
          "POST",
          { emoji },
        );
        await fetchMessages(selected);
      }
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(null);
    }
  }
  async function saveEvent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");
    const d = new FormData(e.currentTarget),
      roomId = String(d.get("roomId") || "");
    if (!roomId) {
      setFormError(t("requiredRoom"));
      return;
    }
    const date = String(d.get("date")),
      start = new Date(date + "T" + d.get("start")),
      end = new Date(date + "T" + d.get("end"));
    if (!eventTitle.trim() || isNaN(+start) || isNaN(+end) || end <= start) {
      setFormError(t("dateInvalid"));
      return;
    }
    const data = {
      title: eventTitle.trim(),
      description: String(d.get("description") || ""),
      location: String(d.get("location") || ""),
      color: eventColor,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
    };
    setBusy("event");
    try {
      {
        await request(
          "/api/rooms/" +
            roomId +
            "/events" +
            (editPlan ? "/" + editPlan.id : ""),
          editPlan ? "PUT" : "POST",
          data,
        );
        await refresh();
        await fetchMessages(roomId);
      }
      setModal(null);
      notify(t(editPlan ? "eventSaved" : "eventCreated"));
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setBusy(null);
    }
  }
  async function rsvp(plan: Plan, status: "yes" | "maybe" | "no") {
    setBusy("rsvp-" + plan.id);
    try {
      {
        await request(
          "/api/rooms/" + plan.roomId + "/events/" + plan.id + "/rsvp",
          "POST",
          { status },
        );
        await refresh();
      }
      notify(t("rsvpSaved"));
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(null);
    }
  }
  async function cancelEvent(plan: Plan) {
    if (!window.confirm(t("cancelConfirm"))) return;
    setBusy("cancel");
    try {
      {
        await request(
          "/api/rooms/" + plan.roomId + "/events/" + plan.id,
          "DELETE",
        );
        await refresh();
      }
      setModal(null);
      notify(t("eventRemoved"));
    } catch (e) {
      setFormError(errorText(e));
    } finally {
      setBusy(null);
    }
  }
  function exportEvent(plan: Plan) {
    const escape = (s: string) =>
      s
        .replace(/\\/g, "\\\\")
        .replace(/\n/g, "\\n")
        .replace(/,/g, "\\,")
        .replace(/;/g, "\\;");
    const stamp = (s: string) =>
      new Date(s)
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "");
    const content = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Peakboo//Calendar//EN",
      "BEGIN:VEVENT",
      `UID:${plan.id}@peakboo`,
      `DTSTAMP:${stamp(new Date().toISOString())}`,
      `DTSTART:${stamp(plan.startsAt)}`,
      `DTEND:${stamp(plan.endsAt)}`,
      `SUMMARY:${escape(plan.title)}`,
      `DESCRIPTION:${escape(plan.description)}`,
      `LOCATION:${escape(plan.location)}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/calendar;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "peakboo-event.ics";
    a.click();
    URL.revokeObjectURL(url);
  }
  async function invite() {
    openModal("invite");
  }
  async function copyInvite() {
    if (!room?.inviteCode) return;
    const url = API || location.origin;
    try {
      await navigator.clipboard.writeText(url + "/#invite=" + room.inviteCode);
      notify(t("copied"));
    } catch {
      setFormError(t("error"));
    }
  }
  async function showMembers() {
    openModal("members");
    if (!selected) return;
    setBusy("members");
    try {
      setMembers(
        (await request("/api/rooms/" + selected + "/members")).members,
      );
    } catch (e) {
      setFormError(errorText(e));
    } finally {
      setBusy(null);
    }
  }
  async function loadOlder() {
    if (!selected || !currentMessages.length) return;
    setBusy("older");
    try {
      const data = await request(
        "/api/rooms/" +
          selected +
          "/messages?before=" +
          encodeURIComponent(currentMessages[0].createdAt),
      );
      setMessages((m) => ({
        ...m,
        [selected]: [...data.messages, ...m[selected]],
      }));
      setHasMore((m) => ({ ...m, [selected]: data.hasMore }));
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(null);
    }
  }
  const detail =
    boot.events.find((e) => e.id === activeEvent?.id) || activeEvent;
  const openDetail = (p: Plan) => {
    setActiveEvent(p);
    openModal("detail");
  };
  function eventCard(p: Plan, compact = false) {
    const mine = p.rsvps.find((r) => r.userId === boot.user.id)?.status;
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
        <button className="event-title" onClick={() => openDetail(p)}>
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
                    color={COLORS[i]}
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
              onClick={() => rsvp(p, mine === "yes" ? "maybe" : "yes")}
            >
              {mine === "yes" ? <Check size={14} /> : <Plus size={14} />}{" "}
              {mine === "yes" ? t("going") : t("going")}
            </Button>
          )}
        </div>
      </div>
    );
  }
  function miniCalendar() {
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
              onClick={() => moveCalendar(-1)}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              className="icon-button tiny"
              aria-label={t("next")}
              onClick={() => moveCalendar(1)}
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
                  onClick={() => {
                    setChosenDay(d);
                    setCalendarDate(d);
                    setView("calendar");
                    setCalendarMode("agenda");
                    setMobileChat(false);
                  }}
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
  function moveCalendar(amount: number) {
    setChosenDay(null);
    setCalendarDate((d) => {
      const n = new Date(d);
      if (view === "calendar" && calendarMode === "week")
        n.setDate(n.getDate() + 7 * amount);
      else n.setMonth(n.getMonth() + amount, 1);
      return n;
    });
  }
  function calendarContent() {
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
        <div className="calendar-hero">
          <div>
            <span className="eyebrow">
              <span className="small-star">✦</span> {t("sharedCalendar")}
            </span>
            <h2>{t("calendarHeading")}</h2>
            <p>{t("calendarDescription")}</p>
          </div>
          <Button onClick={() => openEvent()}>
            <Plus size={17} />
            {t("newEvent")}
          </Button>
        </div>
        <div className="calendar-layout">
          <aside className="calendar-sidebar">
            {miniCalendar()}
            <div className="your-calendars">
              <h4>{t("yourCalendars")}</h4>
              {boot.rooms.map((r) => (
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
                  onClick={() => moveCalendar(-1)}
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label={t("next")}
                  onClick={() => moveCalendar(1)}
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
                hiddenCalendars.length === boot.rooms.length - 1
                  ? boot.rooms.find((r) => !hiddenCalendars.includes(r.id))
                      ?.id || ""
                  : ""
              }
              onChange={(e) =>
                setHiddenCalendars(
                  e.target.value
                    ? boot.rooms
                        .filter((r) => r.id !== e.target.value)
                        .map((r) => r.id)
                    : [],
                )
              }
            >
              <option value="">{t("allCalendars")}</option>
              {boot.rooms.map((r) => (
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
                        onClick={() => {
                          setChosenDay(d);
                          setEventDay(localDate(d));
                          setEditPlan(null);
                          setEventTitle("");
                          openModal("event");
                        }}
                      >
                        {d.getDate()}
                      </button>
                      {dayEvents.slice(0, 2).map((p) => (
                        <button
                          key={p.id}
                          className={cn("calendar-event", p.color)}
                          onClick={() => openDetail(p)}
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
                          onClick={() => openDetail(p)}
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
                        onClick={() => {
                          setChosenDay(d);
                          setEventDay(localDate(d));
                          setEditPlan(null);
                          setEventTitle("");
                          openModal("event");
                        }}
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
                      onClick={() => openDetail(p)}
                    >
                      <span className={cn("agenda-date", p.color)}>
                        <small>{fmt(p.startsAt, { month: "short" })}</small>
                        <strong>{new Date(p.startsAt).getDate()}</strong>
                      </span>
                      <span className="agenda-info">
                        <strong>{p.title}</strong>
                        <small>
                          {p.roomName ||
                            boot.rooms.find((r) => r.id === p.roomId)?.name}
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
                    <Button variant="outline" onClick={() => openEvent()}>
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
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          href="#"
          className="brand-link"
          onClick={(e) => {
            e.preventDefault();
            setView("chats");
            setMobileChat(false);
          }}
          aria-label="Peakboo"
        >
          <Logo />
        </a>
        <div className="workspace-label">{t("yourSpace")}</div>
        <nav aria-label={t("yourSpace")}>
          <button
            className={cn("nav-item", view === "chats" && "active")}
            onClick={() => {
              setView("chats");
              setMobileChat(false);
            }}
          >
            <MessageCircle size={20} />
            <span>{t("conversations")}</span>
            {boot.rooms.reduce((sum, r) => sum + r.unread, 0) > 0 && (
              <b>{boot.rooms.reduce((sum, r) => sum + r.unread, 0)}</b>
            )}
          </button>
          <button
            className={cn("nav-item", view === "calendar" && "active")}
            onClick={() => {
              setView("calendar");
              setChosenDay(null);
              setMobileChat(false);
            }}
          >
            <CalendarDays size={20} />
            <span>{t("calendar")}</span>
            <span className="nav-new">{upcoming.length}</span>
          </button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-note">
          <div className="note-art">
            <MessageCircle size={34} />
            <span className="sparkle one">✦</span>
            <span className="sparkle two">✧</span>
            <CalendarDays size={26} />
          </div>
          <strong>
            {lang === "pt"
              ? "Um oi pode virar um encontro."
              : "A hello can become a meetup."}
          </strong>
          <p>
            {lang === "pt"
              ? "As melhores coisas começam com uma conversa."
              : "The best things start with a conversation."}
          </p>
          <button
            onClick={() => {
              setNewTab("create");
              openModal("new");
            }}
          >
            {t("newConversation")}
            <Plus size={15} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => openModal("settings")}>
            <Settings size={19} />
            <span>{t("settings")}</span>
          </button>
          <div className="user-profile">
            <Avatar name={boot.user.name || "P"} color="purple" />
            <button onClick={() => openModal("settings")}>
              <strong>{boot.user.name || "Peakboo"}</strong>
              <span>{boot.user.email}</span>
            </button>
            <button
              className="icon-button"
              aria-label={t("theme")}
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <span className="breadcrumb">
            Peakboo <span>/</span>{" "}
            <strong>
              {t(view === "chats" ? "conversations" : "calendar")}
            </strong>
          </span>
          <div className="topbar-actions">
            <span className="top-date">
              <CalendarDays size={15} />
              {fmt(today, { day: "numeric", month: "long" })}
            </span>
            {
              <span className={cn("connection", !connected && "reconnecting")}>
                {connected ? <span /> : <WifiOff size={13} />}
                <span className="connection-text">
                  {t(connected ? "online" : "connecting")}
                </span>
              </span>
            }
            <button
              className="mobile-settings icon-button"
              aria-label={t("settings")}
              onClick={() => openModal("settings")}
            >
              <Settings size={20} />
            </button>
          </div>
        </header>
        {false}
        {view === "calendar" ? (
          calendarContent()
        ) : (
          <div className={cn("messenger", mobileChat && "show-mobile-chat")}>
            <section className="conversation-panel">
              <div className="conversation-title">
                <h1>
                  {t("conversations")}
                  <span className="title-dot">.</span>
                </h1>
                <button
                  className="icon-button new-chat"
                  aria-label={t("newConversation")}
                  onClick={() => {
                    setNewTab("create");
                    openModal("new");
                  }}
                >
                  <Plus size={20} />
                </button>
              </div>
              <label className="search-field">
                <Search size={17} />
                <input
                  aria-label={t("search")}
                  placeholder={t("search")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button
                    aria-label={t("clearSearch")}
                    className="icon-button tiny"
                    onClick={() => setQuery("")}
                  >
                    <X size={14} />
                  </button>
                )}
              </label>
              <div className="conversation-tabs">
                <button
                  className={filter === "all" ? "active" : ""}
                  onClick={() => setFilter("all")}
                >
                  {t("all")}
                  <span>{boot.rooms.length}</span>
                </button>
                <button
                  className={filter === "unread" ? "active" : ""}
                  onClick={() => setFilter("unread")}
                >
                  {t("unread")}
                </button>
              </div>
              <div className="conversation-list">
                {loading
                  ? Array.from({ length: 4 }, (_, i) => (
                      <div className="room-skeleton" key={i}>
                        <span className="skeleton skeleton-avatar" />
                        <div>
                          <span className="skeleton" />
                          <span className="skeleton" />
                        </div>
                      </div>
                    ))
                  : boot.rooms
                      .filter(
                        (r) =>
                          r.name
                            .toLocaleLowerCase()
                            .includes(query.toLocaleLowerCase()) &&
                          (filter !== "unread" || r.unread > 0),
                      )
                      .map((r) => (
                        <button
                          className={cn(
                            "conversation-item",
                            selected === r.id && "selected",
                          )}
                          key={r.id}
                          onClick={() => selectRoom(r)}
                        >
                          <span className="room-avatar-wrap">
                            <Avatar name={r.name} color={r.color} />
                            {r.id === "weekend" && false && (
                              <span className="avatar-decoration">✦</span>
                            )}
                          </span>
                          <span className="conversation-summary">
                            <span>
                              <strong>{r.name}</strong>
                              <small>{r.lastAt ? time(r.lastAt) : ""}</small>
                            </span>
                            <span>
                              <p>
                                {r.lastText ||
                                  r.description ||
                                  t("conversationStarted")}
                              </p>
                              {r.unread > 0 && <b>{r.unread}</b>}
                            </span>
                          </span>
                        </button>
                      ))}
                {!loading &&
                  !boot.rooms.filter(
                    (r) =>
                      r.name.toLowerCase().includes(query.toLowerCase()) &&
                      (filter !== "unread" || r.unread > 0),
                  ).length && (
                    <div className="empty-state small-empty">
                      <Inbox size={30} />
                      <h3>
                        {t(
                          query
                            ? "noResults"
                            : filter === "unread"
                              ? "noUnread"
                              : "noRooms",
                        )}
                      </h3>
                      <p>
                        {t(
                          query
                            ? "clearSearch"
                            : filter === "unread"
                              ? "noUnreadDesc"
                              : "noRoomsDesc",
                        )}
                      </p>
                      {!query && filter !== "unread" && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setNewTab("create");
                            openModal("new");
                          }}
                        >
                          <Plus size={15} />
                          {t("create")}
                        </Button>
                      )}
                    </div>
                  )}
              </div>
              <button
                className="join-shortcut"
                onClick={() => {
                  setNewTab("join");
                  openModal("new");
                }}
              >
                <Link size={16} />
                {t("join")}
                <ChevronRight size={15} />
              </button>
            </section>
            <section className="chat-panel">
              {room ? (
                <>
                  <div className="chat-header">
                    <button
                      className="icon-button mobile-back"
                      aria-label={t("back")}
                      onClick={() => setMobileChat(false)}
                    >
                      <ArrowLeft size={21} />
                    </button>
                    <Avatar name={room.name} color={room.color} />
                    <div className="chat-header-title">
                      <h2>{room.name}</h2>
                      <button onClick={showMembers}>
                        <Users size={12} />
                        {room.memberCount}{" "}
                        {t(room.memberCount === 1 ? "member" : "members")}
                        <span>·</span>
                        {t("sharedCalendar")}
                      </button>
                    </div>
                    <div className="chat-header-actions">
                      <button
                        className="icon-button"
                        aria-label={t("searchMessages")}
                        onClick={() => {
                          setShowChatSearch(!showChatSearch);
                          setChatQuery("");
                        }}
                      >
                        <Search size={19} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={t("invite")}
                        onClick={invite}
                      >
                        <Users size={19} />
                      </button>
                      <button
                        className="icon-button highlight"
                        aria-label={t("createEvent")}
                        onClick={() => openEvent()}
                      >
                        <CalendarPlus size={20} />
                      </button>
                    </div>
                  </div>
                  {showChatSearch && (
                    <div className="chat-search">
                      <Search size={16} />
                      <input
                        autoFocus
                        value={chatQuery}
                        onChange={(e) => setChatQuery(e.target.value)}
                        placeholder={t("searchMessages")}
                        aria-label={t("searchMessages")}
                      />
                    </div>
                  )}
                  <div className="chat-context">
                    <span className="context-icon">
                      <CalendarDays size={15} />
                    </span>
                    <span>
                      {lang === "pt"
                        ? "Bons planos merecem sair da conversa."
                        : "Good plans deserve more than a message."}
                    </span>
                    <button onClick={() => openEvent()}>
                      {t("newEvent")}
                      <Plus size={13} />
                    </button>
                  </div>
                  <div
                    className="chat-history"
                    role="log"
                    aria-label={t("conversations")}
                    aria-live="polite"
                  >
                    {hasMore[room.id] && (
                      <Button
                        variant="ghost"
                        className="older-button"
                        busy={busy === "older"}
                        onClick={loadOlder}
                      >
                        {t("loadOlder")}
                      </Button>
                    )}
                    <div className="day-separator">
                      <span>
                        {currentMessages.length &&
                        !sameDay(new Date(currentMessages[0].createdAt), today)
                          ? fmt(currentMessages[0].createdAt, {
                              dateStyle: "medium",
                            })
                          : t("today")}
                      </span>
                    </div>
                    {loadingMessages ? (
                      <div className="message-skeletons">
                        <span className="skeleton" />
                        <span className="skeleton" />
                        <span className="skeleton" />
                      </div>
                    ) : (
                      currentMessages
                        .filter(
                          (m) =>
                            !chatQuery ||
                            m.text
                              .toLowerCase()
                              .includes(chatQuery.toLowerCase()) ||
                            boot.events
                              .find((e) => e.id === m.eventId)
                              ?.title.toLowerCase()
                              .includes(chatQuery.toLowerCase()),
                        )
                        .map((m, i, arr) => {
                          const own = m.senderId === boot.user.id,
                            p = m.eventId
                              ? boot.events.find((x) => x.id === m.eventId)
                              : null,
                            grouped =
                              i > 0 &&
                              arr[i - 1].senderId === m.senderId &&
                              !arr[i - 1].eventId &&
                              !p;
                          return (
                            <div
                              className={cn(
                                "message",
                                own && "own",
                                p && "event-message",
                                grouped && "grouped",
                              )}
                              key={m.id}
                            >
                              {!own && !grouped ? (
                                <Avatar
                                  name={m.senderName}
                                  color={
                                    COLORS[
                                      (m.senderName.charCodeAt(0) || 0) % 5
                                    ]
                                  }
                                  small
                                />
                              ) : (
                                <span className="message-avatar-spacer" />
                              )}
                              <div className="message-body">
                                {!own && !grouped && (
                                  <span className="sender-name">
                                    {m.senderName}
                                  </span>
                                )}
                                {p ? (
                                  eventCard(p)
                                ) : (
                                  <div className="message-bubble">{m.text}</div>
                                )}
                                <div className="message-footer">
                                  {m.reactions.length > 0 && (
                                    <span className="reactions">
                                      {[
                                        ...new Set(
                                          m.reactions.map((r) => r.emoji),
                                        ),
                                      ].map((emoji) => (
                                        <button
                                          aria-label={t("react") + " " + emoji}
                                          key={emoji}
                                          className={
                                            m.reactions.some(
                                              (r) =>
                                                r.userId === boot.user.id &&
                                                r.emoji === emoji,
                                            )
                                              ? "mine"
                                              : ""
                                          }
                                          disabled={busy === "reaction-" + m.id}
                                          onClick={() => react(m, emoji)}
                                        >
                                          {emoji}
                                          <small>
                                            {
                                              m.reactions.filter(
                                                (r) => r.emoji === emoji,
                                              ).length
                                            }
                                          </small>
                                        </button>
                                      ))}
                                    </span>
                                  )}
                                  <time dateTime={m.createdAt}>
                                    {time(m.createdAt)}
                                  </time>
                                  {own && (
                                    <Check size={12} aria-label={t("send")} />
                                  )}
                                </div>
                              </div>
                              <div className="message-actions">
                                <button
                                  className="icon-button tiny"
                                  aria-label={t("react")}
                                  onClick={() =>
                                    setReactionOpen(
                                      reactionOpen === m.id ? null : m.id,
                                    )
                                  }
                                >
                                  <Smile size={15} />
                                </button>
                                {!p && (
                                  <button
                                    className="icon-button tiny"
                                    aria-label={t("eventFromMessage")}
                                    onClick={() =>
                                      openEvent(m.text.slice(0, 120))
                                    }
                                  >
                                    <CalendarPlus size={15} />
                                  </button>
                                )}
                                {reactionOpen === m.id && (
                                  <div className="emoji-menu">
                                    {EMOJIS.map((emoji) => (
                                      <button
                                        key={emoji}
                                        aria-label={emoji}
                                        onClick={() => react(m, emoji)}
                                      >
                                        {emoji}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                    )}
                    {!loadingMessages && !currentMessages.length && (
                      <div className="empty-state">
                        <MessageCircle size={32} />
                        <h3>{t("conversationStarted")}</h3>
                        <p>{t("conversationStartedDesc")}</p>
                      </div>
                    )}
                    {chatQuery &&
                      currentMessages.length > 0 &&
                      !currentMessages.some((m) =>
                        m.text.toLowerCase().includes(chatQuery.toLowerCase()),
                      ) && <p className="no-search-result">{t("noResults")}</p>}
                    <div ref={bottomRef} />
                  </div>
                  {failed && (
                    <div className="send-error" role="alert">
                      {t("failedSend")}
                      <button onClick={() => sendMessage(failed)}>
                        {t("retry")}
                      </button>
                    </div>
                  )}
                  <form
                    className="composer-wrapper"
                    onSubmit={(e) => {
                      e.preventDefault();
                      sendMessage();
                    }}
                  >
                    <div className="composer">
                      <textarea
                        ref={composerRef}
                        rows={1}
                        value={text}
                        maxLength={4000}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            !e.shiftKey &&
                            !e.nativeEvent.isComposing
                          ) {
                            e.preventDefault();
                            sendMessage();
                          }
                        }}
                        placeholder={t("messagePlaceholder")}
                        aria-label={t("messagePlaceholder")}
                      />
                      <div className="composer-actions">
                        <div className="emoji-wrapper">
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={t("emoji")}
                            onClick={() => setEmojiOpen(!emojiOpen)}
                          >
                            <Smile size={20} />
                          </button>
                          {emojiOpen && (
                            <div className="emoji-menu composer-emoji">
                              {[
                                "😊",
                                "💜",
                                "☕",
                                "✨",
                                "😂",
                                "🎉",
                                "👍",
                                "🔥",
                                "🙌",
                                "❤️",
                              ].map((emoji) => (
                                <button
                                  type="button"
                                  key={emoji}
                                  aria-label={emoji}
                                  onClick={() => {
                                    setText((s) => s + emoji);
                                    setEmojiOpen(false);
                                    composerRef.current?.focus();
                                  }}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          className="icon-button composer-calendar"
                          aria-label={t("createEvent")}
                          onClick={() => openEvent()}
                        >
                          <CalendarPlus size={20} />
                        </button>
                        <Button
                          className="send-button"
                          type="submit"
                          aria-label={t("send")}
                          disabled={!text.trim()}
                          busy={busy === "send"}
                        >
                          {busy !== "send" && <ArrowUp size={20} />}
                        </Button>
                      </div>
                    </div>
                    <span className="composer-hint">
                      {t("enterSend")}
                      <span>✦ peakboo</span>
                    </span>
                  </form>
                </>
              ) : (
                <div className="empty-state chat-empty">
                  <Logo compact />
                  <h2>{t("connectTitle")}</h2>
                  <p>{t("connectDesc")}</p>
                  <Button
                    onClick={() => {
                      setNewTab("create");
                      openModal("new");
                    }}
                  >
                    <Plus size={17} />
                    {t("newConversation")}
                  </Button>
                </div>
              )}
            </section>
            <aside className="plans-panel">
              <div className="plans-heading">
                <span className="calendar-badge">
                  <CalendarDays size={19} />
                </span>
                <div>
                  <h3>{t("sharedCalendar")}</h3>
                  <small>
                    {lang === "pt"
                      ? "Tempo bom é tempo junto."
                      : "Good times are shared times."}
                  </small>
                </div>
              </div>
              {miniCalendar()}
              <div className="upcoming-title">
                <h4>{t("upNext")}</h4>
                <span>{upcoming.length}</span>
              </div>
              <div className="upcoming-list">
                {upcoming.slice(0, 3).map((p) => (
                  <button
                    className="upcoming-item"
                    key={p.id}
                    onClick={() => openDetail(p)}
                  >
                    <span className={cn("upcoming-icon", p.color)}>
                      {p.color === "coral"
                        ? "☕"
                        : p.color === "green"
                          ? "🌿"
                          : p.color === "yellow"
                            ? "☀"
                            : "✦"}
                    </span>
                    <span>
                      <strong>{p.title}</strong>
                      <small>
                        {fmt(p.startsAt, { day: "numeric", month: "short" })} ·{" "}
                        {time(p.startsAt)}
                      </small>
                      <span className="upcoming-room">
                        <i className={p.color} />
                        {p.roomName ||
                          boot.rooms.find((r) => r.id === p.roomId)?.name}
                      </span>
                    </span>
                  </button>
                ))}
                {!upcoming.length && (
                  <div className="empty-state small-empty">
                    <CalendarDays size={26} />
                    <p>{t("noEventsDesc")}</p>
                  </div>
                )}
              </div>
              <Button
                variant="outline"
                className="full-width calendar-link"
                onClick={() => {
                  setChosenDay(null);
                  setView("calendar");
                  setMobileChat(false);
                }}
              >
                {t("seeCalendar")}
                <LayoutGrid size={15} />
              </Button>
              <div className="little-note">
                <Heart size={15} />
                <p>
                  {lang === "pt"
                    ? "O melhor lembrete é ter com quem compartilhar."
                    : "The best reminder is having someone to share it with."}
                </p>
              </div>
            </aside>
          </div>
        )}
      </main>
      <nav className="mobile-nav" aria-label={t("yourSpace")}>
        <button
          className={view === "chats" ? "active" : ""}
          onClick={() => {
            setView("chats");
            setMobileChat(false);
          }}
        >
          <MessageCircle size={21} />
          {t("conversations")}
        </button>
        <button
          className={view === "calendar" ? "active" : ""}
          onClick={() => {
            setView("calendar");
            setChosenDay(null);
            setMobileChat(false);
          }}
        >
          <CalendarDays size={21} />
          {t("calendar")}
        </button>
        <button onClick={() => openModal("settings")}>
          <Settings size={21} />
          {t("settings")}
        </button>
      </nav>

      <Modal
        open={modal === "new"}
        onOpenChange={(v) => !v && setModal(null)}
        title={t("newConversation")}
        closeLabel={t("close")}
      >
        <Tabs.Root value={newTab} onValueChange={setNewTab}>
          <Tabs.List className="dialog-tabs">
            <Tabs.Trigger value="create">{t("create")}</Tabs.Trigger>
            <Tabs.Trigger value="join">{t("join")}</Tabs.Trigger>
          </Tabs.List>
          <form onSubmit={createRoom} className="form">
            <Tabs.Content value="create">
              <label>
                {t("groupName")}
                <input
                  name="name"
                  placeholder={t("groupPlaceholder")}
                  minLength={2}
                  maxLength={80}
                  required={newTab === "create"}
                />
              </label>
              <label>
                {t("description")}{" "}
                <span className="muted">({t("optional")})</span>
                <textarea name="description" maxLength={240} rows={2} />
              </label>
              <fieldset>
                <legend>{t("color")}</legend>
                <div className="color-options">
                  {COLORS.map((color) => (
                    <button
                      type="button"
                      key={color}
                      aria-label={color}
                      aria-pressed={newColor === color}
                      className={cn("color-dot", color)}
                      onClick={() => setNewColor(color)}
                    >
                      {newColor === color && <Check size={16} />}
                    </button>
                  ))}
                </div>
              </fieldset>
            </Tabs.Content>
            <Tabs.Content value="join">
              <label>
                {t("inviteCode")}
                <input
                  name="code"
                  placeholder="https://…/#invite=…"
                  required={newTab === "join"}
                />
              </label>
            </Tabs.Content>
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            <div className="form-footer">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModal(null)}
              >
                {t("cancel")}
              </Button>
              <Button busy={busy === "new"}>
                {newTab === "create" ? t("create") : t("joinGroup")}
              </Button>
            </div>
          </form>
        </Tabs.Root>
      </Modal>

      <Modal
        open={modal === "event"}
        onOpenChange={(v) => !v && setModal(null)}
        title={t(editPlan ? "editEvent" : "newEvent")}
        description={t("sharedCalendar")}
        closeLabel={t("close")}
      >
        <form className="form" onSubmit={saveEvent} key={editPlan?.id || "new"}>
          <label>
            {t("title")}
            <input
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
              placeholder={t("titlePlaceholder")}
              minLength={2}
              maxLength={120}
              required
            />
          </label>
          <label>
            {t("with")}
            <select
              name="roomId"
              defaultValue={editPlan?.roomId || selected || ""}
              disabled={!!editPlan}
              required
            >
              {!selected && <option value="">{t("selectRoom")}</option>}
              {boot.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            {editPlan && (
              <input type="hidden" name="roomId" value={editPlan.roomId} />
            )}
          </label>
          <div className="form-row">
            <label>
              {t("date")}
              <input
                type="date"
                name="date"
                value={eventDay}
                onChange={(e) => setEventDay(e.target.value)}
                required
              />
            </label>
            <label>
              {t("start")}
              <input
                type="time"
                name="start"
                defaultValue={
                  editPlan ? localTime(new Date(editPlan.startsAt)) : "16:00"
                }
                required
              />
            </label>
            <label>
              {t("end")}
              <input
                type="time"
                name="end"
                defaultValue={
                  editPlan ? localTime(new Date(editPlan.endsAt)) : "18:00"
                }
                required
              />
            </label>
          </div>
          <label>
            {t("where")} <span className="muted">({t("optional")})</span>
            <input
              name="location"
              defaultValue={editPlan?.location || ""}
              placeholder={t("locationPlaceholder")}
              maxLength={180}
            />
          </label>
          <label>
            {t("description")} <span className="muted">({t("optional")})</span>
            <textarea
              name="description"
              defaultValue={editPlan?.description || ""}
              rows={2}
              maxLength={1000}
            />
          </label>
          <fieldset>
            <legend>{t("color")}</legend>
            <div className="color-options">
              {COLORS.map((color) => (
                <button
                  type="button"
                  key={color}
                  aria-label={color}
                  aria-pressed={eventColor === color}
                  className={cn("color-dot", color)}
                  onClick={() => setEventColor(color)}
                >
                  {eventColor === color && <Check size={16} />}
                </button>
              ))}
            </div>
          </fieldset>
          <p className="field-hint">
            <Globe size={12} />
            {t("timeZone")}
          </p>
          {formError && (
            <p role="alert" className="form-error">
              {formError}
            </p>
          )}
          <div className="form-footer">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModal(null)}
            >
              {t("cancel")}
            </Button>
            <Button busy={busy === "event"}>
              <CalendarPlus size={16} />
              {t(editPlan ? "save" : "createEvent")}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={modal === "detail"}
        onOpenChange={(v) => !v && setModal(null)}
        title={t("eventDetails")}
        closeLabel={t("close")}
      >
        {detail && (
          <div className="event-details">
            {eventCard(detail)}
            {detail.description && (
              <p className="detail-description">{detail.description}</p>
            )}
            <div className="detail-room">
              <Users size={16} />
              {detail.roomName ||
                boot.rooms.find((r) => r.id === detail.roomId)?.name}
            </div>
            {!detail.cancelled && (
              <>
                <h4>{t("confirmLabel")}</h4>
                <div className="rsvp-options">
                  {(["yes", "maybe", "no"] as const).map((status, i) => (
                    <Button
                      key={status}
                      variant={
                        detail.rsvps.find((r) => r.userId === boot.user.id)
                          ?.status === status
                          ? "default"
                          : "outline"
                      }
                      disabled={busy === "rsvp-" + detail.id}
                      onClick={() => rsvp(detail, status)}
                    >
                      {t(["going", "maybe", "notGoing"][i])}
                    </Button>
                  ))}
                </div>
              </>
            )}
            <div className="member-list">
              {detail.rsvps.map((r) => (
                <div key={r.userId}>
                  <Avatar name={r.name} small />
                  <span>{r.name}</span>
                  <span className={cn("rsvp-status", r.status)}>
                    {t(
                      r.status === "yes"
                        ? "going"
                        : r.status === "maybe"
                          ? "maybe"
                          : "notGoing",
                    )}
                  </span>
                </div>
              ))}
            </div>
            <div className="detail-actions">
              <Button variant="outline" onClick={() => exportEvent(detail)}>
                <Download size={16} />
                {t("exportCalendar")}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  const r = boot.rooms.find((x) => x.id === detail.roomId);
                  if (r) selectRoom(r);
                  setModal(null);
                }}
              >
                <MessageCircle size={16} />
                {t("goToConversation")}
              </Button>
            </div>
            {detail.creatorId === boot.user.id && !detail.cancelled && (
              <div className="owner-actions">
                <Button
                  variant="ghost"
                  onClick={() => openEvent(undefined, detail)}
                >
                  <Pencil size={15} />
                  {t("editEvent")}
                </Button>
                <Button
                  variant="ghost"
                  className="text-danger"
                  busy={busy === "cancel"}
                  onClick={() => cancelEvent(detail)}
                >
                  <Trash2 size={15} />
                  {t("cancelEvent")}
                </Button>
              </div>
            )}
            {formError && (
              <p role="alert" className="form-error">
                {formError}
              </p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={modal === "invite"}
        onOpenChange={(v) => !v && setModal(null)}
        title={t("invited")}
        description={t("inviteDescription")}
        closeLabel={t("close")}
      >
        <div className="invite-preview">
          <Avatar name={room?.name || ""} color={room?.color} />
          <h3>{room?.name}</h3>
          <p>
            {room?.memberCount} {t("members")}
          </p>
        </div>
        <div className="invite-code">
          <Link size={17} />
          <input
            readOnly
            aria-label={t("inviteCode")}
            value={(API || location.origin) + "/#invite=" + room?.inviteCode}
          />
        </div>
        <Button className="full-width" onClick={copyInvite}>
          <Copy size={16} />
          {t("copyInvite")}
        </Button>
        {formError && (
          <p role="alert" className="form-error">
            {formError}
          </p>
        )}
      </Modal>

      <Modal
        open={modal === "members"}
        onOpenChange={(v) => !v && setModal(null)}
        title={t("memberTitle")}
        description={room?.name}
        closeLabel={t("close")}
      >
        <div className="member-list">
          {busy === "members" ? (
            <LoaderCircle className="spin" />
          ) : (
            members.map((m, i) => (
              <div key={m.id}>
                <Avatar name={m.name} color={COLORS[i % 5]} />
                <span>
                  {m.name}
                  {m.id === boot.user.id && <small> · {t("me")}</small>}
                </span>
              </div>
            ))
          )}
        </div>
        <Button className="full-width" variant="outline" onClick={invite}>
          <Plus size={16} />
          {t("invite")}
        </Button>
        {formError && (
          <p role="alert" className="form-error">
            {formError}
          </p>
        )}
      </Modal>

      <Modal
        open={modal === "auth" || !getToken()}
        onOpenChange={(v) => !v && setModal(null)}
        title={t(authMode === "signup" ? "signupTitle" : "welcome")}
        description={pendingInvite ? t("joinAfterAuth") : t("authDesc")}
        closeLabel={t("close")}
        className={!getToken() ? "auth-modal auth-required" : "auth-modal"}
      >
        <div className="auth-brand">
          <Logo />
        </div>
        <div className="segmented auth-tabs">
          <button
            onClick={() => {
              setAuthMode("signup");
              setFormError("");
            }}
            className={authMode === "signup" ? "active" : ""}
          >
            {t("signUp")}
          </button>
          <button
            onClick={() => {
              setAuthMode("login");
              setFormError("");
            }}
            className={authMode === "login" ? "active" : ""}
          >
            {t("signIn")}
          </button>
        </div>
        {
          <form className="form" onSubmit={authenticate}>
            {authMode === "signup" && (
              <label>
                {t("yourName")}
                <input
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={80}
                />
              </label>
            )}
            <label>
              {t("email")}
              <input type="email" name="email" autoComplete="email" required />
            </label>
            <label>
              {t("password")}
              <div className="password-input">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    authMode === "signup" ? "new-password" : "current-password"
                  }
                  required
                  minLength={8}
                  maxLength={128}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t(showPassword ? "hidePassword" : "showPassword")}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              <small className="field-hint">{t("passwordHelp")}</small>
            </label>
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            <Button className="full-width" busy={busy === "auth"}>
              {t(authMode === "signup" ? "signUp" : "signIn")}
            </Button>
          </form>
        }
      </Modal>

      <Modal
        open={modal === "settings"}
        onOpenChange={(v) => !v && setModal(null)}
        title={t("settings")}
        closeLabel={t("close")}
      >
        <Tabs.Root defaultValue="appearance">
          <Tabs.List className="dialog-tabs">
            {["profile", "security", "appearance"].map((tab) => (
              <Tabs.Trigger key={tab} value={tab}>
                {t(tab)}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <Tabs.Content forceMount value="appearance" className="settings-tab">
            <label>{t("theme")}</label>
            <div className="theme-options">
              <button
                className={cn(theme === "light" && "selected")}
                onClick={() => setTheme("light")}
              >
                <span className="theme-preview light-preview">
                  <i />
                  <i />
                  <i />
                </span>
                <Sun size={16} />
                {t("light")}
                {theme === "light" && <Check size={15} />}
              </button>
              <button
                className={cn(theme === "dark" && "selected")}
                onClick={() => setTheme("dark")}
              >
                <span className="theme-preview dark-preview">
                  <i />
                  <i />
                  <i />
                </span>
                <Moon size={16} />
                {t("dark")}
                {theme === "dark" && <Check size={15} />}
              </button>
            </div>
            <label className="language-label">
              {t("language")}
              <select value={lang} onChange={(e) => setLang(e.target.value)}>
                <option value="pt">Português (Brasil)</option>
                <option value="en">English</option>
              </select>
            </label>
            <div className="about-app">
              <Logo />
              <p>{t("aboutText")}</p>
              <small>v0.1 · MIT · Gabriel Duclos</small>
            </div>
          </Tabs.Content>
          <Tabs.Content forceMount value="profile" className="settings-tab">
            <div className="settings-profile">
              <Avatar name={boot.user.name} />
              <strong>{boot.user.name}</strong>
              <span>{boot.user.email}</span>
            </div>
            {
              <>
                <form
                  className="form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy("profile");
                    setFormError("");
                    try {
                      await request("/api/auth/update-user", "POST", {
                        name: new FormData(e.currentTarget).get("name"),
                      });
                      await refresh();
                      notify(t("profileSaved"));
                    } catch (err) {
                      setFormError(errorText(err));
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  <label>
                    {t("editName")}
                    <input
                      defaultValue={boot.user.name}
                      name="name"
                      minLength={2}
                      maxLength={80}
                      required
                    />
                  </label>
                  <Button busy={busy === "profile"}>{t("save")}</Button>
                </form>
                <Button
                  variant="ghost"
                  className="signout-button"
                  busy={busy === "signout"}
                  onClick={signOut}
                >
                  <LogOut size={16} />
                  {t("signOut")}
                </Button>
              </>
            }
          </Tabs.Content>
          <Tabs.Content forceMount value="security" className="settings-tab">
            {
              <form
                className="form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget,
                    d = new FormData(form);
                  setBusy("password");
                  setFormError("");
                  try {
                    await request("/api/auth/change-password", "POST", {
                      currentPassword: d.get("currentPassword"),
                      newPassword: d.get("newPassword"),
                      revokeOtherSessions: true,
                    });
                    form.reset();
                    notify(t("passwordChanged"));
                  } catch (err) {
                    setFormError(errorText(err));
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {["currentPassword", "newPassword"].map((key) => (
                  <label key={key}>
                    {t(key)}
                    <div className="password-input">
                      <input
                        name={key}
                        type={showPassword ? "text" : "password"}
                        required
                        minLength={8}
                        autoComplete={
                          key === "newPassword"
                            ? "new-password"
                            : "current-password"
                        }
                      />
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={t(
                          showPassword ? "hidePassword" : "showPassword",
                        )}
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff size={17} />
                        ) : (
                          <Eye size={17} />
                        )}
                      </button>
                    </div>
                  </label>
                ))}
                <span className="field-hint">{t("passwordHelp")}</span>
                <Button busy={busy === "password"}>
                  {t("changePassword")}
                </Button>
              </form>
            }
          </Tabs.Content>
        </Tabs.Root>
        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}
      </Modal>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button
            className="icon-button tiny"
            aria-label={t("close")}
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
