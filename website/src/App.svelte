<script lang="ts">
  import ArrowUpRight from 'phosphor-icons-svelte/IconArrowUpRightRegular.svelte'
  import Brand from './lib/Brand.svelte'
  import Characters from './lib/Characters.svelte'
  import WorkspaceDemo from './lib/WorkspaceDemo.svelte'
  import BlogArticle from './lib/BlogArticle.svelte'
  const essayUrl = 'https://ta-0.com/blog/the-best-software-is-yet-to-be-made'
  if (window.location.pathname.replace(/\/$/, '') === '/blog/introducing-ernie-2') {
    window.location.replace('/#introducing-ernie-2')
  }
</script>

<svelte:head>
  <title>Ernie · make yourself at home.</title>
  <meta name="description" content="Ask your agent to make Ernie work your way. An exploration of a workspace you can make your own." />
</svelte:head>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header page-width">
  <Brand />
  <nav aria-label="Main navigation"><a href="#the-thinking">The idea</a><a class="nav-explore" href="#workspace">Explore Ernie <ArrowUpRight /></a><a href="https://github.com/thoriqakbar0/ernie" target="_blank" rel="noreferrer">GitHub <ArrowUpRight /></a></nav>
</header>
  <main id="main">
    <section class="hero page-width" aria-labelledby="hero-title">
      <div><h1 id="hero-title">make yourself<br /><em>at home.</em></h1><Characters seeds={[356, 17, 85]} /></div>
      <div class="hero-intro"><p>ask your agent to make Ernie<br class="desktop-break" /> work your way.</p></div>
    </section>
    <section class="example page-width ruled" id="workspace" aria-labelledby="example-title">
      <h2 id="example-title">a sidebar. an input.<br /><em>is that it?</em></h2>
      <p class="request">Tell Ernie what you’re working on. Let your agent choose an interface that helps, then ask it to change what doesn’t.</p>

      <WorkspaceDemo />

    </section>
    <section class="thinking page-width ruled" id="the-thinking" aria-labelledby="thinking-title">
      <div class="thinking-copy"><h2 id="thinking-title">software you can<br /><em>have a say in.</em></h2><p>Ernie is exploring an interface that follows the work.<br class="desktop-break" /> A familiar place, with room to change.</p></div>
      <div class="journal"><h3>introducing Ernie</h3><p>A workspace you can make your own.</p></div>
    </section>
    <BlogArticle />
  </main>
<footer class="site-footer page-width"><div><Brand small /><p>A desktop interface for Prime Agent.</p></div><div class="footer-links"><a href={essayUrl} target="_blank" rel="noreferrer">The thinking</a><a href="https://github.com/thoriqakbar0/ernie" target="_blank" rel="noreferrer">GitHub ↗</a></div></footer>
