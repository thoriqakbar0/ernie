import "@fontsource/patrick-hand";
import "@fontsource-variable/source-serif-4";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import article from "../../docs/ernie-development.md?raw";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: () => <HomePage />,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const routeTree = rootRoute.addChildren([homeRoute]);

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
});

function ArticleLink({ href = "", children, ...props }) {
  const isExternal = href.startsWith("http");

  return (
    <a
      {...props}
      href={href}
      rel={isExternal ? "noreferrer" : undefined}
      target={isExternal ? "_blank" : undefined}
    >
      {children}
    </a>
  );
}

function ArticleTitle({ children }) {
  return <h2>{children}</h2>;
}

function ArticleSectionHeading({ children }) {
  return <h3>{children}</h3>;
}

function HomePage() {
  return (
    <main>
      <header className="note" aria-labelledby="page-title">
        <h1 id="page-title">ernie</h1>
        <p className="note-lede">interface that adapts to your work.</p>
        <p className="note-story">
          i wanted one task to leave my laptop,
          <br />
          work inside a sandbox,
          <br />
          and come back without forgetting.
          <br />
          <br />
          so i made this.
        </p>
        <img
          className="smile"
          src="/assets/ernie-smile.png"
          width="48"
          height="37"
          alt="a small crooked blue smile"
        />
        <a className="note-link" href="#article">
          read the note
        </a>
      </header>

      <figure className="product-shot">
        <img
          src="/assets/ernie-app.webp"
          width="2720"
          height="1800"
          fetchPriority="high"
          alt="the Ernie desktop app showing repositories, a task, and its composer"
        />
      </figure>

      <article id="article" className="article">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ArticleLink,
            h1: ArticleTitle,
            h2: ArticleSectionHeading,
          }}
        >
          {article}
        </ReactMarkdown>
      </article>

      <footer className="footer-links">
        <a href="https://github.com/thoriqakbar0/ernie">source</a>
        <a href="#article">notes</a>
      </footer>
    </main>
  );
}

export function App() {
  return <RouterProvider router={router} />;
}
