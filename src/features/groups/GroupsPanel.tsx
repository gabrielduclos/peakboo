import {Plus,Search,X,Inbox,Link,ChevronRight} from "lucide-react";
import {Avatar,Button,cn} from "../../components";
import type {Room} from "../../types";
import {roomPreview} from "../../roomPreview";

type GroupsPanelProps = {
  rooms: Room[];
  messageUnread: number;
  userId: string;
  lang: string;
  selected: string | null;
  loading: boolean;
  query: string;
  filter: string;
  t: (key: string) => string;
  time: (date: string) => string;
  onQueryChange: (query: string) => void;
  onFilterChange: (filter: string) => void;
  onSelect: (room: Room) => void;
  onCreate: () => void;
  onJoin: () => void;
  decorateWeekend?: boolean;
};

export function GroupsPanel({rooms,messageUnread,userId,lang,selected,loading,query,filter,t,time,onQueryChange,onFilterChange,onSelect,onCreate,onJoin,decorateWeekend=false}: GroupsPanelProps) {
  return (
    <section className="conversation-panel">
      <div className="conversation-title">
        <h1>
          {t("conversations")}
        </h1>
        <button
          className="icon-button new-chat"
          aria-label={t("newConversation")}
          onClick={() => {
            onCreate();
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
          onChange={(e) => onQueryChange(e.target.value)}
        />
        {query && (
          <button
            aria-label={t("clearSearch")}
            className="icon-button tiny"
            onClick={() => onQueryChange("")}
          >
            <X size={14} />
          </button>
        )}
      </label>
      <div className="conversation-tabs">
        <button
          className={filter === "all" ? "active" : ""}
          onClick={() => onFilterChange("all")}
        >
          {t("all")}
          {messageUnread > 0 && <span aria-label={String(messageUnread)}>{messageUnread > 99 ? "99+" : messageUnread}</span>}
        </button>
        <button
          className={filter === "unread" ? "active" : ""}
          onClick={() => onFilterChange("unread")}
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
          : rooms
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
                  onClick={() => onSelect(r)}
                >
                  <span className="room-avatar-wrap">
                    <Avatar image={r.image} name={r.name} color={r.color} />
                    {r.id === "weekend" && decorateWeekend && (
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
                        {roomPreview(r,userId,lang==="pt",t("conversationStarted"))}
                      </p>
                      {r.unread > 0 && <b>{r.unread}</b>}
                    </span>
                  </span>
                </button>
              ))}
        {!loading &&
          !rooms.filter(
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
                    onCreate();
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
          onJoin();
        }}
      >
        <Link size={16} />
        {t("join")}
        <ChevronRight size={15} />
      </button>
    </section>
  );
}
