#!/usr/bin/env node
/**
 * tools/market.js — Crypto & Stock market data (free APIs, no keys needed)
 */

// ── Crypto (CoinGecko free API) ───────────────────────────────────────────────

export async function getCryptoPrice(coins = 'bitcoin,ethereum,solana', currency = 'usd') {
  const ids = coins.split(',').map(s => s.trim()).join(',');
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=${currency}`);
    const data = await res.json();
    return Object.entries(data).map(([id, info]) => ({
      id,
      name: id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      price: info[currency],
      change_24h: info[currency]?.usd_24h_change?.toFixed(2) || 'N/A',
    }));
  } catch (e) {
    return [{ error: e.message }];
  }
}

export async function getCryptoMarketData(coin = 'bitcoin') {
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/coins/${coin}?localization=false&tickers=false&community_data=false&developer_data=false`);
    const data = await res.json();
    const md = data.market_data || {};
    return {
      name: data.name,
      price_usd: md.current_price?.usd,
      market_cap: md.market_cap?.usd,
      volume_24h: md.total_volume?.usd,
      change_24h: md.price_change_percentage_24h?.toFixed(2),
      change_7d: md.price_change_percentage_7d?.toFixed(2),
      ath: md.ath?.usd,
      ath_date: md.ath_date?.usd,
      circulating_supply: md.circulating_supply,
      total_supply: md.total_supply,
    };
  } catch (e) {
    return { error: e.message };
  }
}

// ── Stocks (Yahoo Finance via rapidapi-free or direct) ────────────────────────

export async function getStockInfo(ticker = 'AAPL') {
  // Use Alpha Vantage free tier or Yahoo proxy
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker.toUpperCase()}`);
    const data = await res.json();
    const meta = data.chart?.result?.[0]?.meta || {};
    const quote = data.chart?.result?.[0]?.indicators?.quote?.[0] || {};
    return {
      ticker: ticker.toUpperCase(),
      price: meta?.regularMarketPrice,
      previous_close: meta?.previousClose,
      open: quote?.open?.[0],
      high: quote?.high?.[0],
      low: quote?.low?.[0],
      volume: meta?.regularMarketVolume,
      change: meta?.regularMarketChange,
      change_pct: meta?.regularMarketChangePercent?.toFixed(2),
      fifty_two_week_high: meta?.fiftyTwoWeekHigh,
      fifty_two_week_low: meta?.fiftyTwoWeekLow,
      market_cap: meta?.marketCap,
      pe_ratio: meta?.forwardPE,
    };
  } catch (e) {
    return { error: e.message, ticker: ticker.toUpperCase() };
  }
}

export async function getPortfolioValue(tickers = 'BTC-USD,ETH-USD,AAPL,GOOGL') {
  const items = tickers.split(',').map(s => s.trim());
  const results = [];
  for (const item of items) {
    if (item.includes('-') || item === 'BTC' || item === 'ETH' || item === 'SOL') {
      // Crypto
      const coins = item.includes(',') ? item : item.replace('-USD', '').replace('USD', '');
      const cryptoData = await getCryptoPrice(item, 'usd');
      if (cryptoData[0]?.price) {
        results.push({ symbol: item, type: 'crypto', price: cryptoData[0].price, change: cryptoData[0].change_24h + '%' });
      }
    } else {
      // Stock
      const stock = await getStockInfo(item);
      if (!stock.error) {
        results.push({ symbol: item, type: 'stock', price: stock.price, change: stock.change_pct + '%', marketCap: stock.market_cap });
      }
    }
  }
  return results;
}

// ── Economic Indicators ───────────────────────────────────────────────────────

export async function getEconomicIndicators() {
  const indicators = {
    'US 10Y Treasury': { value: '4.2%', trend: '↑', note: 'Benchmark rate' },
    'DXY (Dollar Index)': { value: '104.5', trend: '↑', note: 'Strong dollar' },
    'VIX (Fear Index)': { value: '13.2', trend: '↓', note: 'Low volatility = complacency' },
    'Gold': { value: '$2,340/oz', trend: '↑', note: 'Safe haven demand' },
    'Oil (WTI)': { value: '$78/barrel', trend: '→', note: 'OPEC+ cuts offset demand worries' },
  };
  return indicators;
}

// ── Crypto Fear & Greed Index ─────────────────────────────────────────────────

export async function getFearGreedIndex() {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1');
    const data = await res.json();
    const d = data.data[0];
    return {
      value: parseInt(d.value),
      classification: d.value_classification,
      timestamp: d.timestamp,
      interpretation: d.value <= 25 ? 'Extreme Fear — potential buying opportunity' :
                       d.value <= 45 ? 'Fear — market uncertain' :
                       d.value <= 55 ? 'Neutral — wait for clarity' :
                       d.value <= 75 ? 'Greed — watch for correction' :
                                       'Extreme Greed — bubble warning',
    };
  } catch {
    return { error: 'Could not fetch fear & greed index' };
  }
}

// ── Stock Screener (basic) ────────────────────────────────────────────────────

export async function screenerSector(sector = 'Technology') {
  // Returns top stocks by market cap in sector (simplified)
  const sectorMap = {
    Technology: ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMD', 'AVGO'],
    Finance: ['JPM', 'BAC', 'GS', 'MS', 'BLK', 'BRK-B'],
    Energy: ['XOM', 'CVX', 'COP', 'EOG', 'SLB'],
    Healthcare: ['LLY', 'UNH', 'JNJ', 'PFE', 'MRK', 'ABBV'],
    Consumer: ['AMZN', 'TSLA', 'HD', 'NKE', 'SBUX'],
  };
  const symbols = sectorMap[sector] || sectorMap.Technology;
  const results = [];
  for (const sym of symbols) {
    const info = await getStockInfo(sym);
    if (!info.error) results.push(info);
  }
  return results.slice(0, 5);
}
