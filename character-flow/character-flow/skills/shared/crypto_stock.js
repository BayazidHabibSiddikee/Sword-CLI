#!/usr/bin/env node
/**
 * crypto_stock.js — Live market data skills for trading/investment characters.
 * Uses CoinGecko API and Yahoo Finance.
 */

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'get_crypto_price',
      description: 'Get live cryptocurrency price in USD. Supports Bitcoin, Ethereum, Solana, etc.',
      parameters: {
        type: 'object',
        properties: {
          coin: { type: 'string', description: 'Coin ID: bitcoin, ethereum, solana, cardano, dogecoin, etc.' },
        },
        required: ['coin'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_stock_quote',
      description: 'Get live stock price and basic info. Supports tickers like AAPL, TSLA, GOOGL.',
      parameters: {
        type: 'object',
        properties: {
          ticker: { type: 'string', description: 'Stock ticker symbol (e.g. AAPL, TSLA, MSFT)' },
        },
        required: ['ticker'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_fear_greed_index',
      description: 'Get the Crypto Fear & Greed Index (0=extreme fear, 100=extreme greed).',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_market_cap_rank',
      description: 'Get top cryptocurrencies by market cap. Returns ranked list with prices.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Number of coins to return (default 10)', default: 10 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_coin_history',
      description: 'Get historical price data for a cryptocurrency over N days.',
      parameters: {
        type: 'object',
        properties: {
          coin: { type: 'string', description: 'Coin ID' },
          days: { type: 'integer', description: 'Number of days of history (1-30)', default: 7 },
        },
        required: ['coin'],
      },
    },
  },
];

const COINGECKO = 'https://api.coingecko.com/api/v3';
const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';

async function fetchJSON(url, timeout = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function execute(toolName, args) {
  try {
    if (toolName === 'get_crypto_price') {
      const data = await fetchJSON(`${COINGECKO}/simple/price?ids=${args.coin}&vs_currencies=usd`);
      const price = data[args.coin]?.usd;
      return JSON.stringify({ coin: args.coin, price_usd: price, timestamp: new Date().toISOString() });
    }
    else if (toolName === 'get_stock_quote') {
      const data = await fetchJSON(`${YAHOO_BASE}${args.ticker.toUpperCase()}`);
      const meta = data?.chart?.result?.[0]?.meta || {};
      const last = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(Boolean).pop();
      return JSON.stringify({ ticker: args.ticker, price: last, previousClose: meta?.previousClose, marketCap: meta?.marketCap, timestamp: new Date().toISOString() });
    }
    else if (toolName === 'get_fear_greed_index') {
      const data = await fetchJSON('https://api.alternative.me/fng/?limit=1');
      const d = data.data?.[0];
      return JSON.stringify({ value: parseInt(d.value), classification: d.value_classification, timestamp: d.timestamp });
    }
    else if (toolName === 'get_market_cap_rank') {
      const data = await fetchJSON(`${COINGECKO}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${args.limit}&page=1`);
      return JSON.stringify({ coins: data.map((c, i) => ({ rank: i+1, id: c.id, name: c.name, symbol: c.symbol, price: c.current_price, marketCap: c.market_cap, change24h: c.price_change_percentage_24h })) });
    }
    else if (toolName === 'get_coin_history') {
      const data = await fetchJSON(`${COINGECKO}/coins/${args.coin}/market_chart?vs_currency=usd&days=${args.days}`);
      const prices = data.prices?.map(p => ({ date: new Date(p[0]).toISOString(), price: p[1] })) || [];
      return JSON.stringify({ coin: args.coin, days: args.days, data_points: prices.length, sample: prices.slice(0, 5) });
    }
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
  return JSON.stringify({ error: 'Unknown tool' });
}
