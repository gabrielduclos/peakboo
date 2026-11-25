import {CalendarPlus,Check,Globe} from "lucide-react";
import {Button,Modal,cn} from "../../components";
import type {Color,Plan,Room} from "../../types";
import type {FormEvent} from "react";
type Props={open:boolean;onClose:()=>void;t:(key:string)=>string;editPlan:Plan|null;selected:string|null;rooms:Room[];eventTitle:string;setEventTitle:(v:string)=>void;eventDay:string;setEventDay:(v:string)=>void;eventColor:Color;setEventColor:(v:Color)=>void;formError:string;busy:string|null;saveEvent:(e:FormEvent<HTMLFormElement>)=>void};
const COLORS:Color[]=["purple","coral","green","blue","yellow"];
const localTime=(d:Date)=>`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
export function EventFormDialog({open,onClose,t,editPlan,selected,rooms,eventTitle,setEventTitle,eventDay,setEventDay,eventColor,setEventColor,formError,busy,saveEvent}:Props){
 return (
      <Modal
        open={open}
        onOpenChange={(v) => !v && onClose()}
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
              {rooms.map((r) => (
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
              onClick={onClose}
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
 );
}
