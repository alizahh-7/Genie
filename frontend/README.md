# Genie — consolidated frontend

Next.js frontend for the stored Genie/FastAPI journey. No API secrets are included. Demo and personal stories use the deployed backend, not fabricated local results. Fictional hospice preview is explicitly labelled.

## Windows PowerShell

```powershell
cd frontend
Copy-Item .env.example .env.local
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

Open the localhost address printed by Next.js. Render may need up to 90 seconds to wake. If deploying to Vercel, set `NEXT_PUBLIC_API_URL` to the backend URL and ask the backend owner to add the deployed frontend origin to CORS. This is a replacement frontend; back up the old directory before extracting.

Some API endpoints have response fields marked 'confirm in OpenAPI' in the team's integration guide. Maker request/portal payloads should be verified against the deployed `/openapi.json` before real-person use. No clinical claims; avoid real personal data during demo.
