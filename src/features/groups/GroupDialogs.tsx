import * as Tabs from "@radix-ui/react-tabs";
import {Check,Link,Copy,KeyRound,Trash2,LoaderCircle,Plus} from "lucide-react";
import {Avatar,Button,Modal,cn} from "../../components";
import {InvitationTools} from "../../InvitationTools";
import {inviteLink} from "../../links";
import {displayName} from "../../../shared/display-name.mjs";
import type {Color,Room} from "../../types";
import type {FormEvent} from "react";
type Common={open:boolean;onClose:()=>void;t:(key:string)=>string;busy:string|null;formError:string};
type Member={id:string;name:string;image?:string|null};
const COLORS:Color[]=["purple","coral","green","blue","yellow"];
export function NewGroupDialog({open,onClose,t,busy,formError,newTab,setNewTab,newColor,setNewColor,createRoom}:Common&{newTab:string;setNewTab:(s:string)=>void;newColor:Color;setNewColor:(c:Color)=>void;createRoom:(e:FormEvent<HTMLFormElement>)=>void}){
 return (
      <Modal
        open={open}
        onOpenChange={(v) => !v && onClose()}
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
                {t("inviteToken")}
                <input
                  name="code"
                  placeholder={t("tokenPlaceholder")}
                  autoCapitalize="none" autoComplete="off" spellCheck={false} maxLength={100}
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
                onClick={onClose}
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
 );
}
export function GroupInviteDialog({open,onClose,t,busy,formError,room,userId,lang,changePhoto,copyInvite,onDelete}:Common&{room?:Room|null;userId:string;lang:string;changePhoto:(f:File|undefined,roomPhoto:boolean)=>void;copyInvite:(token?:boolean)=>void;onDelete:(room:Room)=>void}){
 return (
      <Modal
        open={open}
        onOpenChange={(v) => !v && onClose()}
        title={t("invited")}
        description={t("inviteDescription")}
        closeLabel={t("close")}
      >
        <div className="invite-preview">
          <Avatar image={room?.image} name={room?.name || ""} color={room?.color} />{room&&room.ownerId===userId&&<label className="button outline photo-picker room-photo-picker">{lang==="pt"?"Foto do grupo":"Group photo"}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={busy==="photo"} onChange={e=>{void changePhoto(e.target.files?.[0],true);e.target.value=""}}/></label>}
          <h3>{room?.name}</h3>
          <p>
            {room?.memberCount} {t("members")}
          </p>
        </div>
        <div className="invite-code">
          <Link size={17} />
          <input
            readOnly
            aria-label={t("inviteLink")}
            value={room?.inviteCode?inviteLink(room.inviteCode):""}
          />
        </div>
        <Button className="full-width" onClick={()=>copyInvite()}>
          <Copy size={16} />
          {t("copyInvite")}
        </Button>
        <div className="invite-code invite-token"><KeyRound size={17}/><input readOnly aria-label={t("inviteToken")} value={room?.inviteCode||""}/></div>
        <Button className="full-width" variant="outline" onClick={()=>copyInvite(true)}><Copy size={16}/>{t("copyToken")}</Button>
        {open&&room?.inviteCode&&<InvitationTools url={inviteLink(room.inviteCode)} name={room.name} lang={lang}/>}
        {room&&room.ownerId===userId&&<Button variant="ghost" className="full-width text-danger delete-group-entry" onClick={()=>onDelete(room)}><Trash2 size={16}/>{t('deleteGroup')}</Button>}

        {formError && (
          <p role="alert" className="form-error">
            {formError}
          </p>
        )}
      </Modal>
 );
}
export function GroupMembersDialog({open,onClose,t,busy,formError,room,userId,members,openProfile,invite}:Common&{room?:Room|null;userId:string;members:Member[];openProfile:(m:Member)=>void;invite:()=>void}){
 return (
      <Modal
        open={open}
        onOpenChange={(v) => !v && onClose()}
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
                <Avatar image={m.image} name={displayName(m.name)} color={COLORS[i % 5]} />
                <button type="button" className="profile-name-link" onClick={()=>openProfile(m)}>
                  {displayName(m.name)}
                  {m.id === userId && <small> · {t("me")}</small>}
                </button>
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
 );
}
