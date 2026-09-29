import { mdToHTML } from '../lib/markdown.js';

// mdToHTML matnni avval ekranlaydi (esc), shuning uchun innerHTML xavfsiz.
export default function Markdown({ text, className = 'md' }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: mdToHTML(text) }} />;
}
