// All settings come from environment variables (.env file). See .env.example.

function num(env, name, def) {
  const v = env[name];
  if (v === undefined || v === '') return def;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number (got "${v}")`);
  return n;
}

function idList(env, name) {
  return (env[name] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadConfig(env = process.env) {
  const storage = (env.STORAGE || 'sheets').toLowerCase();
  const config = {
    botToken: env.BOT_TOKEN || '',
    storage,
    sheetId: env.GOOGLE_SHEET_ID || '',
    googleCredentialsFile: env.GOOGLE_CREDENTIALS_FILE || '',
    googleClientEmail: env.GOOGLE_CLIENT_EMAIL || '',
    googlePrivateKey: (env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),

    // Telegram group where riders + you see jobs. Get the id with /myid inside the group.
    dispatchChatId: env.DISPATCH_CHAT_ID || '',
    adminIds: idList(env, 'ADMIN_IDS'),
    supportPhone: env.SUPPORT_PHONE || '',
    brandName: env.BRAND_NAME || 'Delivery',

    // Money (birr)
    deliveryFeeBase: num(env, 'DELIVERY_FEE_BASE', 60),
    baseKm: num(env, 'BASE_KM', 1.5),
    perKmFee: num(env, 'PER_KM_FEE', 15),
    maxKm: num(env, 'MAX_KM', 3),
    roadFactor: num(env, 'ROAD_FACTOR', 1.3),
    serviceFee: num(env, 'SERVICE_FEE', 10),
    riderSharePct: num(env, 'RIDER_SHARE_PCT', 75),
    defaultCommissionPct: num(env, 'DEFAULT_COMMISSION_PCT', 8),
    cacheSeconds: num(env, 'CACHE_SECONDS', 60),

    // Delivery time estimate (minutes)
    defaultPrepMin: num(env, 'DEFAULT_PREP_MIN', 20),
    pickupMin: num(env, 'PICKUP_MIN', 5),
    rideMinPerKm: num(env, 'RIDE_MIN_PER_KM', 4.5),
    etaBufferMin: num(env, 'ETA_BUFFER_MIN', 5),
    defaultDistanceKm: num(env, 'DEFAULT_DISTANCE_KM', 2),
    // Ratings
    minReviewsToShow: num(env, 'MIN_REVIEWS_TO_SHOW', 5),
  };

  const problems = [];
  if (!config.botToken) problems.push('BOT_TOKEN is missing (get it from @BotFather)');
  if (!['sheets', 'memory'].includes(storage)) problems.push('STORAGE must be "sheets" or "memory"');
  if (storage === 'sheets') {
    if (!config.sheetId) problems.push('GOOGLE_SHEET_ID is missing');
    if (!config.googleCredentialsFile && !(config.googleClientEmail && config.googlePrivateKey)) {
      problems.push('Set GOOGLE_CREDENTIALS_FILE (or GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY)');
    }
  }
  if (!config.dispatchChatId) {
    console.warn('⚠️  DISPATCH_CHAT_ID not set: riders will not receive jobs until you set it.');
  }
  if (config.adminIds.length === 0) {
    console.warn('⚠️  ADMIN_IDS not set: admin commands (/today, /active, /cancel) are disabled.');
  }
  return { config, problems };
}
