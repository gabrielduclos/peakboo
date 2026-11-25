// Presentation only: stored legal/account names are never rewritten.
export function displayName(name){const parts=String(name??'').trim().split(/\s+/).filter(Boolean);return parts.length>1?parts[0]+' '+parts[parts.length-1]:(parts[0]||'');}
