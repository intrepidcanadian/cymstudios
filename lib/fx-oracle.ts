/**
 * FX Oracle — median of several independent rate providers.
 *
 * Replaces a single-provider dependency. One provider is a single point of both
 * failure AND error: when API Layer's free tier started returning 403 the whole
 * non-USD catalogue stopped pricing, and before that a silently stale provider
 * would have been trusted without question.
 *
 * Design:
 *  - Query every source in parallel; a slow or dead source cannot block the rest.
 *  - Take the MEDIAN per currency, not per response. Sources cover different
 *    currency sets, so quorum is evaluated currency by currency.
 *  - Reject outliers before taking the final median, so one wrong provider is
 *    outvoted rather than averaged in.
 *  - Require a quorum. A single unverified source is exactly what we are moving
 *    away from, so one response is not enough to price money.
 *
 * All sources except API Layer are keyless, so there is no quota to exhaust.
 *
 * Observed agreement between sources is tight — EUR ~0.10%, CAD ~0.32%,
 * HKD ~0.02% — comfortably inside the 1.5% non-USD fee.
 */

const SOURCE_TIMEOUT_MS = 6000;

/** Minimum sources that must supply a currency before we will price it. */
const MIN_SOURCES_PER_CURRENCY = 2;

/**
 * A value further than this from the provisional median is discarded as an
 * outlier. Real inter-source disagreement is well under 1%, so 2% only ever
 * catches a genuinely broken provider.
 */
const OUTLIER_TOLERANCE = 0.02;

/**
 * With only two sources a median cannot identify which one is wrong, so we
 * require them to agree this closely before trusting either.
 */
const PAIR_AGREEMENT_TOLERANCE = 0.02;

export interface RateSource {
  id: string;
  /** True if the source needs an API key and may be unavailable without one */
  keyed?: boolean;
  fetchRates: (signal: AbortSignal) => Promise<Record<string, number>>;
}

export interface OracleProvenance {
  respondedIds: string[];
  failed: { id: string; error: string }[];
  /** Per-currency agreement, for auditing what priced an order */
  perCurrency: Record<string, { sources: number; spreadPercent: number; excluded: string[] }>;
}

export interface OracleResult {
  rates: Record<string, number>;
  provenance: OracleProvenance;
}

async function getJson(url: string, signal: AbortSignal): Promise<any> {
  const res = await fetch(url, {
    signal,
    headers: {
      // Frankfurter (and some CDNs) reject requests with no User-Agent
      'User-Agent': 'cymstudio-fx-oracle/1.0',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Keep only sane, positive, finite numbers, keyed by uppercase currency code. */
function clean(raw: Record<string, unknown>, wanted: readonly string[]): Record<string, number> {
  const want = new Set(wanted.map((c) => c.toUpperCase()));
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const code = k.toUpperCase();
    if (!want.has(code)) continue;
    const n = typeof v === 'string' ? Number(v) : (v as number);
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) out[code] = n;
  }
  return out;
}

/**
 * Sources, all returning "1 USD = X <currency>".
 *
 * Note fawazahmed's dataset is mirrored on several CDNs — those mirrors are the
 * SAME upstream, so only one is listed. Counting a mirror as a second source
 * would double-weight one provider and corrupt the median.
 */
export function buildSources(wanted: readonly string[], apiLayerKey?: string): RateSource[] {
  const sources: RateSource[] = [
    {
      id: 'open-er-api',
      fetchRates: async (s) => clean((await getJson('https://open.er-api.com/v6/latest/USD', s)).rates ?? {}, wanted),
    },
    {
      id: 'frankfurter-ecb',
      fetchRates: async (s) => clean(
        (await getJson(`https://api.frankfurter.dev/v1/latest?base=USD&symbols=${wanted.join(',')}`, s)).rates ?? {},
        wanted,
      ),
    },
    {
      id: 'fawazahmed',
      fetchRates: async (s) => {
        // Dataset also contains crypto tickers; clean() filters to `wanted`.
        const d = await getJson('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json', s);
        return clean(d.usd ?? {}, wanted);
      },
    },
    {
      id: 'floatrates',
      fetchRates: async (s) => {
        const d = await getJson('https://www.floatrates.com/daily/usd.json', s);
        const flat: Record<string, unknown> = {};
        for (const [k, v] of Object.entries<any>(d)) if (v && v.rate != null) flat[k] = v.rate;
        return clean(flat, wanted);
      },
    },
    {
      id: 'fxratesapi',
      fetchRates: async (s) => clean(
        (await getJson(`https://api.fxratesapi.com/latest?base=USD&currencies=${wanted.join(',')}`, s)).rates ?? {},
        wanted,
      ),
    },
  ];

  if (apiLayerKey) {
    sources.push({
      id: 'apilayer',
      keyed: true,
      fetchRates: async (s) => {
        const res = await fetch(
          `https://api.apilayer.com/currency_data/live?base=USD&symbols=${wanted.join(',')}`,
          { signal: s, headers: { apikey: apiLayerKey } },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        if (!d.success || !d.quotes) throw new Error('invalid response');
        // Keys arrive as "USDEUR"; strip the USD prefix only.
        const flat: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(d.quotes)) flat[k.startsWith('USD') ? k.slice(3) : k] = v;
        return clean(flat, wanted);
      },
    });
  }

  return sources;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Fetch every source and reduce to a median rate per currency.
 * Throws only when no currency reached quorum — a partial result is still useful.
 */
export async function fetchOracleRates(
  wanted: readonly string[],
  apiLayerKey?: string,
  /** Injectable for tests — production always uses the real source list. */
  injectedSources?: RateSource[],
): Promise<OracleResult> {
  const sources = injectedSources ?? buildSources(wanted, apiLayerKey);

  const settled = await Promise.all(
    sources.map(async (src) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), SOURCE_TIMEOUT_MS);
      try {
        const rates = await src.fetchRates(ctrl.signal);
        if (!Object.keys(rates).length) throw new Error('no usable rates');
        return { id: src.id, rates };
      } catch (err) {
        return { id: src.id, error: err instanceof Error ? err.message : 'unknown' };
      } finally {
        clearTimeout(t);
      }
    }),
  );

  const ok = settled.filter((r): r is { id: string; rates: Record<string, number> } => 'rates' in r);
  const failed = settled
    .filter((r): r is { id: string; error: string } => 'error' in r)
    .map(({ id, error }) => ({ id, error }));

  const rates: Record<string, number> = {};
  const perCurrency: OracleProvenance['perCurrency'] = {};

  for (const code of wanted.map((c) => c.toUpperCase())) {
    const votes = ok
      .filter((s) => s.rates[code] !== undefined)
      .map((s) => ({ id: s.id, value: s.rates[code] }));

    if (votes.length < MIN_SOURCES_PER_CURRENCY) continue;

    // Provisional median, then discard anything clearly wrong and re-take it.
    const provisional = median(votes.map((v) => v.value));
    const kept = votes.filter((v) => Math.abs(v.value - provisional) / provisional <= OUTLIER_TOLERANCE);
    const excluded = votes.filter((v) => !kept.includes(v)).map((v) => v.id);

    if (kept.length < MIN_SOURCES_PER_CURRENCY) continue;

    // Two sources cannot outvote each other — insist they actually agree.
    if (kept.length === 2) {
      const [a, b] = kept.map((v) => v.value);
      if (Math.abs(a - b) / ((a + b) / 2) > PAIR_AGREEMENT_TOLERANCE) continue;
    }

    const values = kept.map((v) => v.value);
    const final = median(values);
    rates[code] = final;
    perCurrency[code] = {
      sources: kept.length,
      spreadPercent: ((Math.max(...values) - Math.min(...values)) / final) * 100,
      excluded,
    };
  }

  if (!Object.keys(rates).length) {
    throw new Error(
      `FX oracle: no currency reached quorum (${ok.length}/${sources.length} sources responded; ` +
      `failures: ${failed.map((f) => `${f.id}=${f.error}`).join(', ') || 'none'})`,
    );
  }

  return { rates, provenance: { respondedIds: ok.map((s) => s.id), failed, perCurrency } };
}
