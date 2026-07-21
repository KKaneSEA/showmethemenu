# Show Me the Menu

[Show Me the Menu](https://showmethemenu.vercel.app/) is a consumer web app that helps diners quickly locate a restaurant's actual menu. Enter a restaurant name and location; the app finds its official site, identifies a readable menu, and presents the menu text with direct links to the source.

Built for the **Apps for Your Life** track of OpenAI Build Week.

## What it does

- Worldwide city, state, and country suggestions powered by Open-Meteo geocoding.
- Server-side OpenAI web search finds a restaurant's official website.
- Searches the restaurant site for menu pages, including Dinner, Food, Le Déjeuner, and Le Dîner pages.
- Extracts readable HTML menus and linked/embedded PDF menus into structured sections, dishes, prices, and descriptions.
- Prioritizes live Toast Tab menus and provides direct links to Toast and Square menus when they are found.
- Offers links to other menu types when a restaurant site provides more than one menu.
- Keeps API credentials server-side; the browser never receives the OpenAI key.

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and add the required search credentials:

   ```bash
   OPENAI_API_KEY=your_key_here
   # Optional; defaults to gpt-5.4-mini
   OPENAI_SEARCH_MODEL=gpt-5.4-mini
   ```

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
3. The server uses OpenAI Responses API web search to locate the restaurant's official website.
4. The server checks menu-related pages and linked or embedded PDFs.
5. It returns structured menu content when a readable menu is available. Toast Tab is treated as the source of truth for a live Toast menu; Square and Toast links open in a new tab.
6. When a site offers multiple menu types, the result includes links to the alternatives.

## API restrictions

The hosted site, [showmethemenu.vercel.app](https://showmethemenu.vercel.app/), cannot safely run a web-search integration from browser code: API credentials must remain on the server and restaurant sites cannot reliably be fetched from the browser because of cross-origin restrictions.

The current search adapter expects `OPENAI_API_KEY` in `.env` and uses the OpenAI Responses API web-search tool to identify the restaurant's official website. Never put the key in the React client or commit `.env`. Web-search calls are billed by OpenAI.

The extractor supports public HTML pages and linked or embedded PDFs. Image-only menus, JavaScript-rendered menus, blocked sites, and sites with bot protection may not return readable text. Menu content is always linked back to its source so diners can verify the current offering.

## Build Week: Codex collaboration

This project was developed collaboratively in Codex with GPT-5.6. Codex accelerated the implementation of the React interface, responsive layout, the desktop eyes-trail interaction, the OpenAI-powered menu discovery flow, PDF extraction, Toast/Square fallbacks, and the Vercel serverless deployment path.

Product and engineering decisions made during the collaboration include:

- Keeping the OpenAI API key exclusively on the server.
- Using the restaurant's official website as the primary source instead of Google APIs.
- Showing a live Toast or Square link rather than attempting to reproduce JavaScript-rendered ordering menus.
- Providing source links for every result and opening them in a new tab.

## Project scripts

| Command         | Purpose                                       |
| --------------- | --------------------------------------------- |
| `npm run dev`   | Start the Vite app and local menu API.        |
| `npm run api`   | Start only the Express menu API on port 8787. |
| `npm run build` | Create a production React build in `dist/`.   |
| `npm run start` | Serve the API and existing `dist/` build.     |
