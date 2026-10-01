"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  BRIA_DESKTOP_API_URL,
  briaCallActionRequest,
  briaDialRequest,
  briaStatusRequest,
  parseBriaFrame,
  type BriaCall,
} from "@/lib/bria-browser";
import Icon from "./Icon";

type Connection = "connecting" | "ready" | "signed-out" | "unavailable";
type BriaContextValue = {
  connection: Connection;
  calls: BriaCall[];
  message: string;
  dial: (phone: string) => boolean;
  answer: (id: string) => void;
  endCall: (id: string) => void;
  reconnect: () => void;
};

const BriaContext = createContext<BriaContextValue | null>(null);

export function useBriaControls() {
  return useContext(BriaContext);
}

export function BriaProvider({ children }: { children: ReactNode }) {
  const socket = useRef<WebSocket | null>(null);
  const transaction = useRef(0);
  const lastDial = useRef<{ phone: string; at: number } | null>(null);
  const authenticated = useRef(false);
  const hasSnapshot = useRef(false);
  const reconnectNow = useRef<() => void>(() => {});
  const [connection, setConnection] = useState<Connection>("connecting");
  const [calls, setCalls] = useState<BriaCall[]>([]);
  const [message, setMessage] = useState("");

  const sendStatus = useCallback((type: "call" | "authentication") => {
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(briaStatusRequest(type, ++transaction.current));
    }
  }, []);

  useEffect(() => {
    let active = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    let current: WebSocket | undefined;

    const connect = () => {
      if (!active) return;
      clearTimeout(retry);
      clearInterval(poll);
      current?.close();
      authenticated.current = false;
      hasSnapshot.current = false;
      setConnection("connecting");
      setCalls([]);
      let ws: WebSocket;
      try {
        ws = new WebSocket(BRIA_DESKTOP_API_URL);
      } catch {
        setConnection("unavailable");
        setMessage("Nettleseren kunne ikke koble til Bria på denne PC-en.");
        return;
      }
      current = ws;
      socket.current = ws;
      ws.onopen = () => {
        if (!active || socket.current !== ws) return;
        setMessage("");
        sendStatus("authentication");
        sendStatus("call");
        poll = setInterval(() => sendStatus("call"), 5000);
      };
      ws.onmessage = (event) => {
        if (!active || socket.current !== ws || typeof event.data !== "string") return;
        const result = parseBriaFrame(event.data);
        if (result.kind === "error") {
          setMessage(result.message);
        } else if (result.kind === "status-change") {
          if (result.type === "call" || result.type === "authentication") sendStatus(result.type);
        } else if (result.kind === "authentication") {
          authenticated.current = result.authenticated;
          setConnection(result.authenticated ? hasSnapshot.current ? "ready" : "connecting" : "signed-out");
          if (!result.authenticated) setCalls([]);
        } else if (result.kind === "calls") {
          hasSnapshot.current = true;
          setCalls(result.calls);
          if (authenticated.current) setConnection("ready");
        }
      };
      ws.onerror = () => {
        if (active && socket.current === ws) setMessage("Bria er utilgjengelig. Sjekk at Bria kjører og tillat lokal tilgang i nettleseren.");
      };
      ws.onclose = () => {
        if (!active || socket.current !== ws) return;
        clearInterval(poll);
        socket.current = null;
        authenticated.current = false;
        hasSnapshot.current = false;
        setCalls([]);
        setConnection("unavailable");
        retry = setTimeout(connect, 15000);
      };
    };

    reconnectNow.current = connect;
    connect();
    return () => {
      active = false;
      clearTimeout(retry);
      clearInterval(poll);
      current?.close();
      socket.current = null;
    };
  }, [sendStatus]);

  const dial = useCallback((phone: string) => {
    if (connection !== "ready" || socket.current?.readyState !== WebSocket.OPEN) return false;
    if (lastDial.current?.phone === phone && Date.now() - lastDial.current.at < 1500) return true;
    const request = briaDialRequest(phone, ++transaction.current);
    if (!request) return false;
    socket.current.send(request);
    lastDial.current = { phone, at: Date.now() };
    setMessage("Ringeforespørsel sendt til Bria.");
    return true;
  }, [connection]);

  const callAction = useCallback((action: "answer" | "endCall", id: string) => {
    if (connection !== "ready" || socket.current?.readyState !== WebSocket.OPEN || !calls.some((call) => call.id === id)) return;
    const request = briaCallActionRequest(action, id, ++transaction.current);
    if (!request) return;
    socket.current.send(request);
    setMessage(action === "answer" ? "Svar sendt til Bria." : "Legg på sendt til Bria.");
    setTimeout(() => sendStatus("call"), 800);
  }, [calls, connection, sendStatus]);

  const reconnect = useCallback(() => reconnectNow.current(), []);
  return (
    <BriaContext.Provider value={{ connection, calls, message, dial, answer: (id) => callAction("answer", id), endCall: (id) => callAction("endCall", id), reconnect }}>
      {children}
    </BriaContext.Provider>
  );
}

export function BriaControls() {
  const bria = useBriaControls();
  if (!bria) return null;
  return (
    <div className="flex max-w-full flex-wrap items-center justify-center gap-2 text-xs text-slate-600" aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${bria.connection === "ready" ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden="true" />
      <span>Bria: {bria.connection === "ready" ? "klar" : bria.connection === "connecting" ? "kobler til" : bria.connection === "signed-out" ? "ikke innlogget" : "ikke tilkoblet"}</span>
      {bria.connection === "unavailable" && <button type="button" onClick={bria.reconnect} className="font-semibold text-brand-700 underline">Prøv igjen</button>}
      {bria.calls.map((call) => (
        <div key={call.id} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1">
          <span className="max-w-32 truncate font-medium" title={call.number}>{call.number}</span>
          <span>{call.state === "ringing" ? "ringer inn" : call.state === "connecting" ? "ringer ut" : "i samtale"}</span>
          {call.state === "ringing" && (
            <button type="button" onClick={() => bria.answer(call.id)} className="rounded-md bg-emerald-600 px-2 py-1 font-semibold text-white">Svar</button>
          )}
          <button type="button" onClick={() => bria.endCall(call.id)} className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2 py-1 font-semibold text-white">
            <Icon name="phone-off" size={13} /> Legg på
          </button>
        </div>
      ))}
      {bria.message && <span role="status" className="max-w-64 truncate text-amber-800" title={bria.message}>{bria.message}</span>}
    </div>
  );
}
