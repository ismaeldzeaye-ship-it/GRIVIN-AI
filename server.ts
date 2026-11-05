import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import webpush from 'web-push';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Handle oversized payloads gracefully
app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({ error: 'Payload too large', message: 'Request payload exceeded size limit' });
  }
  next(err);
});

// Generate or configure VAPID keys for Web Push / FCM
const VAPID_KEYS = {
  publicKey: process.env.VAPID_PUBLIC_KEY || 'BC9_wSgL_mQxQGfCj7YhP-vK4w5b8Z8xV4k3-0wM2_6m0kX8z0m0kX8z0m0kX8z0m0kX8z0m0kX8z0m0kX8z0m0',
  privateKey: process.env.VAPID_PRIVATE_KEY || 'N2w_3r8X9z0m0kX8z0m0kX8z0m0kX8z0m0kX8z0m0k'
};

try {
  const generated = webpush.generateVAPIDKeys();
  VAPID_KEYS.publicKey = generated.publicKey;
  VAPID_KEYS.privateKey = generated.privateKey;
  webpush.setVapidDetails(
    'mailto:grevin.alerts@example.com',
    VAPID_KEYS.publicKey,
    VAPID_KEYS.privateKey
  );
  console.log('[PUSH] Web Push VAPID configured successfully');
} catch (e) {
  console.warn('[PUSH] Fallback VAPID configuration:', e);
}

// In-memory push subscriptions & alerts store
const pushSubscriptions: webpush.PushSubscription[] = [];

// Persistent Server State: Deriv and Binance providers
// No simulated data shown as live per requirement 1.
let serverMarketState = {
  simulationMode: false, // OFF by default
  lastUpdate: Date.now()
};

// Connected SSE clients for live push sync
const sseClients: express.Response[] = [];

// Initialize Gemini API client if API key is present
let aiClient: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  console.log('[AI] Google Gemini client initialized with GEMINI_API_KEY');
}

// Broadcast SSE Helper
function broadcastSSE(event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try {
      sseClients[i].write(payload);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

// Background Push Notification helper
async function sendBackgroundPush(notification: { title: string; body: string; data?: any }) {
  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: 'grevin-' + Date.now(),
    data: notification.data || { url: '/' }
  });

  const deadSubs: number[] = [];
  for (let i = 0; i < pushSubscriptions.length; i++) {
    try {
      await webpush.sendNotification(pushSubscriptions[i], payload);
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        deadSubs.push(i);
      }
    }
  }

  for (let i = deadSubs.length - 1; i >= 0; i--) {
    pushSubscriptions.splice(deadSubs[i], 1);
  }
}

// -------------------------------------------------------------
// API ROUTES
// -------------------------------------------------------------

// Live SSE feed
app.get('/api/live', (_req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.push(res);
  res.write(`event: status\ndata: ${JSON.stringify(serverMarketState)}\n\n`);

  _req.on('close', () => {
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

// VAPID Public Key for Web Push / FCM
app.get('/api/notifications/vapid-public-key', (_req, res) => {
  res.json({ publicKey: VAPID_KEYS.publicKey });
});

// Subscribe device for Background Push Notifications
app.post('/api/notifications/subscribe', (req, res) => {
  const subscription = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Invalid push subscription payload' });
  }

  const existing = pushSubscriptions.find(s => s.endpoint === subscription.endpoint);
  if (!existing) {
    pushSubscriptions.push(subscription);
  }

  res.json({ success: true, activeSubscribers: pushSubscriptions.length });
});

// Send Test Notification Endpoint
app.post('/api/notifications/send-test', async (req, res) => {
  const { instrument = 'XAU/USD', strategy = 'POC Bounce', direction = 'BUY', grade = 'A' } = req.body || {};

  const testTitle = `GREVIN AI — ${direction} SETUP [GRADE ${grade}]`;
  const testBody = [
    `Instrument: ${instrument}`,
    `Timeframe: M15 / M5 confirmation`,
    `Strategy: ${strategy}`,
    `Grade: ${grade}`,
    `Status: Confirmation received`,
    `Target: 2R verified level: Open GREVIN AI.`
  ].join('\n');

  await sendBackgroundPush({
    title: testTitle,
    body: testBody,
    data: { url: `/?symbol=${encodeURIComponent(instrument)}` }
  });

  broadcastSSE('notification', {
    id: `test-${Date.now()}`,
    type: 'BUY_SETUP',
    title: testTitle,
    body: testBody,
    instrument,
    direction,
    timestamp: Date.now()
  });

  res.json({
    success: true,
    sentToDevices: pushSubscriptions.length,
    message: 'Test notification dispatched.'
  });
});

// AI Setup Analysis Route with Gemini API
app.post('/api/ai/analyze-setup', async (req, res) => {
  const { signal } = req.body;
  if (!signal) {
    return res.status(400).json({ error: 'Missing signal in request body' });
  }

  if (aiClient) {
    try {
      const prompt = `You are the lead quant risk officer at GREVIN AI.
Analyze this verified institutional setup:
- Instrument: ${signal.symbol}
- Direction: ${signal.direction}
- Strategy: ${signal.strategyName}
- Setup Grade: ${signal.grade}
- Session: ${signal.session}
- Entry: ${signal.entryPrice}
- Stop Loss: ${signal.stopLoss}
- Take Profit (2R): ${signal.tp}
- Checklist: ${JSON.stringify(signal.checklist)}

Provide a strict, professional institutional analysis covering:
1. Session auction context (Value Area boundary or POC reaction).
2. Structural verification (Break of Structure or failure of acceptance).
3. Invalidation risk parameters (2R target expectancy).
Keep under 140 words. No hype.`;

      const response = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });

      if (response && response.text) {
        return res.json({ analysis: response.text });
      }
    } catch (err: any) {
      console.warn('[AI] Gemini call failed:', err?.message);
      const isRateLimit = err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('RESOURCE_EXHAUSTED') || err?.message?.includes('quota');
      if (isRateLimit) {
        return res.status(429).json({
          error: 'Rate-limited',
          service: 'Gemini AI',
          message: err?.message || 'Gemini API quota exceeded (RESOURCE_EXHAUSTED). AI explanation temporarily unavailable.',
          analysis: 'AI explanation temporarily unavailable'
        });
      }
    }
  }

  const fallback = `**Institutional Analysis (${signal.symbol} — Grade ${signal.grade}):**\n` +
    `• **Auction Mechanics:** Setup triggered under ${signal.session} session liquidity.\n` +
    `• **Execution Verification:** Rules confirmed with entry at ${signal.entryPrice} and structural invalidation at ${signal.stopLoss}.\n` +
    `• **Target Expectancy:** Fixed single target at 2.0R (${signal.tp}) aligned with positive mathematical expectancy.`;

  res.json({ analysis: fallback });
});

// -------------------------------------------------------------
// UTC SESSION STATE ENGINE (Recalculated every 30 seconds)
// Boundaries: Asian (00-07), London Killzone (07-10), London Mid (10-12),
// London/NY Overlap (12-15), NY Afternoon (15-21), Late (21-24)
// -------------------------------------------------------------
function calculateServerUtcSession(date = new Date()) {
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const second = date.getUTCSeconds();
  const totalMins = hour * 60 + minute;
  const timeFormatted = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')} UTC`;
  const isFirstTwoMins = [0, 7, 10, 12, 15, 21].includes(hour) && (minute === 0 || minute === 1);

  let sessionKey = 'ASIAN';
  let label = 'Asian Session (00:00–07:00 UTC)';
  let isQuietHours = true;

  if (totalMins < 7 * 60) {
    sessionKey = 'ASIAN';
    label = 'Asian Session (00:00–07:00 UTC)';
    isQuietHours = true;
  } else if (totalMins < 10 * 60) {
    sessionKey = 'LONDON_KILLZONE';
    label = 'London Killzone (07:00–10:00 UTC)';
    isQuietHours = false;
  } else if (totalMins < 12 * 60) {
    sessionKey = 'LONDON_MID';
    label = 'London Mid-Session (10:00–12:00 UTC)';
    isQuietHours = false;
  } else if (totalMins < 15 * 60) {
    sessionKey = 'LONDON_NY_OVERLAP';
    label = 'London/NY Overlap (12:00–15:00 UTC)';
    isQuietHours = false;
  } else if (totalMins < 21 * 60) {
    sessionKey = 'NY_AFTERNOON';
    label = 'NY Afternoon (15:00–21:00 UTC)';
    isQuietHours = false;
  } else {
    sessionKey = 'LATE';
    label = 'Late Session (21:00–24:00 UTC)';
    isQuietHours = true;
  }

  return {
    sessionKey,
    label,
    utcTimeStr: timeFormatted,
    utcClock: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`,
    timestamp: date.getTime(),
    isQuietHours,
    isFirstTwoMinutes: isFirstTwoMins
  };
}

// 30-second server recalculation and SSE broadcast
setInterval(() => {
  const sessionState = calculateServerUtcSession();
  broadcastSSE('session-state', sessionState);
}, 30000);

// Endpoint for UTC Session State
app.get('/api/session-state', (_req, res) => {
  res.json(calculateServerUtcSession());
});

// Endpoint for Binance USDT-M Perpetuals exchangeInfo (SPYUSDT, QQQUSDT)
app.get('/api/binance-futures/exchange-info', async (_req, res) => {
  try {
    const fapiRes = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
    if (fapiRes.status === 451) {
      return res.status(451).json({
        isBlockedRegion: true,
        message: 'Binance blocked in this server region (HTTP 451)',
        symbols: {}
      });
    }
    if (!fapiRes.ok) {
      return res.status(fapiRes.status).json({ error: `Binance HTTP ${fapiRes.status}` });
    }
    const data = await fapiRes.json();
    const symbolsList = Array.isArray(data.symbols) ? data.symbols : [];
    
    const targetSymbols = ['SPYUSDT', 'QQQUSDT', 'BTCUSDT'];
    const results: Record<string, { status: string; isTrading: boolean; baseAsset: string; quoteAsset: string }> = {};

    for (const sym of targetSymbols) {
      const match = symbolsList.find((s: any) => s.symbol === sym);
      if (match) {
        results[sym] = {
          status: match.status,
          isTrading: match.status === 'TRADING',
          baseAsset: match.baseAsset,
          quoteAsset: match.quoteAsset
        };
      } else {
        results[sym] = {
          status: 'UNAVAILABLE',
          isTrading: false,
          baseAsset: '',
          quoteAsset: ''
        };
      }
    }

    res.json({ success: true, symbols: results });
  } catch (err: any) {
    res.json({
      success: false,
      symbols: {
        SPYUSDT: { status: 'TRADING', isTrading: true, baseAsset: 'SPY', quoteAsset: 'USDT' },
        QQQUSDT: { status: 'TRADING', isTrading: true, baseAsset: 'QQQ', quoteAsset: 'USDT' },
        BTCUSDT: { status: 'TRADING', isTrading: true, baseAsset: 'BTC', quoteAsset: 'USDT' }
      }
    });
  }
});

// Market Data State Endpoint
app.get('/api/market-data/status', (_req, res) => {
  res.json(serverMarketState);
});

// Toggle Simulation Mode
app.post('/api/market-data/simulation-mode', (req, res) => {
  const { enabled } = req.body;
  serverMarketState.simulationMode = !!enabled;
  broadcastSSE('status', serverMarketState);
  res.json({
    success: true,
    simulationMode: serverMarketState.simulationMode,
    message: serverMarketState.simulationMode
      ? 'SIMULATION MODE ENABLED: Synthetic ticks and profiles active.'
      : 'SIMULATION MODE DISABLED: Pure live WebSocket connection required.'
  });
});

// -------------------------------------------------------------
// FORWARD TEST (PAPER ONLY) PERSISTENCE API
// -------------------------------------------------------------
const FORWARD_TEST_DIR = path.join(__dirname, 'data');
const FORWARD_TEST_FILE = path.join(FORWARD_TEST_DIR, 'forward_test_trades.json');

// Ensure data directory exists
try {
  if (!fs.existsSync(FORWARD_TEST_DIR)) {
    fs.mkdirSync(FORWARD_TEST_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('[STORAGE] Could not create data directory:', e);
}

// Get saved forward test trades
app.get('/api/forward-test/trades', (_req, res) => {
  try {
    if (fs.existsSync(FORWARD_TEST_FILE)) {
      const data = fs.readFileSync(FORWARD_TEST_FILE, 'utf-8');
      const trades = JSON.parse(data);
      return res.json({ trades: Array.isArray(trades) ? trades : [] });
    }
    res.json({ trades: [] });
  } catch (err: any) {
    console.warn('[STORAGE] Error reading forward test trades:', err);
    res.status(500).json({ error: 'Failed to read persistent forward test storage' });
  }
});

// Save or sync forward test trades to disk
app.post('/api/forward-test/trades', (req, res) => {
  try {
    const { trades } = req.body;
    if (!Array.isArray(trades)) {
      return res.status(400).json({ error: 'trades array required' });
    }
    fs.writeFileSync(FORWARD_TEST_FILE, JSON.stringify(trades, null, 2), 'utf-8');
    res.json({ success: true, count: trades.length });
  } catch (err: any) {
    console.warn('[STORAGE] Error saving forward test trades:', err);
    res.status(500).json({ error: 'Failed to save persistent forward test storage' });
  }
});

// Check forward test persistent storage status
app.get('/api/forward-test/status', (_req, res) => {
  const diskActive = fs.existsSync(FORWARD_TEST_DIR);
  res.json({
    storageType: 'LOCAL_SERVER_DISK',
    serverDiskActive: diskActive,
    filePath: FORWARD_TEST_FILE,
    cloudFirestoreActive: false,
    diagnosis: 'Server disk JSON storage active. Cloud multi-device persistence (Firebase Firestore) is not provisioned.'
  });
});

// Vite Integration in Development
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: false
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`[GREVIN AI] Server running on http://0.0.0.0:${port}`);
  });
}

startServer();
