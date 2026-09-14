#!/usr/bin/env node
/**
 * tools/web.js — Web scraping & search tools for all characters
 */

import https from 'https';
import { URL } from 'url';

// ── DuckDuckGo text search (no API key needed) ────────────────────────────────

export async function ddgSearch(query, maxResults = 10) {
  return new Promise((resolve, reject) => {
    const q = encodeURIComponent(query);
    const options = {
      hostname: 'duckduckgo.com',
      path: `/html/?q=${q}&format=json`,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    };
    let data = '';
    const req = https.get(options, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        const redirect = new URL(res.headers.location, 'https://duckduckgo.com');
        ddgSearchRaw(redirect.pathname + redirect.search, options, resolve, reject);
        return;
      }
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const results = (json.Results || []).map(r => ({
            text: r.text,
            first_url: r.first_url,
          })).slice(0, maxResults);
          resolve(results);
        } catch (e) {
          // Fallback: parse HTML
          resolve(parseDDGHTML(data, maxResults));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Search timeout')); });
  });
}

function ddgSearchRaw(path, baseOptions, resolve, reject) {
  const options = { ...baseOptions, path };
  let data = '';
  const req = https.get(options, (res) => {
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try { resolve(JSON.parse(data).Results.slice(0, 10).map(r => ({ text: r.text, first_url: r.first_url }))); }
      catch (e) { resolve([]); }
    });
  });
  req.on('error', () => resolve([]));
  req.setTimeout(10000, () => { req.destroy(); resolve([]); });
}

function parseDDGHTML(html, maxResults) {
  const results = [];
  const re = /<a[^>]+href="([^"]+)"[^>]*>(?:<strong>)?([^<]+)(?:<\/strong>)?(?:<[^>]+>)?([^{]*?)<\//g;
  let m;
  while ((m = re.exec(html)) && results.length < maxResults) {
    results.push({ text: m[3]?.trim().substring(0, 200) || '', first_url: m[1] });
  }
  return results;
}

// ── Fetch webpage content ─────────────────────────────────────────────────────

export async function fetchWebpage(url, maxLen = 3000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    };
    let data = '';
    const req = https.get(options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchWebpage(res.headers.location || url, maxLen).then(resolve).catch(reject);
        return;
      }
      res.setEncoding('utf8');
      res.on('data', chunk => {
        data += chunk;
        if (data.length > maxLen * 2) res.destroy();
      });
      res.on('end', () => {
        // Strip HTML tags
        const text = data.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, maxLen);
        resolve(text || '(no extractable text)');
      });
    });
    req.on('error', (e) => reject(e));
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Fetch timeout')); });
  });
}

// ── Search engines ────────────────────────────────────────────────────────────

export async function searchGoogle(query, maxResults = 10) {
  return new Promise((resolve) => {
    const q = encodeURIComponent(query);
    const options = {
      hostname: 'www.google.com',
      path: `/search?q=${q}&num=${maxResults}`,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    };
    let data = '';
    const req = https.get(options, (res) => {
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const results = [];
        const re = /<h3[^>]*><a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a><\/h3>.*?<span[^>]*>([^<]+)<\/span>/gs;
        let m;
        while ((m = re.exec(data)) && results.length < maxResults) {
          results.push({ title: m[2]?.trim(), url: m[1], snippet: (m[3] || '').trim() });
        }
        // Fallback regex
        if (results.length === 0) {
          const altRe = /<a[^>]*href="([^"]+)"[^>]*>(?:<b>|<strong>)([^<]+)(?:<\/b>|<\/strong>)?<\/a>[^<]*<span[^>]*>([^<]*)/g;
          let m2;
          while ((m2 = altRe.exec(data)) && results.length < maxResults) {
            results.push({ title: m2[2]?.trim(), url: m2[1], snippet: (m2[3] || '').trim() });
          }
        }
        resolve(results);
      });
    });
    req.on('error', () => resolve([]));
    req.setTimeout(10000, () => { req.destroy(); resolve([]); });
  });
}

// ── Wikipedia ─────────────────────────────────────────────────────────────────

export async function wikiSearch(query, maxResults = 5) {
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=${maxResults}&format=json&origin=*`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    // data = [query, titles[], urls[], descriptions[]]
    const results = [];
    for (let i = 0; i < Math.min(data[1]?.length || 0, maxResults); i++) {
      results.push({
        title: data[1][i],
        url: data[2][i],
        snippet: (data[3]?.[i] || '').substring(0, 300),
      });
    }
    return results;
  } catch (e) {
    return [];
  }
}

export async function wikiGetContent(title) {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=text&format=json&origin=*`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    const html = data.parse?.text?.['*'] || '';
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return text.substring(0, 4000);
  } catch (e) {
    return null;
  }
}

// ── RSS/Atom feed reader ──────────────────────────────────────────────────────

const NEWS_FEEDS = {
  Reuters: 'https://www.reutersagency.com/feed/',
  BBC_World: 'http://feeds.bbci.co.uk/news/world/rss.xml',
  AlJazeera: 'https://www.aljazeera.com/xml/rss/all.xml',
  CNBC: 'https://www.cnbc.com/id/100727362/device/rss/rss.html',
  GuardWorld: 'https://www.theguardian.com/world/rss',
  DW_World: 'https://rss.dw.com/rdf/rss-en-world',
  NPR_World: 'https://feeds.npr.org/1003/rss.xml',
};

export async function fetchNewsFeed(source = 'Reuters', count = 10) {
  const url = NEWS_FEEDS[source] || NEWS_FEEDS.Reuters;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const text = await res.text();
    const items = [];
    // Parse RSS <item> blocks
    const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    let m;
    while ((m = itemRe.exec(text)) && items.length < count) {
      const block = m[1];
      const title = (block.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] || '';
      const link = (block.match(/<link[^>]*>([^<]+)<\/link>/i) || block.match(/<guid[^>]*>([^<]+)<\/guid>/i) || [])[1] || '';
      const desc = (block.match(/<description[^>]*>([^<]+)<\/description>/i) || [])[1] || '';
      const pubDate = (block.match(/<pubDate[^>]*>([^<]+)<\/pubDate>/i) || [])[1] || '';
      if (title) items.push({ title: title.trim(), link: link.trim(), description: desc.replace(/<[^>]+>/g, '').trim().substring(0, 200), date: pubDate });
    }
    return items;
  } catch (e) {
    return [{ error: `Failed to fetch ${source}: ${e.message}` }];
  }
}

export async function getAllNews(count = 15) {
  const sources = Object.keys(NEWS_FEEDS);
  const results = [];
  const promises = sources.map(async (src) => {
    try {
      const items = await fetchNewsFeed(src, 3);
      for (const item of items) results.push({ ...item, source: src });
    } catch (_) {}
  });
  await Promise.allSettled(promises);
  return results.slice(0, count);
}
