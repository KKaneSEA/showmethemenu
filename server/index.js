import 'dotenv/config'
import { load } from 'cheerio'
import express from 'express'

const app = express()
const port = Number(process.env.PORT || 8787)
const blockedHostnames = new Set(['localhost', '0.0.0.0', '127.0.0.1', '::1'])
const menuLinkPattern = /\b(menu|food|dining|eat|drink|order)\b/i

function validExternalUrl(value) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol)
      && !blockedHostnames.has(url.hostname.toLowerCase())
      && !url.hostname.endsWith('.local')
  } catch {
    return false
  }
}

async function fetchPage(url) {
  if (!validExternalUrl(url)) throw new Error('The selected website is not a valid public URL.')
  const response = await fetch(url, {
    headers: { 'User-Agent': 'ShowMeTheMenu/1.0 (+menu discovery)' },
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  })

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    return fetchPage(new URL(response.headers.get('location'), url).toString())
  }
  if (!response.ok) throw new Error(`The restaurant website returned ${response.status}.`)
  if (!(response.headers.get('content-type') || '').includes('text/html')) {
    throw new Error('This menu is not an HTML page.')
  }
  return { url: response.url, html: await response.text() }
}

function visibleText($, selector) {
  const node = $(selector).first().clone()
  node.find('script, style, noscript, svg, nav, header, footer, form').remove()
  return node.text().replace(/\s+/g, ' ').trim().slice(0, 12_000)
}

function menuCandidates(pageUrl, html) {
  const $ = load(html)
  const links = new Set([pageUrl])
  const origin = new URL(pageUrl).origin
  $('a[href]').each((_, element) => {
    const anchor = $(element)
    if (!menuLinkPattern.test(`${anchor.text()} ${anchor.attr('href')}`)) return
    try {
      const url = new URL(anchor.attr('href'), pageUrl)
      if (url.origin === origin && validExternalUrl(url.toString())) links.add(url.toString())
    } catch { /* Ignore malformed links. */ }
  })
  return [...links].slice(0, 6)
}

function extractMenuText(html) {
  const $ = load(html)
  const menuSection = $('[id*="menu" i], [class*="menu" i], [data-menu]').filter((_, element) => $(element).text().trim().length > 80).first()
  const text = visibleText($, menuSection.length ? menuSection : 'main, body')
  return text.length >= 80 ? text : null
}

function responseOutputText(data) {
  return (data.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === 'output_text')
    .map((item) => item.text)
    .join('')
}

async function openaiResponse(body) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OpenAI search is not configured. Add OPENAI_API_KEY to .env.')

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({ model: process.env.OPENAI_SEARCH_MODEL || 'gpt-5.4-mini', ...body }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error?.message || 'OpenAI request could not be completed.')
  return data
}

async function findOfficialWebsite(restaurant, location) {
  const data = await openaiResponse({
    tools: [{ type: 'web_search' }],
    input: `Find the official website for the restaurant named "${restaurant}" in "${location}". Use web search. Do not return directory, review, delivery, social-media, reservation, or map URLs. Return null if you cannot identify the official restaurant website.`,
    text: {
      format: {
        type: 'json_schema', name: 'official_restaurant_website', strict: true,
        schema: {
          type: 'object', properties: { officialWebsite: { type: ['string', 'null'] } },
          required: ['officialWebsite'], additionalProperties: false,
        },
      },
    },
  })

  try {
    const officialWebsite = JSON.parse(responseOutputText(data)).officialWebsite
    return validExternalUrl(officialWebsite) ? officialWebsite : null
  } catch {
    throw new Error('OpenAI web search returned an invalid website result.')
  }
}

async function normalizeMenuText(pageText, restaurant) {
  const data = await openaiResponse({
    input: `You are preparing a restaurant menu for display. The following is visible text fetched from ${restaurant}'s website. Return only actual menu sections, item names, descriptions, and prices. Remove navigation, marketing copy, contact details, legal text, and unrelated content. If this text does not contain an actual menu, return null.\n\nWEBSITE TEXT:\n${pageText}`,
    text: {
      format: {
        type: 'json_schema', name: 'restaurant_menu', strict: true,
        schema: {
          type: 'object', properties: { menuText: { type: ['string', 'null'] } },
          required: ['menuText'], additionalProperties: false,
        },
      },
    },
  })

  try {
    const menuText = JSON.parse(responseOutputText(data)).menuText
    return typeof menuText === 'string' && menuText.trim().length > 20 ? menuText.trim() : null
  } catch {
    return null
  }
}

app.get('/api/menu-search', async (request, response) => {
  const restaurant = String(request.query.restaurant || '').trim()
  const location = String(request.query.location || '').trim()
  if (!restaurant || !location) return response.status(400).json({ error: 'Enter both a restaurant and city, state, or country.' })

  try {
    const officialWebsite = await findOfficialWebsite(restaurant, location)
    if (!officialWebsite) throw new Error('No restaurant website was found.')
    const homePage = await fetchPage(officialWebsite)
    let menuUrl = null
    let menuText = null

    for (const candidate of menuCandidates(homePage.url, homePage.html)) {
      try {
        const page = candidate === homePage.url ? homePage : await fetchPage(candidate)
        const pageText = extractMenuText(page.html)
        if (!pageText) continue
        const text = await normalizeMenuText(pageText, restaurant)
        if (text) { menuUrl = page.url; menuText = text; break }
      } catch { /* Try the next menu page. */ }
    }

    response.json({ restaurant, officialWebsite: homePage.url, menuUrl, menuText, message: menuText ? null : 'A readable HTML menu was not found on the restaurant website.' })
  } catch (error) {
    response.status(502).json({ error: error.message || 'Menu search failed.' })
  }
})

app.use(express.static('dist'))
app.listen(port, () => console.log(`Menu API listening at http://localhost:${port}`))
