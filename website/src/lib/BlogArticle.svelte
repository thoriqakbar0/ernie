<script lang="ts">
  import ArrowUpRight from 'phosphor-icons-svelte/IconArrowUpRightRegular.svelte'
  import { marked } from 'marked'
  import body from '../content/introducing-ernie-2.md?raw'
  import Characters from './Characters.svelte'
  import { releaseUrl, releaseVersion } from '../release'
  // Only checked-in, author-owned Markdown enters this renderer; there is no user-input HTML path.
  const articleHtml = marked.parse(body, { async: false })
</script>
<section id="introducing-ernie-2" class="article-main" aria-label="Introducing Ernie">

  <article class="article-prose">{@html articleHtml}</article>
  <div class="article-end"><Characters seeds={[356]} /><a class="button" href={releaseUrl}>download Ernie {releaseVersion} <ArrowUpRight /></a></div>
</section>
