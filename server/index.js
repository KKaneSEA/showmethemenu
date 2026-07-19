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

async function googleSearch(query) {
  const key = process.env.GOOGLE_SEARCH_API_KEY
  const cx = process.env.GOOGLE_SEARCH_ENGINE_ID
  if (!key || !cx) throw new Error('Google search is not configured. Add GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID to .env.')

  const url = new URL('https://customsearch.googleapis.com/customsearch/v1')
  url.search = new URLSearchParams({ key, cx, q: query, num: '5', safe: 'active' }).toString()
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error('Google search could not be completed.')
  return ((await response.json()).items || []).filter((item) => validExternalUrl(item.link))
}

app.get('/api/menu-search', async (request, response) => {
  const restaurant = String(request.query.restaurant || '').trim()
  const location = String(request.query.location || '').trim()
  if (!restaurant || !location) return response.status(400).json({ error: 'Enter both a restaurant and city, state, or country.' })

  try {
    const officialWebsite = (await googleSearch(`${restaurant} ${location} official restaurant website`))[0]?.link
    if (!officialWebsite) throw new Error('No restaurant website was found.')
    const homePage = await fetchPage(officialWebsite)
    let menuUrl = null
    let menuText = null

    for (const candidate of menuCandidates(homePage.url, homePage.html)) {
      try {
        const page = candidate === homePage.url ? homePage : await fetchPage(candidate)
        const text = extractMenuText(page.html)
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
