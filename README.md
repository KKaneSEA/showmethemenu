# Show Me the Menu

[Show Me the Menu](https://showmethemenu.vercel.app/) finds a restaurant's official website, looks for a menu page, and presents the readable menu text with a link to the source menu.

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and add the required search credentials.

3. Start the app:

   ```bash
   npm run dev
   ```

   This starts the Vite React app and the local Express API together. Open the local Vite address printed in the terminal.

4. Create a production build:

   ```bash
   npm run build
   ```

## Search and menu flow

1. The user enters a restaurant and a city, state, or country.
2. The app uses Open-Meteo's geocoding endpoint to suggest locations.
3. The server searches for the restaurant's official website.
4. The server checks that site for menu-related pages, extracts visible text from a readable HTML menu, and returns the menu URL and text.
5. Menu links open in a new browser tab.

## API restrictions

The hosted site, [showmethemenu.vercel.app](https://showmethemenu.vercel.app/), cannot safely run a web-search integration from browser code: API credentials must remain on the server and restaurant sites cannot reliably be fetched from the browser because of cross-origin restrictions.

The current search adapter expects `OPENAI_API_KEY` in `.env` and uses the OpenAI Responses API web-search tool to identify the restaurant's official website. Never put the key in the React client or commit `.env`. Web-search calls are billed by OpenAI.

The extractor currently supports public HTML menu pages. PDF menus, image-only menus, JavaScript-rendered menus, blocked sites, and sites with bot protection may not return readable text.

## Deploying to Vercel

The root [`api/menu-search.js`](api/menu-search.js) file exposes the existing Express app as a Vercel Serverless Function, so Vercel serves it at `/api/menu-search` alongside the Vite build.

In Vercel, set the following encrypted environment variables for both Preview and Production, then redeploy:

- `OPENAI_API_KEY`
- `OPENAI_SEARCH_MODEL` (optional; defaults to `gpt-5.4-mini`)

Use `npm run build` as the build command and `dist` as the output directory. Never expose the API key through a `VITE_` variable.

## Project scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite app and local menu API. |
| `npm run api` | Start only the Express menu API on port 8787. |
| `npm run build` | Create a production React build in `dist/`. |
| `npm run start` | Serve the API and existing `dist/` build. |
