export const API =
  (import.meta as unknown as { env: { VITE_API_URL?: string } }).env
    .VITE_API_URL ||
  (["peakboo-agenda.gabriel-axel.chatgpt.site", "main.peakboo.workers.dev"].includes(location.hostname)
    ? "https://peakboo-api.onrender.com"
    : "");
export const PREVIEW_ONLY =
  (import.meta as unknown as { env: { VITE_PREVIEW_ONLY?: string } }).env
    .VITE_PREVIEW_ONLY === "true";
export const getToken = () => sessionStorage.getItem("peakboo-session");
const inFlight = new Map<string, Promise<any>>();
export function request(path: string, method = "GET", data?: unknown) {
  if (method !== "GET") return performRequest(path, method, data);
  const key = `${getToken() || "anonymous"}:${path}`;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const pending = performRequest(path, method, data).finally(() =>
    inFlight.delete(key),
  );
  inFlight.set(key, pending);
  return pending;
}
async function performRequest(path: string, method: string, data?: unknown) {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(API + path, {
      method,
      headers: {
        ...(data ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
  } catch {
    throw new Error("NETWORK_ERROR");
  }
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(result.error || result.code || "SERVER_ERROR");
  if (method === "GET" && token !== getToken()) throw new Error("UNAUTHORIZED");
  const authToken = res.headers.get("set-auth-token");
  if (authToken) sessionStorage.setItem("peakboo-session", authToken);
  return result;
}
import type {LiveChange} from "./realtime";
export async function watchChanges(
  signal: AbortSignal,
  onChange: (event?: LiveChange) => void,
  onStatus: (connected: boolean) => void,
) {
  const controller=new AbortController();
  const abort=()=>controller.abort();signal.addEventListener("abort",abort,{once:true});if(signal.aborted)abort();
  let watchdog:ReturnType<typeof setTimeout>|undefined;
  const renew=()=>{clearTimeout(watchdog);watchdog=setTimeout(abort,70000)};
  renew();
  try{
    const res=await fetch(API+"/api/live",{headers:{Authorization:"Bearer "+getToken()},signal:controller.signal,cache:"no-store"});
    if(!res.ok||!res.body)throw Error("STREAM_FAILED");
    onStatus(true);
    const reader=res.body.getReader(),decoder=new TextDecoder();let buffer="";
    try{while(!controller.signal.aborted){
      const {value,done}=await reader.read();if(done)break;renew();buffer+=decoder.decode(value,{stream:true});
      if(buffer.length>262144)throw Error("STREAM_INVALID");
      let split;while((split=buffer.indexOf("\n\n"))>=0){const block=buffer.slice(0,split);buffer=buffer.slice(split+2);if(block.startsWith("data: ")){try{const event=JSON.parse(block.slice(6));if(!event.connected)onChange(event)}catch{}}}
    }}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
  }finally{clearTimeout(watchdog);signal.removeEventListener("abort",abort);controller.abort();}

}
