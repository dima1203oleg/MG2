# Інструкція з розгортання та відкату (Deployment & Rollback Runbook)

## 1. Підготовка чистого середовища

1. Встановити залежності:
   ```bash
   npm ci
   ```
2. Перевірити змінні середовища на основі `.env.example`:
   - `NODE_ENV=production`
   - `PORT=3000`
   - `TICKET_HMAC_SECRET=<32+ випадкових символів>`
   - `MARSHGO_DATA_FILE=/var/lib/marshgo/marshgo-state.json` (або змонтований том у Cloud Run / Docker)
3. Виконати перевірку типів, автотести та production-збірку:
   ```bash
   npm run lint
   npm test
   npm run build
   ```

---

## 2. Запуск у Production

```bash
NODE_ENV=production tsx server.ts
```

Перевірка готовності після запуску:
- Liveness probe: `GET /healthz` → HTTP `200 OK` (`{"status":"ok"}`)
- Readiness probe: `GET /readyz` → HTTP `200 OK` (`{"status":"ready","citiesCount":24}`)
- Статус релізу: `GET /api/v1/admin/release-status`

---

## 3. Процедура безпечного відкату (Rollback)

1. **Контейнерний відкат (Cloud Run / Kubernetes):** перемкнути трафік на попередню верифіковану ревізію контейнера.
2. **Відновлення даних (`marshgo-state.json`):** атомарний механізм запису через `.tmp` + `renameSync` гарантує відсутність частково записаних файлів. Для відновлення зі снепшоту достатньо замінити `data/marshgo-state.json` резервною копією та перезапустити процес.
3. **GitHub Rollback:** використовуйте `git revert <commit_sha>` в окремій гілці з перевіркою `npm test && npm run build`; ніколи не виконуйте `git push --force` у `main`.
