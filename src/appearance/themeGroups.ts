import type { ColorTokens } from './schema';
import type { MessageKey } from '../i18n/messages';

export interface ThemeColorParam {
  key: keyof ColorTokens;
  labelKey: MessageKey;
  descriptionKey: MessageKey;
}

export interface ThemeGroupDef {
  id: string;
  titleKey: MessageKey;
  descriptionKey: MessageKey;
  colors: ThemeColorParam[];
}

/** Editor groups map onto shared ColorTokens (no parallel token system). */
export const THEME_COLOR_GROUPS: ThemeGroupDef[] = [
  {
    id: 'common',
    titleKey: 'theme.group.common.title',
    descriptionKey: 'theme.group.common.desc',
    colors: [
      { key: 'bgMain', labelKey: 'theme.color.bgMain.label', descriptionKey: 'theme.color.bgMain.desc' },
      { key: 'bgElevated', labelKey: 'theme.color.bgElevated.label', descriptionKey: 'theme.color.bgElevated.desc' },
      { key: 'textPrimary', labelKey: 'theme.color.textPrimary.label', descriptionKey: 'theme.color.textPrimary.desc' },
      { key: 'textSecondary', labelKey: 'theme.color.textSecondary.label', descriptionKey: 'theme.color.textSecondary.desc' },
      { key: 'textMuted', labelKey: 'theme.color.textMuted.label', descriptionKey: 'theme.color.textMuted.desc' },
      { key: 'accent', labelKey: 'theme.color.accent.label', descriptionKey: 'theme.color.accent.desc' },
      { key: 'accentHover', labelKey: 'theme.color.accentHover.label', descriptionKey: 'theme.color.accentHover.desc' },
      { key: 'accentSoft', labelKey: 'theme.color.accentSoft.label', descriptionKey: 'theme.color.accentSoft.desc' },
      { key: 'selection', labelKey: 'theme.color.selection.label', descriptionKey: 'theme.color.selection.desc' },
      { key: 'border', labelKey: 'theme.color.border.label', descriptionKey: 'theme.color.border.desc' },
      { key: 'borderStrong', labelKey: 'theme.color.borderStrong.label', descriptionKey: 'theme.color.borderStrong.desc' },
      { key: 'danger', labelKey: 'theme.color.danger.label', descriptionKey: 'theme.color.danger.desc' },
      { key: 'warning', labelKey: 'theme.color.warning.label', descriptionKey: 'theme.color.warning.desc' },
      { key: 'success', labelKey: 'theme.color.success.label', descriptionKey: 'theme.color.success.desc' },
      { key: 'like', labelKey: 'theme.color.like.label', descriptionKey: 'theme.color.like.desc' },
    ],
  },
  {
    id: 'titlebar',
    titleKey: 'theme.group.titlebar.title',
    descriptionKey: 'theme.group.titlebar.desc',
    colors: [{ key: 'titlebarBg', labelKey: 'theme.color.titlebarBg.label', descriptionKey: 'theme.color.titlebarBg.desc' }],
  },
  {
    id: 'sidebar',
    titleKey: 'theme.group.sidebar.title',
    descriptionKey: 'theme.group.sidebar.desc',
    colors: [
      { key: 'bgSidebar', labelKey: 'theme.color.bgSidebar.label', descriptionKey: 'theme.color.bgSidebar.desc' },
      { key: 'bgHover', labelKey: 'theme.color.bgHover.label', descriptionKey: 'theme.color.bgHover.desc' },
      { key: 'bgActive', labelKey: 'theme.color.bgActive.label', descriptionKey: 'theme.color.bgActive.desc' },
      { key: 'active', labelKey: 'theme.color.active.label', descriptionKey: 'theme.color.active.desc' },
    ],
  },
  {
    id: 'library',
    titleKey: 'theme.group.library.title',
    descriptionKey: 'theme.group.library.desc',
    colors: [
      { key: 'bgPanel', labelKey: 'theme.color.bgPanel.label', descriptionKey: 'theme.color.bgPanel.desc' },
      { key: 'bgHover', labelKey: 'theme.color.bgHover.label', descriptionKey: 'theme.color.bgHover.desc' },
      { key: 'bgActive', labelKey: 'theme.color.bgActive.label', descriptionKey: 'theme.color.bgActive.desc' },
    ],
  },
  {
    id: 'player',
    titleKey: 'theme.group.player.title',
    descriptionKey: 'theme.group.player.desc',
    colors: [
      { key: 'progress', labelKey: 'theme.color.progress.label', descriptionKey: 'theme.color.progress.desc' },
      { key: 'button', labelKey: 'theme.color.button.label', descriptionKey: 'theme.color.button.desc' },
      { key: 'playBtnBg', labelKey: 'theme.color.playBtnBg.label', descriptionKey: 'theme.color.playBtnBg.desc' },
      { key: 'playBtnFg', labelKey: 'theme.color.playBtnFg.label', descriptionKey: 'theme.color.playBtnFg.desc' },
    ],
  },
  {
    id: 'modals',
    titleKey: 'theme.group.modals.title',
    descriptionKey: 'theme.group.modals.desc',
    colors: [
      { key: 'bgElevated', labelKey: 'theme.color.bgElevated.label', descriptionKey: 'theme.color.bgElevated.desc' },
      { key: 'bgPanel', labelKey: 'theme.color.bgPanel.label', descriptionKey: 'theme.color.bgPanel.desc' },
      { key: 'border', labelKey: 'theme.color.border.label', descriptionKey: 'theme.color.border.desc' },
    ],
  },
  {
    id: 'context',
    titleKey: 'theme.group.context.title',
    descriptionKey: 'theme.group.context.desc',
    colors: [
      { key: 'bgElevated', labelKey: 'theme.color.bgElevated.label', descriptionKey: 'theme.color.bgElevated.desc' },
      { key: 'bgHover', labelKey: 'theme.color.bgHover.label', descriptionKey: 'theme.color.bgHover.desc' },
      { key: 'danger', labelKey: 'theme.color.danger.label', descriptionKey: 'theme.color.danger.desc' },
      { key: 'textPrimary', labelKey: 'theme.color.textPrimary.label', descriptionKey: 'theme.color.textPrimary.desc' },
    ],
  },
];

export const ALL_COLOR_PARAMS: ThemeColorParam[] = (() => {
  const map = new Map<keyof ColorTokens, ThemeColorParam>();
  for (const g of THEME_COLOR_GROUPS) {
    for (const c of g.colors) {
      if (!map.has(c.key)) map.set(c.key, c);
    }
  }
  return [...map.values()];
})();
