/**
 * mem-sampler.mjs — lightweight memory sampler for long-running benchmarks.
 *
 * Usage:
 *   const sampler = startMemSampler();
 *   // ... run benchmark ...
 *   const stats = sampler.stop();
 *   // stats.peakRssBytes, stats.peakHeapBytes, stats.samples
 */

export function startMemSampler(intervalMs = 200) {
  const samples = [];
  let peakRss  = 0;
  let peakHeap = 0;

  const interval = setInterval(() => {
    const m = process.memoryUsage();
    if (m.rss      > peakRss)  peakRss  = m.rss;
    if (m.heapUsed > peakHeap) peakHeap = m.heapUsed;
    samples.push({ rss: m.rss, heapUsed: m.heapUsed, external: m.external });
  }, intervalMs);

  // Don't block process exit
  interval.unref();

  // Initial sample
  const init = process.memoryUsage();
  peakRss  = init.rss;
  peakHeap = init.heapUsed;

  return {
    stop() {
      clearInterval(interval);
      const final = process.memoryUsage();
      if (final.rss      > peakRss)  peakRss  = final.rss;
      if (final.heapUsed > peakHeap) peakHeap = final.heapUsed;

      const avgRss  = samples.length ? samples.reduce((s, x) => s + x.rss,      0) / samples.length : peakRss;
      const avgHeap = samples.length ? samples.reduce((s, x) => s + x.heapUsed, 0) / samples.length : peakHeap;

      return {
        peakRssBytes:        peakRss,
        peakHeapBytes:       peakHeap,
        avgRssBytes:         Math.round(avgRss),
        avgHeapBytes:        Math.round(avgHeap),
        sampleCount:         samples.length,
        initRssBytes:        init.rss,
        initHeapBytes:       init.heapUsed,
        finalRssBytes:       final.rss,
        finalHeapBytes:      final.heapUsed,
      };
    },
  };
}
