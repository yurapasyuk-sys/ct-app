// Simple GARCH(1,1) volatility estimator with optional coarse grid-fit
export interface GarchOptions {
  omega?: number;
  alpha?: number;
  beta?: number;
  fit?: boolean; // try crude grid-fit to returns
}

/**
 * Compute log returns from price series
 */
function computeReturns(prices: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    r.push(Math.log(prices[i]) - Math.log(prices[i - 1]));
  }
  return r;
}

/**
 * Run a simple GARCH(1,1) recursion given params and returns
 */
function garchRecursion(returns: number[], omega: number, alpha: number, beta: number): number[] {
  const n = returns.length;
  const variances: number[] = new Array(n);

  // Initialize with sample variance
  const sampleVar = returns.reduce((s, v) => s + v * v, 0) / Math.max(1, returns.length);
  variances[0] = sampleVar || 1e-8;

  for (let t = 1; t < n; t++) {
    variances[t] = omega + alpha * returns[t - 1] * returns[t - 1] + beta * variances[t - 1];
    // enforce positivity
    if (!isFinite(variances[t]) || variances[t] <= 0) variances[t] = 1e-8;
  }

  // convert to sigma (std)
  return variances.map(v => Math.sqrt(v));
}

/**
 * Coarse grid fit for alpha/beta (keeps omega small). Minimizes squared error between r_t^2 and sigma_t^2
 */
function fitGarch(returns: number[]) {
  let best = { omega: 1e-8, alpha: 0.05, beta: 0.94, error: Number.POSITIVE_INFINITY };
  const sampleVar = returns.reduce((s, v) => s + v * v, 0) / Math.max(1, returns.length);
  const omegaBase = Math.max(1e-12, 0.000001 * sampleVar);

  const alphas = [0.01, 0.03, 0.05, 0.08, 0.1, 0.15];
  const betas = [0.85, 0.9, 0.92, 0.94, 0.96, 0.98];

  for (const a of alphas) {
    for (const b of betas) {
      if (a + b >= 0.999) continue;
      const omega = omegaBase * (1 - a - b);
      const sig = garchRecursion(returns, omega, a, b);
      // compute variance series
      const modelVar = sig.map(s => s * s);
      // compute SSE between r_t^2 and modelVar (skip first few)
      let sse = 0;
      for (let i = 1; i < returns.length; i++) {
        const diff = returns[i] * returns[i] - modelVar[i];
        sse += diff * diff;
      }
      if (sse < best.error) {
        best = { omega, alpha: a, beta: b, error: sse };
      }
    }
  }

  return best;
}

/**
 * Public API: computeGarchVolatility
 * - prices: full price series
 * - options: ability to pass parameters or let function fit them
 * Returns sigma series aligned to returns length (prices.length - 1)
 */
export function computeGarchVolatility(prices: number[], options: GarchOptions = {}): number[] {
  if (!prices || prices.length < 3) {
    return [];
  }

  const returns = computeReturns(prices);

  let omega = options.omega ?? 1e-8;
  let alpha = options.alpha ?? 0.05;
  let beta = options.beta ?? 0.94;

  if (options.fit) {
    const fitted = fitGarch(returns);
    omega = fitted.omega;
    alpha = fitted.alpha;
    beta = fitted.beta;
  }

  // compute sigma series (length = returns.length)
  const sigma = garchRecursion(returns, omega, alpha, beta);

  // prepend one value to map back to price timestamps (so length = prices.length)
  // we add the initial sigma value at the beginning to align with price indices
  const first = sigma.length > 0 ? sigma[0] : 1e-8;
  return [first, ...sigma];
}

export default computeGarchVolatility;
