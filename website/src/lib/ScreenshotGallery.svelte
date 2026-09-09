<section class="screenshots page-width" aria-label="Inside Ernie">
  <figure class="home">
    <a href="/screenshots/ernie-home.png" target="_blank" rel="noreferrer" aria-label="View the Ernie home screen full size">
      <img src="/screenshots/ernie-home.png" alt="Ernie home screen with agents in the sidebar and a message composer for Remy." width="3420" height="2224" loading="lazy" />
    </a>
  </figure>
  <figure>
    <a href="/screenshots/ernie-customize.png" target="_blank" rel="noreferrer" aria-label="View agent customization full size">
      <img src="/screenshots/ernie-customize.png" alt="Agent settings in Ernie, with a name field and a selection of colorful characters." width="3420" height="2224" loading="lazy" />
    </a>
  </figure>
  <figure>
    <a href="/screenshots/ernie-research.png" target="_blank" rel="noreferrer" aria-label="View the research session full size">
      <img src="/screenshots/ernie-research.png" alt="Theo researching electricity trends in Ernie, with two subagents and the code for their research requests visible." width="3420" height="2224" loading="lazy" />
    </a>
  </figure>
</section>

<style>
  .screenshots { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; padding-bottom: 64px; }
  figure { margin: 0; min-width: 0; }
  .home { grid-column: 1 / -1; }
  a { display: block; border-radius: 12px; overflow: hidden; border: 1px solid #dce0e4; }
  a:focus-visible { outline: 3px solid #696398; outline-offset: 4px; }
  img { display: block; width: 100%; height: auto; }
  @media (max-width: 600px) { .screenshots { grid-template-columns: 1fr; gap: 16px; padding-bottom: 40px; } }
</style>
