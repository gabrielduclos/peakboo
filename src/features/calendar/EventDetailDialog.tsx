import {Users,Download,MessageCircle,Pencil,Trash2} from "lucide-react";
import {Avatar,Button,Modal,cn} from "../../components";
import {displayName} from "../../../shared/display-name.mjs";
import type {Plan,Room} from "../../types";
import type {ReactNode} from "react";
type Props={open:boolean;onClose:()=>void;t:(key:string)=>string;detail?:Plan|null;rooms:Room[];userId:string;busy:string|null;formError:string;eventCard:(p:Plan)=>ReactNode;rsvp:(p:Plan,s:"yes"|"maybe"|"no")=>void;exportEvent:(p:Plan)=>void;selectRoom:(r:Room)=>void;onEdit:(p:Plan)=>void;cancelEvent:(p:Plan)=>void};
export function EventDetailDialog({open,onClose,t,detail,rooms,userId,busy,formError,eventCard,rsvp,exportEvent,selectRoom,onEdit,cancelEvent}:Props){
 return (
      <Modal
        open={open}
        onOpenChange={(v) => !v && onClose()}
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
                rooms.find((r) => r.id === detail.roomId)?.name}
            </div>
            {!detail.cancelled && (
              <>
                <h4>{t("confirmLabel")}</h4>
                <div className="rsvp-options">
                  {(["yes", "maybe", "no"] as const).map((status, i) => (
                    <Button
                      key={status}
                      variant={
                        detail.rsvps.find((r) => r.userId === userId)
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
                  <Avatar name={displayName(r.name)} small />
                  <span>{displayName(r.name)}</span>
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
                  const r = rooms.find((x) => x.id === detail.roomId);
                  if (r) selectRoom(r);
                  onClose();
                }}
              >
                <MessageCircle size={16} />
                {t("goToConversation")}
              </Button>
            </div>
            {detail.creatorId === userId && !detail.cancelled && (
              <div className="owner-actions">
                <Button
                  variant="ghost"
                  onClick={() => onEdit(detail)}
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
 );
}
