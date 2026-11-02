import ReactMarkdown from 'react-markdown';

// Safe by construction: react-markdown never uses innerHTML. Raw HTML in the markdown source is NOT rendered
// (it would need the rehype-raw plugin, which we deliberately do not install), and its default URL transform
// strips javascript: links. We also drop images (no tracking pixels from organiser text) and force safe link attributes.
export default function Markdown({ source }: { source: string }) {
  return (
    <div className="prose-sl">
      <ReactMarkdown
        disallowedElements={['img']}
        unwrapDisallowed
        components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc">{children}</a> }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
