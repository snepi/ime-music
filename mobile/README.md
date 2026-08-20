# IMe Music Mobile (Android)

Companion-клиент для синхронизации библиотеки с ПК по QR / локальной сети.

## v1

- ПК → телефон, только **новые** треки (без дубликатов)
- Одна Wi‑Fi (ПК по кабелю к роутеру — ок)
- Упрощённый UI: библиотека, синк, плеер
- Без yt-dlp / большого редактора тем

## Запуск (dev в браузере)

```bash
cd mobile
npm install
npm run dev
```

Открой `http://localhost:5174`. Для приёма файлов с ПК удобнее сразу Android (Filesystem).

## Android (Capacitor)

Нужны Android Studio и JDK.

```bash
cd mobile
npm install
npm run build
npx cap add android
npm run cap:sync
npm run cap:open
```

На ПК: **Настройки → Инструменты → Синхронизация с телефоном → Показать QR**.  
В приложении: вкладка **Синк** → вставь ссылку с QR → **Забрать новые треки**.

## Протокол

См. `electron/syncServer.cjs`:

- `POST /sync/offer` — список недостающих треков по fingerprint
- `GET /sync/file/:id` — скачивание файла
- `GET /sync/cover/:id` — обложка (опционально)
