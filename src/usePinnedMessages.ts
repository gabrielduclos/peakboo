import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { request } from './api';
import type { Message } from './types';

const PREFIX = 'peakboo-pins-v1:';
const FRESH = 60_000;
const RETAIN = 7 * 24 * 60 * 60_000;
type Entry = { at: number; messages: Message[] };
function key(user: string, room: string) { return PREFIX + encodeURIComponent(user) + ':' + encodeURIComponent(room); }
function read(user: string, room: string): Entry | null {
  if (!user || !room) return null;
  try {
    const entry = JSON.parse(localStorage.getItem(key(user, room)) || 'null');
    if (entry && Number.isFinite(entry.at) && Date.now() - entry.at < RETAIN && Array.isArray(entry.messages)) return entry;
  } catch {}
  return null;
}
function clear(user: string) {
  const prefix = PREFIX + encodeURIComponent(user) + ':';
  try { Object.keys(localStorage).filter(k => k.startsWith(prefix)).forEach(k => localStorage.removeItem(k)); } catch {}
}
function write(user: string, room: string, entry: Entry) {
  try {
    localStorage.setItem(key(user, room), JSON.stringify(entry));
    // Bound private message storage, including old conversations.
    const keys = Object.keys(localStorage).filter(k => k.startsWith(PREFIX));
    keys.sort((a, b) => JSON.parse(localStorage.getItem(b) || '{}').at - JSON.parse(localStorage.getItem(a) || '{}').at);
    keys.slice(50).forEach(k => localStorage.removeItem(k));
  } catch {} // Storage restrictions must never block the chat.
}

export function usePinnedMessages(user: string, room: string | null, revision: number) {
  const [result, setResult] = useState<{ user: string; room: string; entry: Entry } | null>(null);
  const previousUser = useRef(user);
  const previousRevision = useRef(revision);
  useLayoutEffect(() => {
    if (previousUser.current && previousUser.current !== user) clear(previousUser.current);
    previousUser.current = user;
  }, [user]);
  useEffect(() => {
    const force = previousRevision.current !== revision;
    previousRevision.current = revision;
    if (!user || !room) { setResult(null); return; }
    let active = true;
    const cached = read(user, room);
    if (cached) setResult({ user, room, entry: cached });
    if (!force && cached && Date.now() - cached.at < FRESH) return;
    request('/api/rooms/' + room + '/messages?kind=pinned').then(data => {
      if (!active) return;
      const entry = { at: Date.now(), messages: data.messages.filter((m: Message) => m.pinned && !m.deleted) };
      write(user, room, entry);
      setResult({ user, room, entry });
    }).catch(() => {});
    return () => { active = false; };
  }, [user, room, revision]);
  if (!user || !room) return [];
  return result?.user === user && result.room === room ? result.entry.messages : read(user, room)?.messages || [];
}
