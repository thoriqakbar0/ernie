import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

import { cn } from '@/components/trovecn/lib/utils';

interface ChatMarkdownProps {
  readonly className?: string;
  readonly text: string;
}

const components: Components = {
  a: ({ className, node: _node, ...props }) => (
    <a
      {...props}
      className={cn('font-medium text-foreground underline underline-offset-4', className)}
      rel="noreferrer"
      target="_blank"
    />
  ),
  blockquote: ({ className, node: _node, ...props }) => (
    <blockquote
      {...props}
      className={cn('my-4 border-l-2 border-border pl-4 text-muted-foreground', className)}
    />
  ),
  code: ({ className, node: _node, ...props }) => (
    <code
      {...props}
      className={cn('rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]', className)}
    />
  ),
  h1: ({ className, node: _node, ...props }) => (
    <h1 {...props} className={cn('mt-6 mb-3 text-xl font-semibold first:mt-0', className)} />
  ),
  h2: ({ className, node: _node, ...props }) => (
    <h2 {...props} className={cn('mt-6 mb-2 text-lg font-semibold first:mt-0', className)} />
  ),
  h3: ({ className, node: _node, ...props }) => (
    <h3 {...props} className={cn('mt-5 mb-2 text-base font-semibold first:mt-0', className)} />
  ),
  li: ({ className, node: _node, ...props }) => (
    <li {...props} className={cn('my-1', className)} />
  ),
  ol: ({ className, node: _node, ...props }) => (
    <ol {...props} className={cn('my-3 list-decimal space-y-1 pl-5', className)} />
  ),
  p: ({ className, node: _node, ...props }) => (
    <p {...props} className={cn('my-3 first:mt-0 last:mb-0', className)} />
  ),
  pre: ({ className, node: _node, ...props }) => (
    <pre
      {...props}
      className={cn('my-4 max-w-full overflow-x-auto rounded-lg bg-muted p-3 text-sm', className)}
    />
  ),
  table: ({ className, node: _node, ...props }) => (
    <table {...props} className={cn('my-4 block max-w-full overflow-x-auto text-sm', className)} />
  ),
  td: ({ className, node: _node, ...props }) => (
    <td {...props} className={cn('border-b border-border px-3 py-2 align-top', className)} />
  ),
  th: ({ className, node: _node, ...props }) => (
    <th
      {...props}
      className={cn('border-b border-border px-3 py-2 text-left font-semibold', className)}
    />
  ),
  ul: ({ className, node: _node, ...props }) => (
    <ul {...props} className={cn('my-3 list-disc space-y-1 pl-5', className)} />
  ),
};

/** Renders Prime Agent markdown with T3 Code's safe parsing foundation. */
export function ChatMarkdown({ className, text }: ChatMarkdownProps): React.JSX.Element {
  return (
    <div className={cn('w-full min-w-0 text-sm leading-7 text-foreground', className)}>
      <ReactMarkdown
        components={components}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        remarkPlugins={[remarkGfm]}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
