interface SeriesLabel {
  ja: string;
  en: string;
  zh: string;
}

export interface SeriesOption {
  value: string;
  label: string;
}

const SERIES_LABELS: Record<string, SeriesLabel> = {
  1: { ja: 'ラブライブ！', en: 'LoveLive!', zh: 'LoveLive!' },
  2: { ja: 'ラブライブ！サンシャイン!!', en: 'LoveLive! Sunshine!!', zh: 'LoveLive! Sunshine!!' },
  3: {
    ja: '虹ヶ咲学園スクールアイドル同好会',
    en: 'Nijigasaki High School Idol Club',
    zh: '虹咲学园学园偶像同好会',
  },
  4: { ja: 'ラブライブ！スーパースター!!', en: 'LoveLive! Superstar!!', zh: 'LoveLive! Superstar!!' },
  5: { ja: 'スクールアイドルミュージカル', en: 'SCHOOL IDOL MUSICAL', zh: '学园偶像音乐剧' },
  6: {
    ja: '蓮ノ空女学院スクールアイドルクラブ',
    en: 'Hasu no sora Jogakuin School Idol Club',
    zh: '莲之空女学院学园偶像俱乐部',
  },
  7: {
    ja: '幻日のヨハネ -SUNSHINE in the MIRROR-',
    en: 'YOHANE THE PARHELION -SUNSHINE in the MIRROR-',
    zh: '幻日夜羽 -SUNSHINE in the MIRROR-',
  },
  8: {
    ja: 'イキヅライブ！LOVELIVE! BLUEBIRD',
    en: 'IKIZULIVE! LOVELIVE! BLUEBIRD',
    zh: '生如百戏难！LOVELIVE! 青鸟',
  },
};

const SERIES_COLORS: Record<string, string> = {
  1: '#E50080',
  2: '#32AAFF',
  3: '#F39800',
  4: '#A5469B',
  5: '#C40035',
  6: '#FB8A9B',
  7: '#19737D',
  8: '#ED6D00',
};

function resolveLang(locale: string): 'ja' | 'en' | 'zh' {
  if (locale === 'zh' || locale === 'zh-CN') return 'zh';
  if (locale === 'ja') return 'ja';
  return 'en';
}

export function getSeriesOptions(locale: string): SeriesOption[] {
  const lang = resolveLang(locale);
  return Object.entries(SERIES_LABELS).map(([id, labels]) => ({
    value: id,
    label: labels[lang],
  }));
}

export function getSeriesLabel(id: string, locale: string): string {
  const lang = resolveLang(locale);
  return SERIES_LABELS[id]?.[lang] ?? id;
}

export function getSeriesColor(id: string): string {
  return SERIES_COLORS[id] ?? '#888888';
}
