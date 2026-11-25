import type {FormEventHandler,ReactNode} from "react";
import * as Tabs from "@radix-ui/react-tabs";
import {Check,Eye,EyeOff,LogOut,Moon,Sun} from "lucide-react";
import {Button,Logo,Modal,cn} from "../../components";

type Translate=(key:string)=>string;
type PasswordProps={t:Translate;showPassword:boolean;setShowPassword:(value:boolean)=>void;busy:string|null;formError:string};
type AuthDialogProps=PasswordProps&{open:boolean;required?:boolean;preventAutoFocus?:boolean;onClose:()=>void;authMode:string;setAuthMode:(value:string)=>void;setFormError:(value:string)=>void;pendingInvite:boolean;authenticate:FormEventHandler<HTMLFormElement>;preview?:ReactNode};
export function AuthDialog({open,required=false,preventAutoFocus=false,onClose,authMode,setAuthMode,setFormError,pendingInvite,authenticate,preview,t,showPassword,setShowPassword,busy,formError}:AuthDialogProps){
 return <Modal open={open} onOpenChange={v=>!v&&onClose()} title={t(authMode==="signup"?"signupTitle":"welcome")} description={pendingInvite?t("joinAfterAuth"):t("authDesc")} closeLabel={t("close")} className={required?"auth-modal auth-required":"auth-modal"} preventAutoFocus={preventAutoFocus}>
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
        {preview??(
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
        )}
      </Modal>;
}
type SettingsDialogProps=PasswordProps&{open:boolean;onClose:()=>void;lang:string;setLang:(value:string)=>void;theme:string;setTheme:(value:string)=>void;profile:ReactNode;notifications?:ReactNode;demo?:boolean;signOut:()=>void;onChangePassword:FormEventHandler<HTMLFormElement>};
export function SettingsDialog({open,onClose,lang,setLang,theme,setTheme,profile,notifications,demo=false,signOut,onChangePassword,t,showPassword,setShowPassword,busy,formError}:SettingsDialogProps){
 return <Modal open={open} onOpenChange={v=>!v&&onClose()} title={t("settings")} closeLabel={t("close")}>
        <Tabs.Root defaultValue="appearance">
          <Tabs.List className="dialog-tabs">
            {["profile","security","appearance",...(notifications===undefined?[]:["notifications"])].map(tab=><Tabs.Trigger key={tab} value={tab}>{t(tab)}</Tabs.Trigger>)}
          </Tabs.List>
          {notifications!==undefined&&<Tabs.Content value="notifications" className="settings-tab">{notifications}</Tabs.Content>}
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
            {profile}
            <Button variant="ghost" className="signout-button" busy={busy==='signout'} onClick={signOut}><LogOut size={16}/>{t('signOut')}</Button>
          </Tabs.Content>
          <Tabs.Content forceMount value="security" className="settings-tab">
            {demo?<p className="muted">{t("demoOnly")}</p>:(
              <form
                className="form"
                onSubmit={onChangePassword}
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
            )}
          </Tabs.Content>
        </Tabs.Root>
        {formError&&<p className="form-error" role="alert">{formError}</p>}
      </Modal>;
}
