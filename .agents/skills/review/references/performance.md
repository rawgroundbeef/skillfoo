# Performance review

Review latency, throughput, scalability, and resource-use risk. Tie each
finding to a workload that grows; do not report micro-optimizations without a
measurable scale driver.

## Workflow

1. Classify changed paths:
   - **Hot:** Per request, render, event, poll, queue item, or list row.
   - **Warm:** Route load, user action, refresh, or batch step.
   - **Cold:** Migration, one-off script, rare operator action, or test helper.
2. Inspect callers to estimate frequency, concurrency, and data size.
3. Identify which resource grows and whether work is bounded.
4. Recommend the smallest fix that removes the bottleneck or sets a safe bound.

## Checklist

- **Database:** N+1 queries, unbounded scans, missing limits, wide reads,
  filter/order/index mismatches, lock scope, and queries inside loops.
- **Storage and filesystem:** Repeated large reads, unnecessary copies,
  unbounded traversal, metadata round trips, and missing size caps.
- **Network and external services:** Per-item calls, avoidable waterfalls,
  missing timeouts, retry storms, unbounded fan-out, and cache misses.
- **Workers and concurrency:** Unbounded parallelism, oversized payloads,
  duplicate work, backpressure gaps, long critical sections, and leaks.
- **Frontend rendering:** Expensive render work, large state updates, unstable
  props, global invalidation, layout shift, and oversized trees.
- **Client bundles:** Heavy or server-only dependencies entering client paths;
  expensive functionality that should load lazily.
- **CPU and memory:** Repeated parsing, hashing, sorting, serialization, image
  work, retained objects, and input-size amplification.
- **Caching and deduplication:** Incorrect cache scope, ineffective keys,
  repeated expensive work, stale data, and cross-user leakage.
- **Pagination and bounds:** Lists, search, logs, tool output, and batch work
  need explicit limits appropriate to the caller.

## Severity

- **Critical:** Likely outage, runaway cost, or system-wide saturation.
- **High:** Unbounded hot-path work or a clear regression at normal scale.
- **Medium:** Meaningful latency or resource regression under common load.
- **Low:** Cold-path tuning or a small bounded inefficiency.

Critical through Medium findings normally request changes. Low findings should
be Warn-level unless repository constraints make them material.

For each finding, include severity, file and line, path classification, scale
driver, impact, and smallest fix. If none are found, name the main paths and
growth dimensions checked.
