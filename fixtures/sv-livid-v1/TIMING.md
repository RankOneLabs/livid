# SV-Livid v1 layout timing

Measured on 2026-09-21 with Node.js 22.21.1 on `otto`, an AMD Ryzen 7 PRO
6850U (8 cores / 16 threads) running x86_64 Linux 7.0.0-31-generic.

```text
$ npm run check
$ node scripts/time-layout.mjs
SV-Livid v1 150-node cold layout(): 401.1 ms
```

This is a reproducible observation, not a test threshold. The timer covers the
first `layout()` call for `largeScopeSpec`; fixture loading and validation occur
before the clock starts.
