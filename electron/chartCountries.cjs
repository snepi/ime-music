/** Official Deezer Charts playlists by country (creator: Deezer Charts). */

const CHART_COUNTRIES = [
  { code: 'world', label: 'Мир', playlistId: 3155776842 },
  { code: 'ru', label: 'Россия', playlistId: 1116189381 },
  { code: 'ua', label: 'Украина', playlistId: 1362526495 },
  { code: 'us', label: 'США', playlistId: 1313621735 },
  { code: 'gb', label: 'Великобритания', playlistId: 1111142221 },
  { code: 'de', label: 'Германия', playlistId: 1111143121 },
  { code: 'fr', label: 'Франция', playlistId: 1109890291 },
  { code: 'pl', label: 'Польша', playlistId: 1266972311 },
  { code: 'tr', label: 'Турция', playlistId: 1116189071 },
  { code: 'es', label: 'Испания', playlistId: 1116190041 },
  { code: 'it', label: 'Италия', playlistId: 1116187241 },
  { code: 'br', label: 'Бразилия', playlistId: 1111141961 },
  { code: 'mx', label: 'Мексика', playlistId: 1111142361 },
  { code: 'ar', label: 'Аргентина', playlistId: 1279119721 },
  { code: 'co', label: 'Колумбия', playlistId: 1116188451 },
  { code: 'ca', label: 'Канада', playlistId: 1652248171 },
  { code: 'au', label: 'Австралия', playlistId: 1313616925 },
  { code: 'jp', label: 'Япония', playlistId: 1362508955 },
  { code: 'kr', label: 'Южная Корея', playlistId: 1362510315 },
  { code: 'id', label: 'Индонезия', playlistId: 1116188761 },
  { code: 'nl', label: 'Нидерланды', playlistId: 1266971851 },
  { code: 'be', label: 'Бельгия', playlistId: 1266968331 },
  { code: 'se', label: 'Швеция', playlistId: 1313620305 },
  { code: 'no', label: 'Норвегия', playlistId: 1313619885 },
  { code: 'dk', label: 'Дания', playlistId: 1313618905 },
  { code: 'fi', label: 'Финляндия', playlistId: 1221034071 },
  { code: 'ie', label: 'Ирландия', playlistId: 1313619455 },
  { code: 'at', label: 'Австрия', playlistId: 1313615765 },
  { code: 'ch', label: 'Швейцария', playlistId: 1313617925 },
  { code: 'cz', label: 'Чехия', playlistId: 1266969571 },
  { code: 'pt', label: 'Португалия', playlistId: 1362519755 },
  { code: 'ro', label: 'Румыния', playlistId: 1279117071 },
  { code: 'hu', label: 'Венгрия', playlistId: 1362506695 },
  { code: 'lv', label: 'Латвия', playlistId: 1221037511 },
  { code: 'il', label: 'Израиль', playlistId: 1362507345 },
];

const DEFAULT_CHART_COUNTRY = 'ru';

function resolveChartCountry(code) {
  const want = String(code || '').trim().toLowerCase();
  return (
    CHART_COUNTRIES.find((c) => c.code === want) ||
    CHART_COUNTRIES.find((c) => c.code === DEFAULT_CHART_COUNTRY) ||
    CHART_COUNTRIES[0]
  );
}

module.exports = {
  CHART_COUNTRIES,
  DEFAULT_CHART_COUNTRY,
  resolveChartCountry,
};
