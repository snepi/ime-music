import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Select';
import { Toggle } from '../../ui/Toggle';
import { Slider } from '../../ui/Slider';
import { useToast } from '../../ui/Toast';
import { AdvancedColorRow } from './AdvancedColorRow';
import { ThemePreview } from './ThemePreview';
import { SectionReset } from './SectionReset';
import { BUILTIN_PRESETS } from '../../../appearance/presets';
import { THEME_COLOR_GROUPS } from '../../../appearance/themeGroups';
import { buildThemeExport, parseThemeImport } from '../../../appearance/themeExport';
import {
  DEFAULT_APPEARANCE,
  DEFAULT_COLOR_DARK,
  DEFAULT_COLOR_LIGHT,
  type AppearanceSettings,
  type ColorTokens,
  type UiTheme,
  type WallpaperAsset,
} from '../../../appearance/schema';
import { applyAppearance, getEffectiveAppearance } from '../../../utils/applyAppearance';
import { useI18n } from '../../../i18n';

interface Props {
  appearance: AppearanceSettings;
  activeThemeId: string;
  uiThemes: UiTheme[];
  wallpapers: WallpaperAsset[];
  liveApply: boolean;
  onLiveApplyChange: (v: boolean) => void;
  onCommitAppearance: (appearance: AppearanceSettings, replace?: boolean) => Promise<unknown>;
  onSettingsUpdate: (settings: {
    appearance?: AppearanceSettings;
    uiThemes?: UiTheme[];
    activeThemeId?: string;
    wallpapers?: WallpaperAsset[];
  }) => Promise<unknown>;
}

function cloneAppearance(a: AppearanceSettings): AppearanceSettings {
  return JSON.parse(JSON.stringify(getEffectiveAppearance(a))) as AppearanceSettings;
}

function builtinThemes(description: string): UiTheme[] {
  return BUILTIN_PRESETS.map((p) => ({
    id: p.id,
    name: p.name,
    description,
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
    appearance: getEffectiveAppearance(p.appearance),
  }));
}

export function ThemeEditorPanel({
  appearance,
  activeThemeId,
  uiThemes,
  wallpapers,
  liveApply,
  onLiveApplyChange,
  onCommitAppearance,
  onSettingsUpdate,
}: Props) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [draft, setDraft] = useState(() => cloneAppearance(appearance));
  const [baseline, setBaseline] = useState(() => cloneAppearance(appearance));
  const [selectedId, setSelectedId] = useState(activeThemeId || 'default');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [onlyDirty, setOnlyDirty] = useState(false);
  const [previewMode, setPreviewMode] = useState<'small' | 'standard' | 'wide'>('standard');
  const [previewPage, setPreviewPage] = useState<'library' | 'playlist' | 'metadata'>('library');
  const [editMode, setEditMode] = useState<'dark' | 'light'>('dark');
  const [busy, setBusy] = useState(false);
  const debounceRef = useRef<number | null>(null);

  const themes = useMemo(() => {
    const users = uiThemes.filter((t) => !t.builtin);
    return [...builtinThemes(t('settings.theme.builtinDescription')), ...users];
  }, [t, uiThemes]);

  const selected = themes.find((t) => t.id === selectedId) || themes[0];

  useEffect(() => {
    setDraft(cloneAppearance(appearance));
    setBaseline(cloneAppearance(appearance));
    setSelectedId(activeThemeId || 'default');
  }, [activeThemeId]); // eslint-disable-line react-hooks/exhaustive-deps -- sync when theme switches externally

  const pushDraft = useCallback(
    (next: AppearanceSettings, persistUser = false) => {
      setDraft(next);
      if (liveApply) {
        applyAppearance(next);
        if (debounceRef.current) window.clearTimeout(debounceRef.current);
        debounceRef.current = window.setTimeout(() => {
          void onCommitAppearance(next, true);
          if (persistUser && selected && !selected.builtin) {
            void window.imeMusic.updateTheme?.({
              id: selected.id,
              appearance: next,
            });
          }
        }, 350);
      }
    },
    [liveApply, onCommitAppearance, selected],
  );

  const dirtyCount = useMemo(() => {
    let n = 0;
    const mode = editMode;
    const cur = draft.colors[mode];
    const base = baseline.colors[mode];
    for (const key of Object.keys(cur) as (keyof ColorTokens)[]) {
      if (cur[key] !== base[key]) n += 1;
    }
    return n;
  }, [draft, baseline, editMode]);

  const setColor = (key: keyof ColorTokens, value: string) => {
    const next = {
      ...draft,
      colors: {
        ...draft.colors,
        [editMode]: { ...draft.colors[editMode], [key]: value },
      },
    };
    pushDraft(next, true);
  };

  const restoreColor = (key: keyof ColorTokens) => {
    const def = editMode === 'light' ? DEFAULT_COLOR_LIGHT[key] : DEFAULT_COLOR_DARK[key];
    setColor(key, def);
  };

  const resetGroup = (groupId: string) => {
    const group = THEME_COLOR_GROUPS.find((g) => g.id === groupId);
    if (!group) return;
    const colors = { ...draft.colors[editMode] };
    const def = editMode === 'light' ? DEFAULT_COLOR_LIGHT : DEFAULT_COLOR_DARK;
    for (const c of group.colors) colors[c.key] = def[c.key];
    pushDraft(
      {
        ...draft,
        colors: { ...draft.colors, [editMode]: colors },
      },
      true,
    );
  };

  const createTheme = async () => {
    setBusy(true);
    try {
      const result = await window.imeMusic.createTheme({
        name: t('settings.theme.defaultName', { n: uiThemes.length + 1 }),
        description: '',
        appearance: draft,
      });
      if (!result.ok || !result.settings) {
        showToast(result.error || t('settings.theme.createFailed'), 'error');
        return;
      }
      await onSettingsUpdate({
        uiThemes: result.settings.uiThemes,
        activeThemeId: result.settings.activeThemeId,
        appearance: result.settings.appearance,
      });
      if (result.theme) setSelectedId(result.theme.id);
      showToast(t('settings.theme.created'), 'success');
    } finally {
      setBusy(false);
    }
  };

  const duplicateTheme = async () => {
    setBusy(true);
    try {
      const result = await window.imeMusic.createTheme({
        name: `${selected?.name || t('settings.theme.fallbackName')} ${t('settings.theme.copySuffix')}`,
        description: selected?.description || '',
        appearance: draft,
      });
      if (!result.ok || !result.settings) {
        showToast(result.error || t('settings.theme.duplicateFailed'), 'error');
        return;
      }
      await onSettingsUpdate({
        uiThemes: result.settings.uiThemes,
        activeThemeId: result.settings.activeThemeId,
        appearance: result.settings.appearance,
      });
      if (result.theme) setSelectedId(result.theme.id);
      showToast(t('settings.theme.duplicated'), 'success');
    } finally {
      setBusy(false);
    }
  };

  const renameTheme = async () => {
    if (!selected || selected.builtin) {
      showToast(t('settings.theme.builtinRenameForbidden'), 'info');
      return;
    }
    const name = window.prompt(t('settings.theme.renamePrompt'), selected.name);
    if (!name?.trim()) return;
    const result = await window.imeMusic.updateTheme({ id: selected.id, name: name.trim() });
    if (result.ok && result.settings) {
      await onSettingsUpdate({ uiThemes: result.settings.uiThemes });
      showToast(t('settings.theme.renamed'), 'success');
    }
  };

  const deleteTheme = async () => {
    if (!selected || selected.builtin) {
      showToast(t('settings.theme.builtinDeleteForbidden'), 'info');
      return;
    }
    if (!window.confirm(t('settings.theme.deleteConfirm', { name: selected.name }))) return;
    const result = await window.imeMusic.deleteTheme(selected.id);
    if (result.ok && result.settings) {
      await onSettingsUpdate({
        uiThemes: result.settings.uiThemes,
        activeThemeId: result.settings.activeThemeId,
        appearance: result.settings.appearance,
      });
      setSelectedId(result.settings.activeThemeId || 'default');
      showToast(t('settings.theme.deleted'), 'info');
    }
  };

  const applySelected = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      if (selected.builtin) {
        const next = cloneAppearance(selected.appearance);
        await onCommitAppearance(next, true);
        await onSettingsUpdate({ activeThemeId: selected.id, appearance: next });
        setDraft(next);
        setBaseline(next);
      } else {
        const result = await window.imeMusic.applyTheme(selected.id);
        if (result.ok && result.settings) {
          await onSettingsUpdate({
            activeThemeId: result.settings.activeThemeId,
            appearance: result.settings.appearance,
            uiThemes: result.settings.uiThemes,
          });
          const next = cloneAppearance(result.settings.appearance || draft);
          setDraft(next);
          setBaseline(next);
          applyAppearance(next);
        }
      }
      showToast(t('settings.theme.applied'), 'success');
    } finally {
      setBusy(false);
    }
  };

  const saveTheme = async () => {
    setBusy(true);
    try {
      await onCommitAppearance(draft, true);
      setBaseline(cloneAppearance(draft));
      if (selected && !selected.builtin) {
        await window.imeMusic.updateTheme({ id: selected.id, appearance: draft, apply: true });
      } else if (selected?.builtin) {
        // Save as new user theme from builtin edits
        const result = await window.imeMusic.createTheme({
          name: `${selected.name} ${t('settings.theme.mySuffix')}`,
          appearance: draft,
        });
        if (result.ok && result.settings) {
          await onSettingsUpdate({
            uiThemes: result.settings.uiThemes,
            activeThemeId: result.settings.activeThemeId,
            appearance: result.settings.appearance,
          });
          if (result.theme) setSelectedId(result.theme.id);
        }
      }
      showToast(t('settings.theme.saved'), 'success');
    } finally {
      setBusy(false);
    }
  };

  const cancelChanges = () => {
    const next = cloneAppearance(baseline);
    setDraft(next);
    applyAppearance(next);
    void onCommitAppearance(next, true);
    showToast(t('settings.theme.changesCancelled'), 'info');
  };

  const resetTheme = async () => {
    if (!window.confirm(t('settings.theme.resetConfirm'))) return;
    const next = cloneAppearance(DEFAULT_APPEARANCE);
    pushDraft(next, true);
    await onCommitAppearance(next, true);
    if (selected && !selected.builtin) {
      await window.imeMusic.resetTheme(selected.id);
    }
    setBaseline(next);
    showToast(t('settings.theme.reset'), 'success');
  };

  const exportTheme = async () => {
    const payload = buildThemeExport(selected?.name || 'theme', draft, {
      description: selected?.description,
      mode: 'full',
    });
    const result = await window.imeMusic.exportTheme(payload);
    if (result.ok) showToast(t('settings.theme.exported'), 'success');
    else showToast(result.error || t('settings.theme.cancelled'), 'error');
  };

  const importTheme = async () => {
    const result = await window.imeMusic.importTheme();
    if (!result.ok || !result.data) {
      if (result.error) showToast(result.error, 'error');
      return;
    }
    const parsed = parseThemeImport(result.data);
    if (!parsed.ok) {
      showToast(parsed.error, 'error');
      return;
    }
    const created = await window.imeMusic.createTheme({
      name: parsed.name,
      description: parsed.description,
      appearance: parsed.appearance,
    });
    if (created.ok && created.settings) {
      await onSettingsUpdate({
        uiThemes: created.settings.uiThemes,
        activeThemeId: created.settings.activeThemeId,
        appearance: created.settings.appearance,
      });
      showToast(t('settings.theme.imported'), 'success');
    }
  };

  const expandAll = () => setCollapsed({});
  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    for (const g of THEME_COLOR_GROUPS) next[g.id] = true;
    setCollapsed(next);
  };

  const q = search.trim().toLowerCase();

  return (
    <div className="theme-editor">
      <div className="theme-editor-toolbar">
        <Select
          id="theme-select"
          label={t('settings.theme.selectLabel')}
          value={selectedId}
          onChange={(id) => {
            setSelectedId(id);
            const t = themes.find((x) => x.id === id);
            if (t) {
              const next = cloneAppearance(t.appearance);
              setDraft(next);
              if (liveApply) applyAppearance(next);
            }
          }}
          options={themes.map((t) => ({
            value: t.id,
            label: `${t.name}${t.builtin ? '' : ' •'}${t.id === activeThemeId ? ' ✓' : ''}`,
          }))}
        />
        <div className="settings-actions-row">
          <Button variant="secondary" disabled={busy} onClick={() => void createTheme()}>
            {t('settings.theme.add')}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void duplicateTheme()}>
            {t('settings.theme.duplicate')}
          </Button>
          <Button variant="ghost" onClick={() => void renameTheme()}>
            {t('settings.theme.rename')}
          </Button>
          <Button variant="danger" onClick={() => void deleteTheme()}>
            {t('settings.theme.delete')}
          </Button>
          <Button variant="ghost" onClick={() => void exportTheme()}>
            {t('settings.theme.export')}
          </Button>
          <Button variant="ghost" onClick={() => void importTheme()}>
            {t('settings.theme.import')}
          </Button>
          <Button variant="secondary" onClick={() => void resetTheme()}>
            {t('settings.theme.resetTheme')}
          </Button>
        </div>
        {selected ? (
          <p className="field-hint">
            {selected.builtin ? t('settings.theme.builtin') : t('settings.theme.user')} · {t('settings.theme.createdAt')}{' '}
            {selected.createdAt ? new Date(selected.createdAt).toLocaleString() : '—'} · {t('settings.theme.updatedAt')}{' '}
            {selected.updatedAt ? new Date(selected.updatedAt).toLocaleString() : '—'}
            {selected.description ? ` · ${selected.description}` : ''}
          </p>
        ) : null}
      </div>

      <div className="theme-editor-controls">
        <Toggle
          id="live-apply"
          checked={liveApply}
          onChange={onLiveApplyChange}
          label={t('settings.theme.liveApply')}
        />
        <Toggle
          id="only-dirty"
          checked={onlyDirty}
          onChange={setOnlyDirty}
          label={t('settings.theme.onlyChanged', { count: dirtyCount })}
        />
        <input
          className="field-input"
          placeholder={t('settings.theme.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button variant="ghost" onClick={expandAll}>
          {t('settings.theme.expandAll')}
        </Button>
        <Button variant="ghost" onClick={collapseAll}>
          {t('settings.theme.collapseAll')}
        </Button>
        <Select
          id="color-mode"
          label={t('settings.theme.palette')}
          value={editMode}
          onChange={(v) => setEditMode(v as 'dark' | 'light')}
          options={[
            { value: 'dark', label: t('settings.theme.darkPalette') },
            { value: 'light', label: t('settings.theme.lightPalette') },
          ]}
        />
      </div>

      <div className="theme-editor-grid">
        <div className="theme-editor-groups">
          {THEME_COLOR_GROUPS.map((group) => {
            const colors = group.colors.filter((c) => {
              if (q) {
                const hay = `${t(c.labelKey)} ${c.key} ${t(c.descriptionKey)} ${t(group.titleKey)} ${t(group.descriptionKey)}`.toLowerCase();
                if (!hay.includes(q)) return false;
              }
              if (onlyDirty && draft.colors[editMode][c.key] === baseline.colors[editMode][c.key]) {
                return false;
              }
              return true;
            });
            if (!colors.length && (q || onlyDirty)) return null;
            const isCollapsed = collapsed[group.id] && !q;
            return (
              <section key={group.id} className="theme-group">
                <header className="theme-group-header">
                  <button
                    type="button"
                    className="theme-group-toggle"
                    onClick={() => setCollapsed((s) => ({ ...s, [group.id]: !s[group.id] }))}
                  >
                    <strong>{t(group.titleKey)}</strong>
                    <span>{t(group.descriptionKey)}</span>
                  </button>
                  <div className="theme-group-actions">
                    <Button variant="ghost" onClick={() => resetGroup(group.id)}>
                      {t('settings.theme.resetGroup')}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        const colorsNext = { ...draft.colors[editMode] };
                        for (const c of group.colors) {
                          colorsNext[c.key] = baseline.colors[editMode][c.key];
                        }
                        pushDraft(
                          { ...draft, colors: { ...draft.colors, [editMode]: colorsNext } },
                          true,
                        );
                      }}
                    >
                      {t('settings.theme.restore')}
                    </Button>
                  </div>
                </header>
                {!isCollapsed
                  ? colors.map((c) => (
                      <AdvancedColorRow
                        key={`${group.id}-${c.key}`}
                        label={t(c.labelKey)}
                        techKey={c.key}
                        description={t(c.descriptionKey)}
                        value={draft.colors[editMode][c.key]}
                        defaultValue={
                          editMode === 'light' ? DEFAULT_COLOR_LIGHT[c.key] : DEFAULT_COLOR_DARK[c.key]
                        }
                        onChange={(v) => setColor(c.key, v)}
                        onRestore={() => restoreColor(c.key)}
                      />
                    ))
                  : null}
              </section>
            );
          })}

          <section className="theme-group">
            <header className="theme-group-header">
              <strong>{t('settings.theme.wallpaperQuick')}</strong>
            </header>
            <p className="field-hint">
              {t('settings.theme.wallpaperQuickHint', { count: wallpapers.length })}
            </p>
            <SectionReset
              label={t('settings.theme.resetTransparencyLayers')}
              onReset={() =>
                pushDraft(
                  {
                    ...draft,
                    layers: { ...DEFAULT_APPEARANCE.layers },
                  },
                  true,
                )
              }
            />
            <Slider
              id="layer-window"
              label={t('settings.theme.mainBackgroundOpacity')}
              value={Math.round(draft.layers.windowOpacity * 100)}
              min={5}
              max={100}
              unit="%"
              onChange={(v) =>
                pushDraft(
                  { ...draft, layers: { ...draft.layers, windowOpacity: v / 100 } },
                  true,
                )
              }
            />
            <Slider
              id="layer-sidebar"
              label={t('settings.theme.sidebarOpacity')}
              value={Math.round(draft.layers.sidebarOpacity * 100)}
              min={5}
              max={100}
              unit="%"
              onChange={(v) =>
                pushDraft(
                  { ...draft, layers: { ...draft.layers, sidebarOpacity: v / 100 } },
                  true,
                )
              }
            />
            <Slider
              id="layer-player"
              label={t('settings.theme.playerOpacity')}
              value={Math.round(draft.layers.playerOpacity * 100)}
              min={5}
              max={100}
              unit="%"
              onChange={(v) =>
                pushDraft(
                  { ...draft, layers: { ...draft.layers, playerOpacity: v / 100 } },
                  true,
                )
              }
            />
            <p className="field-hint">
              {t('settings.theme.transparencyNote')}
            </p>
          </section>
        </div>

        <aside className="theme-editor-preview-pane">
          <div className="settings-actions-row">
            <Select
              id="pv-mode"
              label={t('settings.preview.window')}
              value={previewMode}
              onChange={(v) => setPreviewMode(v as typeof previewMode)}
              options={[
                { value: 'small', label: t('settings.preview.small') },
                { value: 'standard', label: t('settings.preview.standard') },
                { value: 'wide', label: t('settings.preview.wide') },
              ]}
            />
            <Select
              id="pv-page"
              label={t('settings.preview.page')}
              value={previewPage}
              onChange={(v) => setPreviewPage(v as typeof previewPage)}
              options={[
                { value: 'library', label: t('settings.preview.library') },
                { value: 'playlist', label: t('settings.preview.playlist') },
                { value: 'metadata', label: t('settings.preview.metadata') },
              ]}
            />
          </div>
          <ThemePreview appearance={draft} mode={previewMode} page={previewPage} />
          <div className="settings-actions-row">
            <Button variant="primary" disabled={busy} onClick={() => void applySelected()}>
              {t('settings.theme.apply')}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void saveTheme()}>
              {t('settings.theme.save')}
            </Button>
            <Button variant="ghost" onClick={cancelChanges}>
              {t('settings.theme.cancelChanges')}
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
