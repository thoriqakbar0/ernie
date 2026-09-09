# Ernie website

Svelte landing page and inline introduction, published at https://ernie.ta-0.com.

Use `npm ci`, `npm run dev`, and `npm run check` in this directory. Build with `npm run build` and deploy `dist` to the existing Cloudflare Pages project `ernie` with Wrangler:

```sh
wrangler pages deploy dist --project-name ernie --branch main
```

The planning and timer interfaces are local demonstrations. The football result is a dated snapshot. The page does not connect to the production Ernie runtime.

The essay source is `src/content/introducing-ernie-2.md`. Its companion post lives in the ta-0 repository at `/blog/introducing-ernie`.
