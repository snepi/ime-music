import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { useToast } from '../ui/Toast';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { getCoverSrc, toFileUrl } from '../../utils/media';
import type { MetadataSavePayload, Song, TrackDetails } from '../../types';
import { useI18n } from '../../i18n';

interface Props {
  songId: string | null;
  open: boolean;
  onClose: () => void;
  onSaved: (song: Song) => void;
}

type FormState = {
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  genre: string;
  year: string;
  trackNumber: string;
  discNumber: string;
  comment: string;
  composer: string;
  rating: string;
};

function songToForm(song: Song): FormState {
  return {
    title: song.title || '',
    artist: song.artist || '',
    album: song.album || '',
    albumArtist: song.albumArtist || '',
    genre: song.genre || '',
    year: song.year != null ? String(song.year) : '',
    trackNumber: song.trackNumber != null ? String(song.trackNumber) : '',
    discNumber: song.discNumber != null ? String(song.discNumber) : '',
    comment: song.comment || '',
    composer: song.composer || '',
    rating: song.rating != null ? String(song.rating) : '',
  };
}

function formatBytes(size: number | null | undefined): string {
  if (size == null || !Number.isFinite(size)) return '—';
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} КБ`;
  return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function Field({
  label,
  htmlFor,
  children,
  required,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="meta-field">
      <label className="meta-label" htmlFor={htmlFor}>
        {label}
        {required ? ' *' : ''}
      </label>
      {children}
    </div>
  );
}

export function EditMetadataModal({ songId, open, onClose, onSaved }: Props) {
  const { showToast } = useToast();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<TrackDetails | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [initialForm, setInitialForm] = useState<FormState | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverSourcePath, setCoverSourcePath] = useState<string | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [libraryOnly, setLibraryOnly] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState(false);

  useEffect(() => {
    if (!open || !songId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCoverSourcePath(null);
    setRemoveCover(false);
    setLibraryOnly(false);
    setDiscardConfirm(false);

    void window.imeMusic
      .getTrackDetails(songId)
      .then((data) => {
        if (cancelled) return;
        setDetails(data);
        const nextForm = songToForm(data.song);
        setForm(nextForm);
        setInitialForm(nextForm);
        setCoverPreview(getCoverSrc(data.song));
        setLibraryOnly(!data.writeToFileSupported);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Не удалось загрузить метаданные';
        setError(message);
        showToast('Не удалось открыть редактор', 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // Intentionally only reload when opening a track — not on every toast/identity change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, songId]);

  const dirty = useMemo(() => {
    if (!form || !initialForm) return false;
    if (coverSourcePath || removeCover) return true;
    return (Object.keys(form) as (keyof FormState)[]).some((k) => form[k] !== initialForm[k]);
  }, [form, initialForm, coverSourcePath, removeCover]);

  const updateField = (key: keyof FormState, value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handlePickCover = async () => {
    const picked = await window.imeMusic.pickCoverImage();
    if (!picked) return;
    setCoverSourcePath(picked);
    setRemoveCover(false);
    setCoverPreview(toFileUrl(picked));
  };

  const handleRemoveCover = () => {
    setRemoveCover(true);
    setCoverSourcePath(null);
    setCoverPreview(null);
  };

  const handleSave = async () => {
    if (!songId || !form) return;
    if (!form.title.trim()) {
      setError(t('meta.titleRequired'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: MetadataSavePayload = {
        title: form.title,
        artist: form.artist,
        album: form.album,
        albumArtist: form.albumArtist || null,
        genre: form.genre || null,
        year: form.year ? parseInt(form.year, 10) : null,
        trackNumber: form.trackNumber ? parseInt(form.trackNumber, 10) : null,
        discNumber: form.discNumber ? parseInt(form.discNumber, 10) : null,
        comment: form.comment || null,
        composer: form.composer || null,
        rating: form.rating ? parseInt(form.rating, 10) : null,
        coverSourcePath: coverSourcePath || null,
        removeCover,
        libraryOnly,
      };
      const result = await window.imeMusic.saveTrackMetadata(songId, payload);
      onSaved(result.song);
      if (removeCover) showToast(t('meta.coverRemoved'), 'success');
      else if (coverSourcePath) showToast(t('meta.coverSaved'), 'success');
      showToast(result.writtenToFile ? t('meta.saved') : result.message, result.writtenToFile ? 'success' : 'info');
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('meta.saveFail');
      setError(message);
      showToast(t('meta.saveFail'), 'error');
      void window.imeMusic.logError('metadata', 'UI save failed', message);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (saving) return;
    if (dirty) {
      setDiscardConfirm(true);
      return;
    }
    onClose();
  };

  const song = details?.song;

  return (
    <>
      <Modal
        open={open}
        title={t('meta.title')}
        onClose={handleClose}
        width={760}
        className="modal-meta"
        footer={
          <div className="meta-footer">
            <div className="meta-footer-left">
              {dirty && <span className="meta-dirty-badge">{t('meta.dirty')}</span>}
            </div>
            <div className="meta-footer-right">
              <Button variant="ghost" onClick={handleClose} disabled={saving}>
                {t('common.cancel')}
              </Button>
              <Button variant="primary" onClick={() => void handleSave()} disabled={saving || loading || !form}>
                {saving ? t('meta.saving') : t('common.save')}
              </Button>
            </div>
          </div>
        }
      >
        {loading && (
          <div className="meta-loading">
            <div className="spinner" />
            <span>{t('common.loading')}</span>
          </div>
        )}

        {error && (
          <div className="meta-error" role="alert">
            <Icon name="warning" size={16} />
            <span>{error}</span>
          </div>
        )}

        {!loading && form && song && (
          <div className="meta-editor">
            <section className="meta-top">
              <div className="meta-cover-col">
                {coverPreview ? (
                  <img className="meta-cover" src={coverPreview} alt="" />
                ) : (
                  <div className="meta-cover meta-cover-empty" aria-hidden="true">
                    <Icon name="disc" size={40} />
                  </div>
                )}
                <div className="meta-cover-actions">
                  <Button variant="secondary" onClick={() => void handlePickCover()} disabled={saving}>
                    Изменить
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={handleRemoveCover}
                    disabled={saving || (!coverPreview && !song.coverPath)}
                  >
                    Удалить
                  </Button>
                </div>
              </div>

              <div className="meta-primary-fields">
                <Field label={t('meta.fieldTitle')} htmlFor="meta-title" required>
                  <input
                    id="meta-title"
                    className="field-input"
                    value={form.title}
                    onChange={(e) => updateField('title', e.target.value)}
                    autoFocus
                  />
                </Field>
                <Field label={t('meta.fieldArtist')} htmlFor="meta-artist">
                  <input
                    id="meta-artist"
                    className="field-input"
                    value={form.artist}
                    onChange={(e) => updateField('artist', e.target.value)}
                  />
                </Field>
                <Field label={t('meta.fieldAlbum')} htmlFor="meta-album">
                  <input
                    id="meta-album"
                    className="field-input"
                    value={form.album}
                    onChange={(e) => updateField('album', e.target.value)}
                  />
                </Field>
                <Field label={t('meta.fieldAlbumArtist')} htmlFor="meta-album-artist">
                  <input
                    id="meta-album-artist"
                    className="field-input"
                    value={form.albumArtist}
                    onChange={(e) => updateField('albumArtist', e.target.value)}
                  />
                </Field>
              </div>
            </section>

            <section className="meta-grid">
              <Field label={t('meta.fieldGenre')} htmlFor="meta-genre">
                <input
                  id="meta-genre"
                  className="field-input"
                  value={form.genre}
                  onChange={(e) => updateField('genre', e.target.value)}
                />
              </Field>
              <Field label={t('meta.fieldComposer')} htmlFor="meta-composer">
                <input
                  id="meta-composer"
                  className="field-input"
                  value={form.composer}
                  onChange={(e) => updateField('composer', e.target.value)}
                />
              </Field>
              <Field label={t('meta.fieldYear')} htmlFor="meta-year">
                <input
                  id="meta-year"
                  className="field-input"
                  inputMode="numeric"
                  value={form.year}
                  onChange={(e) => updateField('year', e.target.value)}
                />
              </Field>
              <Field label="№ трека" htmlFor="meta-track">
                <input
                  id="meta-track"
                  className="field-input"
                  inputMode="numeric"
                  value={form.trackNumber}
                  onChange={(e) => updateField('trackNumber', e.target.value)}
                />
              </Field>
              <Field label="№ диска" htmlFor="meta-disc">
                <input
                  id="meta-disc"
                  className="field-input"
                  inputMode="numeric"
                  value={form.discNumber}
                  onChange={(e) => updateField('discNumber', e.target.value)}
                />
              </Field>
              <Field label={t('meta.fieldRating')} htmlFor="meta-rating">
                <input
                  id="meta-rating"
                  className="field-input"
                  inputMode="numeric"
                  value={form.rating}
                  onChange={(e) => updateField('rating', e.target.value)}
                />
              </Field>
              <div className="meta-field meta-field-wide">
                <label className="meta-label" htmlFor="meta-comment">
                  Комментарий
                </label>
                <textarea
                  id="meta-comment"
                  className="field-input field-textarea"
                  rows={3}
                  value={form.comment}
                  onChange={(e) => updateField('comment', e.target.value)}
                />
              </div>
            </section>

            <section className="meta-file-card">
              <div className="meta-file-header">
                <h4>Сведения о файле</h4>
                <Button
                  variant="secondary"
                  onClick={() => void window.imeMusic.showItemInFolder(song.filePath)}
                  disabled={!details?.fileExists}
                >
                  <Icon name="folder" size={16} />
                  Открыть папку
                </Button>
              </div>
              <div className="meta-file-grid">
                <div className="meta-file-item">
                  <span className="meta-file-k">Длительность</span>
                  <span className="meta-file-v">{formatDuration(song.duration)}</span>
                </div>
                <div className="meta-file-item">
                  <span className="meta-file-k">Формат</span>
                  <span className="meta-file-v">{song.format || '—'}</span>
                </div>
                <div className="meta-file-item">
                  <span className="meta-file-k">Битрейт</span>
                  <span className="meta-file-v">
                    {song.bitrate ? `${Math.round(song.bitrate / 1000)} кбит/с` : '—'}
                  </span>
                </div>
                <div className="meta-file-item">
                  <span className="meta-file-k">Частота</span>
                  <span className="meta-file-v">{song.sampleRate ? `${song.sampleRate} Гц` : '—'}</span>
                </div>
                <div className="meta-file-item">
                  <span className="meta-file-k">Размер</span>
                  <span className="meta-file-v">{formatBytes(song.fileSize)}</span>
                </div>
                <div className="meta-file-item">
                  <span className="meta-file-k">Изменён</span>
                  <span className="meta-file-v">
                    {song.dateModified ? new Date(song.dateModified).toLocaleString() : '—'}
                  </span>
                </div>
                <div className="meta-file-item meta-file-path">
                  <span className="meta-file-k">Путь</span>
                  <span className="meta-file-v" title={song.filePath}>
                    {song.filePath}
                  </span>
                </div>
              </div>
            </section>

            {(details?.writeHint || details?.writeToFileSupported) && (
              <section className="meta-options">
                {details.writeHint && <p className="meta-hint">{details.writeHint}</p>}
                {details.writeToFileSupported && (
                  <label className="meta-library-only">
                    <input
                      type="checkbox"
                      className="ui-checkbox"
                      checked={libraryOnly}
                      onChange={(e) => setLibraryOnly(e.target.checked)}
                    />
                    <span className="ui-checkbox-box" aria-hidden="true">
                      <Icon name="check" size={12} />
                    </span>
                    <span>Сохранить только в библиотеке (не записывать теги в файл)</span>
                  </label>
                )}
              </section>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={discardConfirm}
        title={t('meta.discardTitle')}
        message={t('meta.discardMsg')}
        confirmLabel={t('meta.discardConfirm')}
        cancelLabel={t('meta.discardCancel')}
        danger
        onCancel={() => setDiscardConfirm(false)}
        onConfirm={() => {
          setDiscardConfirm(false);
          onClose();
        }}
      />
    </>
  );
}
