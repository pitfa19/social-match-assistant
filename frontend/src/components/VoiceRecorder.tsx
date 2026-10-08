'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './VoiceRecorder.module.css';

type Status = 'idle' | 'requesting' | 'recording' | 'recorded' | 'denied' | 'unsupported' | 'error';

const MAX_SECONDS = 60;
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];

function pickMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
}

function isSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

export default function VoiceRecorder() {
  const [status, setStatus] = useState<Status>('idle');
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const urlRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const revokeUrl = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  // Detect support only after mount to avoid SSR/client hydration mismatch.
  useEffect(() => {
    if (!isSupported()) setStatus('unsupported');
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1; // invalidate pending permission requests
      clearTimer();
      const rec = recorderRef.current;
      if (rec) {
        rec.ondataavailable = null;
        rec.onstop = null;
        rec.onerror = null;
        if (rec.state !== 'inactive') {
          try {
            rec.stop();
          } catch {
            /* already stopped */
          }
        }
      }
      recorderRef.current = null;
      stopTracks();
      revokeUrl();
    };
  }, [clearTimer, stopTracks, revokeUrl]);

  const finish = useCallback(
    (mime: string | undefined) => {
      clearTimer();
      stopTracks();
      recorderRef.current = null;
      if (!mountedRef.current) return;
      const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' });
      chunksRef.current = [];
      if (blob.size === 0) {
        setStatus('error');
        return;
      }
      revokeUrl();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setAudioUrl(url);
      setStatus('recorded');
    },
    [clearTimer, stopTracks, revokeUrl],
  );

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {
        clearTimer();
        stopTracks();
        setStatus('error');
      }
    }
  }, [clearTimer, stopTracks]);

  const start = useCallback(async () => {
    if (!isSupported()) {
      setStatus('unsupported');
      return;
    }
    revokeUrl();
    setAudioUrl(null);
    setSeconds(0);
    setStatus('requesting');
    const myId = ++requestIdRef.current;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      if (!mountedRef.current || myId !== requestIdRef.current) return;
      const name = (e as DOMException)?.name;
      setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error');
      return;
    }
    // Race: unmounted or superseded while waiting for permission.
    if (!mountedRef.current || myId !== requestIdRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    streamRef.current = stream;
    try {
      const mime = pickMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onerror = () => {
        // Detach onstop first so it cannot overwrite the error state.
        rec.onstop = null;
        rec.ondataavailable = null;
        if (rec.state !== 'inactive') {
          try {
            rec.stop();
          } catch {
            /* already stopped */
          }
        }
        chunksRef.current = [];
        clearTimer();
        stopTracks();
        recorderRef.current = null;
        if (mountedRef.current) setStatus('error');
      };
      rec.onstop = () => finish(rec.mimeType || mime);
      recorderRef.current = rec;
      rec.start();
      setStatus('recording');
      const startedAt = Date.now();
      timerRef.current = window.setInterval(() => {
        const s = Math.min(MAX_SECONDS, Math.floor((Date.now() - startedAt) / 1000));
        setSeconds(s);
        if (s >= MAX_SECONDS) stop();
      }, 250);
    } catch {
      stopTracks();
      setStatus('error');
    }
  }, [clearTimer, finish, revokeUrl, stop, stopTracks]);

  const discard = useCallback(() => {
    revokeUrl();
    setAudioUrl(null);
    setSeconds(0);
    setStatus('idle');
  }, [revokeUrl]);

  const statusText: Record<Status, string> = {
    idle: '',
    requesting: 'Čekam dopuštenje…',
    recording: `Snimam… ${seconds}/${MAX_SECONDS} s`,
    recorded: 'Snimka je spremna.',
    denied: 'Mikrofon je odbijen. Upiši tekst u polje za chat iznad.',
    unsupported: 'Ovaj preglednik ne podržava snimanje zvuka. Upiši tekst u polje za chat iznad.',
    error: 'Snimanje nije uspjelo. Pokušaj ponovno ili upiši tekst u polje za chat iznad.',
  };

  const isAlert = status === 'denied' || status === 'unsupported' || status === 'error';

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        {status === 'recording' ? (
          <button type="button" className={`${styles.button} ${styles.stop}`} onClick={stop}>
            <span className={styles.stopIcon} aria-hidden="true" />
            Zaustavi snimanje
          </button>
        ) : (
          <button
            type="button"
            className={`${styles.button} ${styles.record}`}
            onClick={start}
            disabled={status === 'requesting' || status === 'unsupported'}
          >
            <span className={styles.dot} aria-hidden="true" />
            Pritisni za govor
          </button>
        )}
        {audioUrl && (
          <>
            <audio className={styles.audio} controls src={audioUrl} aria-label="Preslušaj snimku" />
            <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={discard}>
              Odbaci snimku
            </button>
          </>
        )}
      </div>

      <p
        className={`${styles.status} ${isAlert ? styles.statusWarn : ''}`}
        role={isAlert ? 'alert' : 'status'}
        aria-live={isAlert ? 'assertive' : 'polite'}
      >
        {statusText[status]}
      </p>

      <p className={styles.note}>Snimanje je lokalno. Transkripcija još nije povezana.</p>
    </div>
  );
}
