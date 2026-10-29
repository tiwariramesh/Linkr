<p align="center">
  <img src="linkr_icon.svg" width="96" height="96" alt="Linkr logo">
</p>

<h1 align="center">Linkr</h1>

<p align="center"><b>Organise your ideas.</b><br>
A self-hosted home for links, notes and session material: spaces, nested folders and live sync across every device.</p>

---

## What it does

- **Spaces and folders.** Each account starts with a Personal space; add more for courses, teams or clients. Inside, folders nest as deep as you like, with colours, emoji icons and favourites.
- **Sessions.** Give any folder a date and a term (a class, workshop, meeting or recurring topic). Finished terms go to the **Archive**, intact and one click away.
- **Fast capture.** One box: paste a link (or several) or type a note and press Enter. The card appears at once; its title, image and type (page, video, PDF, image) fill in a moment later.
- **Drag and drop.** Drag cards onto any folder in the sidebar, reorder them by hand, and drag folders to nest or reorder them. Select several with Ctrl/Cmd-click and move them together.
- **Live sync.** Open Linkr on your laptop, phone and tablet: a change on one appears on the others in well under a second.
- **Accounts.** Anyone can register on your server (or only you, with `REGISTRATION=closed`). Spaces are private to their members.
- **Trash.** Deleted items and folders can be restored for 30 days.
- **Import.** Bookmarks from Chrome, Edge, Firefox, Safari or Raindrop.io (HTML export), or a Pocket export (.zip). Browser folders become Linkr folders and original dates are kept.

### Roadmap

1. ~~Spaces, folders, sessions, drag and drop, live sync~~ (done)
2. Capture anywhere: drop files and images, paste anywhere, command palette (Ctrl+K)
3. Split view: preview pages, videos and PDFs beside rich session notes
4. Highlights and annotations on saved articles
5. Across terms: "run again" templates, where a link was used before, presenter mode, full-text search
6. Shared spaces with roles, notifications, and read-only pages to share a session with students
7. Chrome extension (save to the current session, tab groups ↔ sessions), then AI with your choice of Claude, OpenAI, OpenRouter or Ollama

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

This starts the API server on port 8080 (restarting on changes) and the web app on http://localhost:5173.

| Folder            | What's in it                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `web/`            | The app: React 19, TypeScript, Vite 8, Tailwind CSS 4, shadcn/ui, Zustand, dnd-kit                                      |
| `server/`         | Hono API on Node 24, run straight from TypeScript. SQLite via Drizzle ORM, accounts via Better Auth                     |
| `server/drizzle/` | Database migrations, applied automatically on start. After editing `server/src/db/schema.ts`, run `npm run db:generate` |
| `server/test/`    | API tests against a real server and a throwaway database                                                                |

Before sending a change: `npm run typecheck`, `npm run lint` and `npm test`.

## Credits

Linkr began as a fork of [Faved](https://github.com/denho/faved) by Denis Dvali, and its bookmark importers follow Faved's approach. Both are released under the [MIT licence](LICENSE).
