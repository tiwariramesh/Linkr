<p align="center">
  <img src="linkr_icon.svg" width="96" height="96" alt="Linkr logo">
</p>

<h1 align="center">Linkr</h1>

<p align="center"><b>Organise your ideas.</b><br>
Save links and notes, sort them with nested tags, and keep everything in sync on every device. Self-hosted, open source.</p>

---

## What it does

- **Accounts.** Anyone can register on your server (or only you, with `REGISTRATION=closed`). Each person's links, notes and tags are private to their account.
- **Live sync.** Sign in on your laptop, phone and tablet: a change on one shows up on the others within a second, without reloading.
- **Links with previews.** Paste a URL and Linkr fetches the title, description and preview image. Duplicates are flagged.
- **Nested tags.** `Work/Research/AI` creates the whole path. Tags have colours and can be pinned, and items from child tags roll up into their parents.
- **Fast UI.** Card, list and table layouts, instant search, sorting and bulk actions. Works on phones and installs as an app (PWA).
- **Import.** Bring bookmarks from Chrome, Edge, Firefox, Safari or Raindrop.io (HTML export), or a Pocket export (.zip). Folders become nested tags and original dates are kept.

### Coming next

- Notes with embedded YouTube videos, images and saved articles
- Sharing links and notes with other accounts, with notifications
- Chrome extension
- AI features (summaries, auto-tagging) with your choice of provider: Claude, OpenAI, OpenRouter, or a local model through Ollama

## Run it

Requires [Node.js](https://nodejs.org) 24 or newer. No database server, Docker or admin rights needed: the database is a single SQLite file.

```sh
git clone https://github.com/tiwariramesh/Linkr.git
cd Linkr
npm install
npm run build
npm start
```

Open http://localhost:8080 and create your account.

To change the port, the public address or registration, copy `.env.example` to `.env` and edit it. All settings are optional and explained in that file.

## Reach it from all your devices

Linkr listens only on this computer by default (`HOST=127.0.0.1`). The simplest way to reach it from anywhere, over HTTPS and without opening router ports, is a free [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) on a domain whose DNS is on Cloudflare:

1. Download `cloudflared-windows-amd64.exe` (or the build for your OS) from the [cloudflared releases](https://github.com/cloudflare/cloudflared/releases). It runs without installing.
2. Sign in and create the tunnel:
   ```sh
   cloudflared tunnel login
   cloudflared tunnel create linkr
   cloudflared tunnel route dns linkr linkr.example.com
   ```
3. Run it, pointing at Linkr:
   ```sh
   cloudflared tunnel run --url http://localhost:8080 linkr
   ```
4. In `.env`, set `BASE_URL=https://linkr.example.com` and restart Linkr.

The computer running Linkr must stay on and awake for other devices to reach it.

## Update

```sh
git pull
npm install
npm run build
```

Then restart Linkr. Database changes are applied automatically on start.

## Back up

Everything lives in the `data` folder: the database (`linkr.db`), cached preview images and the generated sign-in secret. Stop Linkr and copy that folder.

## Develop

```sh
npm run dev
```

This starts the API server on port 8080 (restarting on changes) and the Vite dev server on http://localhost:5173.

| Folder | What's in it |
|---|---|
| `frontend/` | React 19 + TypeScript + Vite, Tailwind CSS 4, shadcn/ui components, MobX |
| `server/` | Hono API on Node 24, run straight from TypeScript. SQLite via Drizzle ORM, accounts via Better Auth |
| `server/drizzle/` | Database migrations. After editing `server/src/db/schema.ts`, run `npm run db:generate` |

Before sending a change: `npm run typecheck` and `npm run check -w frontend`.

## Credits

Linkr is built on [Faved](https://github.com/denho/faved) by Denis Dvali. The interface comes from Faved; the server was rewritten in TypeScript to add accounts and sync. Both are released under the [MIT licence](LICENSE).
