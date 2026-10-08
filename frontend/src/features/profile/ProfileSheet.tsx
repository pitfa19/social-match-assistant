"use client";

import { useState } from "react";
import { Dialog } from "./Dialog";
import { TrashIcon } from "../../components/Icons";
import type { StoredProfile } from "./storage";

type Props = {
  profile: StoredProfile;
  onClose: () => void;
  onSave: (text: string) => string | null;
  onDelete: () => string | null;
};

export function ProfileSheet({ profile, onClose, onSave, onDelete }: Props) {
  const [text, setText] = useState(profile.text);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dirty = text !== profile.text;

  function save() {
    if (!text.trim()) {
      setError("Profil ne može biti prazan. Za brisanje koristi gumb Obriši profil.");
      return;
    }
    const err = onSave(text.trim());
    setError(err);
    setSaved(!err);
  }

  return (
    <Dialog title="Profil" titleId="profile-title" onClose={onClose}>
      <label htmlFor="profile-text" className="sr-only">
        Tvoj profil
      </label>
      <textarea
        id="profile-text"
        data-testid="profile-text"
        data-autofocus
        className="field field-draft"
        rows={6}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
          setError(null);
        }}
      />
      <p className="meta">Samo na ovom uređaju</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {saved && !dirty && (
        <p role="status" className="ok">
          Promjene su spremljene.
        </p>
      )}
      {confirmDelete ? (
        <div className="confirm" role="alertdialog" aria-labelledby="del-q">
          <p id="del-q">Obrisati profil s ovog uređaja? Ovo se ne može poništiti.</p>
          <div className="chat-actions">
            <button type="button" className="btn btn-quiet" onClick={() => setConfirmDelete(false)} data-autofocus>
              Odustani
            </button>
            <button
              type="button"
              className="btn btn-danger" data-testid="profile-delete-confirm"
              onClick={() => {
                const err = onDelete();
                if (err) setError(err);
              }}
            >
              <TrashIcon /> Da, obriši
            </button>
          </div>
        </div>
      ) : (
        <div className="chat-actions">
          <button type="button" className="btn btn-quiet btn-danger-text" onClick={() => setConfirmDelete(true)} data-testid="profile-delete">
            <TrashIcon /> Obriši profil
          </button>
          <button type="button" className="btn btn-primary" onClick={save} data-testid="profile-save" disabled={!dirty}>
            Spremi promjene
          </button>
        </div>
      )}
    </Dialog>
  );
}
