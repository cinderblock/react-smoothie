// Bun's bundler loads .md imports as HTML (rendered from the Markdown at build time)
declare module '*.md' {
  const html: string;
  export default html;
}
