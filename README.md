# Aether: video meetings with a waiting room

MERN + WebRTC + Socket.io. Instant meetings, host-controlled waiting room, mic/camera controls, live chat.

```
aether/
├── render.yaml                  # optional Render Blueprint for the backend
├── package.json                 # root scripts: npm run dev runs both apps
├── server/                      # Node + Express + Socket.io  -> Render / Railway
│   ├── server.js                # HTTP server, CORS, rate limiting, graceful shutdown
│   ├── config/db.js             # MongoDB connection
│   ├── models/Meeting.js        # room ID, hashed host token, join stats (30-day TTL)
│   ├── models/ChatMessage.js    # optional chat history (7-day TTL)
│   ├── routes/meetings.js       # POST /api/meetings, GET /api/meetings/:roomId
│   ├── sockets/index.js         # waiting room, admit/deny, signaling relay, chat
│   ├── utils/ids.js             # room IDs, host-token hashing
│   └── .env.example
└── client/                      # React + Vite  -> Vercel
    ├── vercel.json              # SPA rewrite + camera/mic permissions header
    ├── .env.example             # VITE_BACKEND_URL, optional TURN settings
    └── src/
        ├── config.js            # backend URL + ICE (STUN/TURN) servers
        ├── lib/                 # api.js (REST), socket.js
        ├── hooks/useLocalMedia.js   # getUserMedia with echo cancellation, fallbacks, errors
        ├── hooks/useWebRTC.js       # peer connections, offers/answers/ICE, reconnection
        ├── pages/Home.jsx           # new meeting / join by link
        ├── pages/MeetingPage.jsx    # socket + join flow (prejoin -> waiting -> room)
        └── components/              # Lobby, Room, VideoGrid, VideoTile, Controls,
                                     # Chatbox, PeoplePanel, AdmitToast, CopyLinkButton
```

## How it works

1. **New meeting**: `POST /api/meetings` creates a room ID like `kqf-mzpd-wne` and returns a secret *host token*.
   The browser stores the token; the server stores only its SHA-256 hash. Whoever holds the token is the host.
2. **Joining**: everyone opens `/m/<roomId>`, picks a name, and previews their camera. The host enters directly.
   Guests go to the **waiting room**; the host gets a popup (and a tab-title counter) with **Admit / Deny**.
3. **Calling**: once admitted, the newcomer sends WebRTC offers to everyone already in the room. Socket.io only
   relays signaling; audio/video flows peer to peer (mesh).
4. **Chat**: messages go through Socket.io to the whole room and are stored in MongoDB (set `PERSIST_CHAT=false` for ephemeral chat).

## Run locally

Requirements: Node 18+, MongoDB (local, or a free Atlas cluster).

```bash
npm run install:all
cp server/.env.example server/.env          # edit MONGODB_URI if needed
cp client/.env.example client/.env.local
npm run dev                                  # server :5000, client :5173
```

Test with two browser windows: create a meeting in one, paste the link into a second (use a private window so it
isn't treated as the host), then admit from the first. Camera/mic need HTTPS or `localhost`. To test from a phone
on the same Wi-Fi you need an HTTPS tunnel (e.g. `cloudflared` or `ngrok`) for the client.

## Deploy

Deploy the **backend first** (you need its URL), then the frontend, then come back and set `CLIENT_URL`.

### 1. MongoDB Atlas (free)
1. Create a free M0 cluster, add a database user.
2. Network Access: allow `0.0.0.0/0` (Render/Railway IPs change on the free tiers).
3. Copy the connection string, e.g. `mongodb+srv://user:pass@cluster0.xxxx.mongodb.net/aether`.

### 2. Backend on Render
1. Push this repo to GitHub.
2. Render dashboard: **New + > Web Service**, pick the repo.
   - Root Directory: `server`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Health Check Path: `/health`
   (Or use **New + > Blueprint**, which reads `render.yaml`.)
3. Environment variables: `MONGODB_URI` (Atlas string), `CLIENT_URL` (set a placeholder now, fix in step 4), `NODE_ENV=production`.
4. Deploy. Your backend URL looks like `https://aether-server.onrender.com`. Open `/health`; you should see `{"status":"ok","db":"up"}`.

> Free Render services sleep after ~15 minutes idle and take ~30-60 s to wake. Fine for testing; use a paid
> instance (or Railway) for real meetings. The server keeps live room state in memory, so run **one instance**.

**Railway instead:** New Project > Deploy from GitHub > set the service's Root Directory to `server`, add the same
variables, then Settings > Networking > Generate Domain. Start command is picked up from `npm start`.

### 3. Frontend on Vercel
1. Vercel: **Add New > Project**, import the repo.
2. Root Directory: `client`. Framework preset: Vite (auto-detected; `vercel.json` covers the rest).
3. Environment Variables:
   - `VITE_BACKEND_URL` = your Render/Railway URL, no trailing slash
   - `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` (see TURN below)
4. Deploy. `vercel.json` rewrites all paths to `index.html` so meeting links like `/m/abc-defg-hij` work on refresh.

### 4. Connect them
Back on Render/Railway set `CLIENT_URL` to your Vercel URL (e.g. `https://aether.vercel.app`) and redeploy.
Multiple origins are comma-separated. `VITE_` variables are baked in at build time, so **redeploy the client**
after changing them.

## TURN servers (read this before sharing links widely)

STUN (the free Google servers already configured) works when both people are behind ordinary home routers.
It fails for roughly one in five real-world connections: corporate networks, some mobile carriers, symmetric NATs.
Those calls need a **TURN relay**.

- **Easiest:** a free tier from a hosted TURN provider such as Metered or Twilio. Copy the TURN URL(s), username
  and credential into the three `VITE_TURN_*` variables. Several URLs can be comma-separated
  (`turn:host:80,turn:host:443?transport=tcp,turns:host:443?transport=tcp`).
- **Self-hosted:** run `coturn` on a small VPS with a static username/credential, open UDP/TCP 3478 and 443.

Note that `VITE_TURN_CREDENTIAL` ships to the browser, so use a provider's low-privilege or time-limited credentials,
never a master key. Check connection type in Chrome at `chrome://webrtc-internals` (look for `relay` candidates).

## Limits and next steps

- **Mesh topology**: every participant uploads video to every other. That's fine for about 4-6 people
  (`MAX_PARTICIPANTS`, default 6). For larger meetings move to an SFU (LiveKit, mediasoup).
- **Host leaves**: the meeting continues, but nobody can admit new guests until the host returns (host rights
  follow the browser that created the meeting). Host promotion is a natural extension.
- **Reconnects**: if a guest's connection drops, they re-enter through the waiting room. The host re-enters directly.
- **Single server instance**: live room state is in memory. Horizontal scaling needs the Socket.io Redis adapter
  and shared room state.
- Not included: screen sharing (`getDisplayMedia` + `RTCRtpSender.replaceTrack`), user accounts, recording.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Browser console: CORS error | `CLIENT_URL` on the backend doesn't exactly match the frontend origin (scheme, no trailing slash). Vercel preview URLs differ from production; add them or test on production. |
| "Connecting to the server…" forever | Wrong `VITE_BACKEND_URL`, or Render free instance is waking up. |
| Camera prompt never appears | Page isn't HTTPS, or permission was blocked earlier (lock icon > reset). |
| Everyone joins but video stays on "Connecting…" | Blocked peer-to-peer path: add a TURN server. |
| Link shows 404 on refresh (Vercel) | `vercel.json` missing from the `client` root. |
