#!/usr/bin/env node
/**
 * tools/news.js — News aggregation from multiple RSS feeds + web sources
 */

import https from 'https';

const NEWS_SOURCES = {
  // War & geopolitics
  reuters_war: 'https://www.reutersagency.com/feed/category/war-news/rss/',
  aljazeera: 'https://www.aljazeera.com/xml/rss/all.xml',
  bbc_world: 'http://feeds.bbci.co.uk/news/world/rss.xml',
  dw_world: 'https://rss.dw.com/rdf/rss-en-world',
  ap_news: 'https://rsshub.app/apnews/topics/apf-topnews',
  // Business & markets
  bloomberg: 'https://www.bloomberg.com/markets/news.rss',
  reuters_business: 'https://www.reutersagency.com/feed/business-news/rss/',
  cnbc_markets: 'https://search.cnbc.com/search/searchfullstoryatom.jsp?paramarticleid=24965097',
  // Tech
  techcrunch: 'https://techcrunch.com/feed/',
  theverge: 'https://www.theverge.com/rss/index.xml',
};

export async function fetchRSS(url, count = 10) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'CharacterFlow/1.0 (knowledge-seeking bot)' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const items = [];
        const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi;
        let m;
        while ((m = itemRe.exec(data)) && items.length < count) {
          const block = m[1];
          const title = (block.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] || '';
          const link = (block.match(/<link[^>]*>([^<]+)<\/link>/i) || [])[1] || '';
          const desc = (block.match(/<description[^>]*>([^<]+)<\/description>/i) || [])[1] || '';
          const pubDate = (block.match(/<pubDate[^>]*>([^<]+)<\/pubDate>/i) || [])[1] || '';
          const source = (block.match(/<category[^>]*>([^<]+)<\/category>/i) || [])[1] || '';
          if (title) items.push({
            title: title.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim(),
            link: link.trim(),
            description: desc.replace(/<[^>]+>/g, ' ').trim().substring(0, 250),
            date: pubDate,
            category: source.trim()
          });
        }
        resolve(items);
      });
    });
    req.on('error', () => resolve([]));
    req.setTimeout(8000, () => { req.destroy(); resolve([]); });
  });
}

export async function getNews(category = 'all', count = 15) {
  const categories = {
    all: Object.entries(NEWS_SOURCES).slice(0, 5),
    war: [['Reuters_War', NEWS_SOURCES.reuters_war], ['AlJazeera', NEWS_SOURCES.aljazeera], ['BBC_World', NEWS_SOURCES.bbc_world]],
    business: [['Bloomberg', NEWS_SOURCES.bloomberg], ['Reuters_Biz', NEWS_SOURCES.reuters_business], ['CNBC', NEWS_SOURCES.cnbc_markets]],
    tech: [['TechCrunch', NEWS_SOURCES.techcrunch], ['TheVerge', NEWS_SOURCES.theverge]],
  };

  const sources = categories[category] || categories.all;
  const allItems = [];

  const promises = sources.map(async ([name, url]) => {
    try {
      const items = await fetchRSS(url, 5);
      for (const item of items) allItems.push({ ...item, source: name });
    } catch (_) {}
  });

  await Promise.allSettled(promises);
  return allItems.slice(0, count);
}

export async function getWarNews(count = 10) {
  return getNews('war', count);
}

export async function getMarketNews(count = 10) {
  return getNews('business', count);
}

// ── News summarizer (local, uses keyword extraction) ──────────────────────────

export function summarizeNews(items, maxLength = 400) {
  if (!items || items.length === 0) return 'No news available at this time.';

  let summary = `**Breaking News Summary (${items.length} stories)**\n\n`;
  let current = '';
  for (const item of items) {
    const prefix = `[${item.source}] `;
    if (current.length + prefix.length + item.title.length + item.description.length > maxLength) {
      summary += current + '\n---\n';
      current = '';
    }
    current += `${prefix}${item.title}`;
    if (item.description) current += ` — ${item.description}`;
    current += '\n';
  }
  if (current) summary += current;
  return summary.substring(0, maxLength * 3);
}
