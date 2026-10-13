# Frontend — Next.js 16

```bash
npm install
cp .env.example .env.local     # NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
npm run dev                    # http://localhost:3000
npm run lint && npx tsc --noEmit && npm run build
```

- **Next 16 note**: route protection lives in `src/proxy.ts` (the new name for `middleware.ts`), and route
  `params` are Promises (client pages use `useParams()`). Bundled docs: `node_modules/next/dist/docs/`.
- All API calls go through `src/lib/api.ts`. Never call `fetch` elsewhere.
- Strings live in `src/lib/i18n/ar.ts` (source of keys) and `en.ts`. Arabic is the default and RTL.
- Use logical CSS (`ps-*`, `me-*`, `start-*`, `text-start`, `border-e`) so layouts flip with `dir`.
- HR pages are top-level routes; the employee app lives under `src/app/me/`.

See `DESIGN.md` for tokens and components.
