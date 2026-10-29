import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { extractArticle, isFrameable } from '../src/lib/reader.ts';

const paragraph = (n: number) =>
  `<p>Paragraph ${n}: retrieval practice means pulling information out of memory rather than reading it again, ` +
  `and it strengthens learning far more than re-reading the same notes before a test.</p>`;

const page = `<!doctype html><html><head><title>Retrieval practice</title><script>alert(1)</script></head>
<body>
  <nav><a href="/">Home</a> <a href="/about">About</a></nav>
  <article>
    <h1>Why retrieval practice works</h1>
    <p class="byline">By Ada Lovelace</p>
    ${Array.from({ length: 8 }, (_, i) => paragraph(i + 1)).join('\n')}
    <p><img src="/img/chart.png" srcset="/img/chart-2x.png 2x" alt="Chart"> <a href="/study">the study</a>
      <a href="javascript:alert(1)">bad link</a></p>
    <script>steal()</script>
    <iframe src="https://ads.example.net"></iframe>
  </article>
  <footer>Copyright</footer>
</body></html>`;

describe('reader copies', () => {
  test('keep the article, make links absolute and drop anything active', () => {
    const article = extractArticle(page, 'https://blog.example.com/posts/retrieval');
    assert.ok(article, 'an article was found');
    assert.match(article.html, /Paragraph 8/);
    assert.match(article.html, /src="https:\/\/blog\.example\.com\/img\/chart\.png"/);
    assert.match(article.html, /href="https:\/\/blog\.example\.com\/study"/);
    assert.doesNotMatch(article.html, /<script|<iframe|srcset|javascript:|Copyright/);
    assert.ok(article.words > 200);
    assert.match(article.text, /^Paragraph 1|retrieval/);
  });

  test('are skipped for pages with no real text', () => {
    assert.equal(extractArticle('<html><body><p>Hi</p></body></html>', 'https://example.com/'), null);
  });

  test('framing rules follow X-Frame-Options and frame-ancestors', () => {
    const headers = (entries: Record<string, string>) => new Headers(entries);
    assert.equal(isFrameable(headers({})), true);
    assert.equal(isFrameable(headers({ 'x-frame-options': 'SAMEORIGIN' })), false);
    assert.equal(
      isFrameable(headers({ 'content-security-policy': "default-src 'self'; frame-ancestors 'none'" })),
      false
    );
    assert.equal(isFrameable(headers({ 'content-security-policy': 'frame-ancestors *' })), true);
    assert.equal(isFrameable(headers({ 'content-security-policy': "script-src 'self'" })), true);
  });
});
