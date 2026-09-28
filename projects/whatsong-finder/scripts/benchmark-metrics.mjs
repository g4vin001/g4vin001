// Exact title/artist scoring after typography normalization. Supply explicit
// aliases for acceptable metadata variants; never silently ignore remix names.
export function normalizeLabel(value) {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
export function correctMatch(expected, song) {
  if (!expected || !song) return false;
  return [expected, ...(expected.aliases || [])].some(label =>
    normalizeLabel(label.title) === normalizeLabel(song.title) && normalizeLabel(label.artist) === normalizeLabel(song.artist));
}
const fraction = (n, d) => d ? n / d : null;
function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
}
export function summarize(rows, requestCostUSD) {
  const attempted = rows.filter(r => r.state !== 'pending');
  const completed = attempted.filter(r => r.state === 'complete');
  const known = attempted.filter(r => r.expected !== null);
  const unknown = attempted.filter(r => r.expected === null);
  const predictions = completed.filter(r => r.song);
  const correct = completed.filter(r => correctMatch(r.expected, r.song));
  const correctRejections = completed.filter(r => r.expected === null && r.song === null);
  const falsePositives = completed.filter(r => r.expected === null && r.song);
  const latency = attempted.map(r => r.latencyMs).filter(Number.isFinite);
  const estimatedMaximumCostUSD = Number((attempted.length * requestCostUSD).toFixed(6));
  return {
    planned: rows.length, attempted: attempted.length, completed: completed.length,
    pending: rows.filter(r => r.state === 'pending').length,
    unresolved: attempted.filter(r => r.state !== 'complete').length,
    known: known.length, unknown: unknown.length, correctMatches: correct.length,
    wrongMatches: predictions.length - correct.length,
    noMatch: completed.filter(r => !r.song).length,
    correctRejections: correctRejections.length, falsePositives: falsePositives.length,
    precision: fraction(correct.length, predictions.length),
    knownRecall: fraction(correct.length, known.length),
    unknownFalsePositiveRate: fraction(falsePositives.length, unknown.length),
    endToEndAccuracy: fraction(correct.length + correctRejections.length, attempted.length),
    completionRate: fraction(completed.length, rows.length),
    latencyMedianMs: percentile(latency, 0.5), latencyP95Ms: percentile(latency, 0.95),
    estimatedMaximumCostUSD,
    estimatedCostPerCorrectMatchUSD: fraction(estimatedMaximumCostUSD, correct.length),
  };
}
export function benchmarkMetrics(rows, requestCostUSD) {
  return { overall: summarize(rows, requestCostUSD), groups: Object.fromEntries(
    [...new Set(rows.map(r => r.group))].sort().map(group => [group, summarize(rows.filter(r => r.group === group), requestCostUSD)])) };
}
