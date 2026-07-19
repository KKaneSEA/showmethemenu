import "dotenv/config";
import { load } from "cheerio";
import express from "express";
import { PDFParse } from "pdf-parse";

const app = express();
const port = Number(process.env.PORT || 8787);
const blockedHostnames = new Set(["localhost", "0.0.0.0", "127.0.0.1", "::1"]);
const menuLinkPattern =
  /\b(menu|food|dining|dinner|lunch|brunch|breakfast|eat|drink|order|casse-cro[uû]te|carte|le\s+déjeuner|le\s+dejeuner|le\s+dîner|le\s+diner)\b/i;

function validExternalUrl(value) {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !blockedHostnames.has(url.hostname.toLowerCase()) &&
      !url.hostname.endsWith(".local")
    );
  } catch {
    return false;
  }
}

async function fetchPage(url) {
  if (!validExternalUrl(url))
    throw new Error("The selected website is not a valid public URL.");
  const response = await fetch(url, {
    headers: { "User-Agent": "ShowMeTheMenu/1.0 (+menu discovery)" },
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    return fetchPage(new URL(response.headers.get("location"), url).toString());
  }
  if (!response.ok)
    throw new Error(`The restaurant website returned ${response.status}.`);
  if (!(response.headers.get("content-type") || "").includes("text/html")) {
    throw new Error("This menu is not an HTML page.");
  }
  return { url: response.url, html: await response.text() };
}

function visibleText($, selector) {
  const node = $(selector).first().clone();
  node.find("script, style, noscript, svg, nav, header, footer, form").remove();
  return node.text().replace(/\s+/g, " ").trim().slice(0, 12_000);
}

function menuLinks(pageUrl, html) {
  const $ = load(html);
  const links = new Map();
  const origin = new URL(pageUrl).origin;
  $("a[href]").each((_, element) => {
    const anchor = $(element);
    if (!menuLinkPattern.test(`${anchor.text()} ${anchor.attr("href")}`))
      return;
    try {
      const url = new URL(anchor.attr("href"), pageUrl);
      const label = anchor.text().replace(/\s+/g, " ").trim();
      if (
        url.origin === origin &&
        validExternalUrl(url.toString()) &&
        !links.has(url.toString())
      ) {
        links.set(url.toString(), label || "View menu");
      }
    } catch {
      /* Ignore malformed links. */
    }
  });

  return [...links].map(([url, label]) => ({ url, label }));
}

function menuCandidates(pageUrl, html) {
  const links = menuLinks(pageUrl, html).map((link) => link.url);

  const conventionalMenuPaths = [
    "/menu",
    "/dinner-menu",
    "/dinner",
    "/food",
  ].map((path) => new URL(path, pageUrl).toString());

  return [...new Set([...links, ...conventionalMenuPaths, pageUrl])].slice(
    0,
    10,
  );
}

function pdfMenuCandidates(pageUrl, html) {
  const $ = load(html);
  const links = new Set();

  $("a[href], iframe[src], embed[src], object[data]").each((_, element) => {
    try {
      const source =
        $(element).attr("href") ||
        $(element).attr("src") ||
        $(element).attr("data");
      const url = new URL(source, pageUrl);
      if (
        validExternalUrl(url.toString()) &&
        url.pathname.toLowerCase().endsWith(".pdf")
      ) {
        links.add(url.toString());
      }
    } catch {
      /* Ignore malformed PDF links. */
    }
  });

  return [...links].slice(0, 4);
}

function squareMenuUrl(pageUrl, html) {
  const $ = load(html);
  let foundUrl = null;

  $("a[href]").each((_, element) => {
    if (foundUrl) return;
    try {
      const url = new URL($(element).attr("href"), pageUrl);
      const label = `${$(element).text()} ${url.pathname}`;
      if (url.hostname.endsWith(".square.site") && menuLinkPattern.test(label))
        foundUrl = url.toString();
    } catch {
      /* Ignore malformed Square links. */
    }
  });

  return foundUrl;
}

function toastMenuUrl(pageUrl, html) {
  const $ = load(html);
  let foundUrl = null;

  $("a[href]").each((_, element) => {
    if (foundUrl) return;
    try {
      const url = new URL($(element).attr("href"), pageUrl);
      if (
        url.hostname === "order.toasttab.com" ||
        url.hostname.endsWith(".toasttab.com")
      ) {
        foundUrl = url.toString();
      }
    } catch {
      /* Ignore malformed Toast links. */
    }
  });

  return foundUrl;
}

async function extractPdfText(url) {
  if (!validExternalUrl(url)) return null;
  const response = await fetch(url, {
    headers: { "User-Agent": "ShowMeTheMenu/1.0 (+menu discovery)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return null;

  const file = Buffer.from(await response.arrayBuffer());
  if (file.length === 0 || file.length > 15 * 1024 * 1024) return null;

  const parser = new PDFParse({ data: file });
  try {
    const result = await parser.getText();
    return result.text.replace(/\s+/g, " ").trim().slice(0, 20_000) || null;
  } finally {
    await parser.destroy();
  }
}

function extractMenuText(html) {
  const $ = load(html);
  const menuSection = $('[id*="menu" i], [class*="menu" i], [data-menu]')
    .filter((_, element) => $(element).text().trim().length > 80)
    .first();
  const text = visibleText($, menuSection.length ? menuSection : "main, body");
  return text.length >= 80 ? text : null;
}

function responseOutputText(data) {
  return (data.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .join("");
}

async function openaiResponse(body) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey)
    throw new Error(
      "OpenAI search is not configured. Add OPENAI_API_KEY to .env.",
    );

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      model: process.env.OPENAI_SEARCH_MODEL || "gpt-5.4-mini",
      ...body,
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      data?.error?.message || "OpenAI request could not be completed.",
    );
  return data;
}

async function findOfficialWebsite(restaurant, location) {
  const data = await openaiResponse({
    tools: [{ type: "web_search" }],
    input: `Find the official website for the restaurant named "${restaurant}" in "${location}". Use web search. Do not return directory, review, delivery, social-media, reservation, or map URLs. Return null if you cannot identify the official restaurant website.`,
    text: {
      format: {
        type: "json_schema",
        name: "official_restaurant_website",
        strict: true,
        schema: {
          type: "object",
          properties: { officialWebsite: { type: ["string", "null"] } },
          required: ["officialWebsite"],
          additionalProperties: false,
        },
      },
    },
  });

  try {
    const officialWebsite = JSON.parse(
      responseOutputText(data),
    ).officialWebsite;
    return validExternalUrl(officialWebsite) ? officialWebsite : null;
  } catch {
    throw new Error("OpenAI web search returned an invalid website result.");
  }
}

async function normalizeMenuText(pageText, restaurant) {
  const data = await openaiResponse({
    input: `You are preparing a restaurant menu for display. The following is visible text fetched from ${restaurant}'s website. Organize it into menu sections and items. Preserve every item name, price, option, and description exactly where possible. Keep variant pricing (such as Chicken 15; Prawns 18) together in the price field. Remove navigation, marketing copy, contact details, legal text, and unrelated content. Business hours, opening times, and schedules are never a menu. If this text does not contain an actual menu, return an empty sections array.\n\nWEBSITE TEXT:\n${pageText}`,
    text: {
      format: {
        type: "json_schema",
        name: "restaurant_menu",
        strict: true,
        schema: {
          type: "object",
          properties: {
            sections: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        price: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["name", "price", "description"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["title", "items"],
                additionalProperties: false,
              },
            },
          },
          required: ["sections"],
          additionalProperties: false,
        },
      },
    },
  });

  try {
    const sections = JSON.parse(responseOutputText(data)).sections;
    return Array.isArray(sections) &&
      sections.some((section) => section.items?.length)
      ? sections
      : null;
  } catch {
    return null;
  }
}

function isActualMenu(sections) {
  const titles = sections
    .map((section) => section.title.trim())
    .filter(Boolean);
  const items = sections.flatMap((section) => section.items || []);
  const itemText = items
    .map((item) => `${item.name} ${item.price} ${item.description}`)
    .join(" ");

  return (
    titles.length > 0 &&
    !titles.every((title) => /\b(hours?|schedule)\b/i.test(title)) &&
    !(items.length <= 2 && /\b(corkage|privacy|cookie|terms)\b/i.test(itemText))
  );
}

async function findMenuPage(restaurant, officialWebsite, candidateUrls) {
  const data = await openaiResponse({
    tools: [{ type: "web_search" }],
    input: `Find the menu page for ${restaurant}. The official restaurant website is ${officialWebsite}. First choose a menu-tab URL from this list of links found on the official website: ${candidateUrls.join(", ") || "(none found)"}. If no menu-tab URL is available, search only the official website in this exact fallback order: a page titled or clearly serving as "Le Déjeuner", then "Le Dîner", then "Dinner Menu", then "Dinner", then "Food". Return only a URL on the exact same official website domain, or null.`,
    text: {
      format: {
        type: "json_schema",
        name: "restaurant_menu_page",
        strict: true,
        schema: {
          type: "object",
          properties: { menuUrl: { type: ["string", "null"] } },
          required: ["menuUrl"],
          additionalProperties: false,
        },
      },
    },
  });

  try {
    const menuUrl = JSON.parse(responseOutputText(data)).menuUrl;
    if (!validExternalUrl(menuUrl)) return null;
    return new URL(menuUrl).origin === new URL(officialWebsite).origin
      ? menuUrl
      : null;
  } catch {
    return null;
  }
}

app.get("/api/menu-search", async (request, response) => {
  const restaurant = String(request.query.restaurant || "").trim();
  const location = String(request.query.location || "").trim();
  if (!restaurant || !location)
    return response
      .status(400)
      .json({ error: "Enter both a restaurant and city, state, or country." });

  try {
    const officialWebsite = await findOfficialWebsite(restaurant, location);
    if (!officialWebsite) throw new Error("No restaurant website was found.");
    const homePage = await fetchPage(officialWebsite);
    let menuUrl = null;
    let menuSections = null;
    const squareUrl = squareMenuUrl(homePage.url, homePage.html);
    let toastUrl = toastMenuUrl(homePage.url, homePage.html);

    // Toast is the restaurant's live ordering menu. Prefer it over short menu
    // teasers or business details copied onto the restaurant's own website.
    if (toastUrl) {
      return response.json({
        restaurant,
        officialWebsite: homePage.url,
        menuUrl: null,
        menuSections: null,
        squareMenuUrl: squareUrl,
        toastMenuUrl: toastUrl,
        otherMenus: [],
        message: "Toast menu found for this restaurant.",
      });
    }

    const pdfCandidates = new Set();
    const discoveredMenuLinks = menuLinks(homePage.url, homePage.html);
    const candidates = menuCandidates(homePage.url, homePage.html);
    const selectedMenuUrl = await findMenuPage(
      restaurant,
      homePage.url,
      candidates,
    );
    // A homepage often has a short menu teaser. Check dedicated menu pages before it,
    // so a teaser cannot be mistaken for the restaurant's full menu.
    const dedicatedCandidates = candidates.filter(
      (url) => url !== homePage.url,
    );
    const preferredMenuUrl =
      selectedMenuUrl && selectedMenuUrl !== homePage.url
        ? selectedMenuUrl
        : null;
    const pagesToCheck = [
      ...new Set(
        [preferredMenuUrl, ...dedicatedCandidates, homePage.url].filter(
          Boolean,
        ),
      ),
    ];

    for (const candidate of pagesToCheck) {
      try {
        const page =
          candidate === homePage.url ? homePage : await fetchPage(candidate);
        toastUrl ||= toastMenuUrl(page.url, page.html);
        const pagePdfCandidates = pdfMenuCandidates(page.url, page.html);
        pagePdfCandidates.forEach((url) =>
          pdfCandidates.add(url),
        );
        for (const pdfUrl of pagePdfCandidates) {
          const pdfText = await extractPdfText(pdfUrl);
          if (!pdfText) continue;
          const sections = await normalizeMenuText(pdfText, restaurant);
          if (sections && isActualMenu(sections)) {
            menuUrl = pdfUrl;
            menuSections = sections;
            break;
          }
        }
        if (menuSections) break;
        const pageText = extractMenuText(page.html);
        if (!pageText) continue;
        const sections = await normalizeMenuText(pageText, restaurant);
        if (sections && isActualMenu(sections)) {
          menuUrl = page.url;
          menuSections = sections;
          break;
        }
      } catch {
        /* Try the next menu page. */
      }
    }

    if (!menuSections) {
      for (const pdfUrl of pdfCandidates) {
        try {
          const pdfText = await extractPdfText(pdfUrl);
          if (!pdfText) continue;
          const sections = await normalizeMenuText(pdfText, restaurant);
          if (sections && isActualMenu(sections)) {
            menuUrl = pdfUrl;
            menuSections = sections;
            break;
          }
        } catch {
          /* Try the next linked PDF. */
        }
      }
    }

    response.json({
      restaurant,
      officialWebsite: homePage.url,
      menuUrl,
      menuSections,
      squareMenuUrl: squareUrl,
      toastMenuUrl: toastUrl,
      otherMenus:
        menuSections && discoveredMenuLinks.length > 1
          ? discoveredMenuLinks
              .filter((link) => link.url !== menuUrl && link.url !== homePage.url)
              .slice(0, 5)
          : [],
      message: menuSections
        ? null
        : squareUrl
          ? "Square menu found for this restaurant."
          : toastUrl
            ? "Toast menu found for this restaurant."
            : "A readable HTML or PDF menu was not found on the restaurant website.",
    });
  } catch (error) {
    response
      .status(502)
      .json({ error: error.message || "Menu search failed." });
  }
});

export default app;

// Vercel imports this app through api/menu-search.js. Keep the standalone
// listener only for local development and other non-Vercel hosts.
if (!process.env.VERCEL) {
  app.use(express.static("dist"));
  app.listen(port, () =>
    console.log(`Menu API listening at http://localhost:${port}`),
  );
}
