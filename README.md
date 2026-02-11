# OmniTalk

OmniTalk is an accessibility-first communication app designed for live, in-person meetings. It helps people who are deaf, mute, and blind communicate with each other more naturally through real-time assistive features, so conversations stay inclusive, clear, and easy to follow for everyone in the room.

## Features

- Speech to Text: Converts spoken conversation into live captions so deaf and hard-of-hearing users can follow discussions in real time.
- Sign to Speech: Translates signed input into spoken output to help bridge communication with people who rely on audio.

## Quick Start (Frontend Only)

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
copy .env.example .env
```

3. Set your Deepgram key in `.env`:

```env
EXPO_PUBLIC_DEEPGRAM_API_KEY=your_actual_key_here
```

4. Start Expo:

```bash
npx expo start
```

You can also use:

```bash
npm run start
```

Both start the same Expo dev server.

## Optional Backend (If Needed)

Use this if you want backend APIs/websocket routes enabled.

1. Go to backend folder:

```bash
cd backend
```

2. Install Python dependencies:

```bash
pip install -r requirements.txt
```

3. Start the FastAPI server:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

4. Update backend URLs in `constants/api.ts`:

- Set `WEBSOCKET_URL` to `ws://<your-ip-address>:8000/ws`
- Set `API_URL` to `http://<your-ip-address>:8000`

5. Check it is running:

- `http://<your-ip-address>:8000/`
- `http://<your-ip-address>:8000/health`

## Backend URL/IP Setup

This project currently hardcodes backend URLs in `constants/api.ts`.

- `WEBSOCKET_URL`
- `API_URL`

If you are a different user or running on a different machine, update these to your own backend host.

Quick rule:
- If frontend and backend run on the same computer (web/simulator), `localhost` may work.
- If testing on a physical phone, use your computer's LAN IP on the same Wi-Fi (not `localhost`).

## Useful Commands

- Start: `npx expo start`
- Android: `npm run android`
- iOS: `npm run ios`
- Web: `npm run web`
- Lint: `npm run lint`

## Project Notes

- Current speech-to-text flow runs from frontend directly to Deepgram.
- Backend/multi-user setup is not required for your current flow.

## One-Liner

`npm install` -> set `.env` -> `npx expo start`
