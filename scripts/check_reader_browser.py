"""Optional browser regression: python scripts/check_reader_browser.py <index.html>.

Requires agent-browser with Chromium. Opens only the local file; no package writes.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess


CHECK = r"""
(async () => {
  const errors = [];
  const visible = () => [...document.querySelectorAll('.document')].filter(e => getComputedStyle(e).display !== 'none');
  // Stay below Chromium's same-document navigation flood limit while checking CSS.
  const frame = () => new Promise(r => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), 70));
  const check = (ok, label) => { if (!ok) errors.push(label); };
  const links = [...document.querySelectorAll('.nav-link')];
  check(visible().length === 1, 'initial document');
  check(document.scripts.length === 0, 'no scripts');
  check(!document.querySelector('iframe,link[rel=stylesheet]'), 'no external dependencies');
  for (const link of links) {
    location.hash = link.hash;
    await frame();
    const current = visible();
    check(current.length === 1 && '#' + current[0].id === link.hash, 'route ' + link.hash);
    check(document.documentElement.scrollWidth <= innerWidth + 1, 'horizontal page overflow ' + link.hash);
  }
  // A heading or table row link must open its owning document, not a blank page.
  const targets = [...document.querySelectorAll('.doc-body tr[id],.doc-body h2[id]')];
  for (const target of targets.filter((_, i) => i % 10 === 0)) {
    location.hash = '#' + target.id;
    await frame();
    check(visible().length === 1 && visible()[0] === target.closest('.document'), 'deep link ' + target.id);
    check(getComputedStyle(target).display !== 'none', 'visible target ' + target.id);
  }
  const ids = [...document.querySelectorAll('[id]')].map(e => e.id);
  check(new Set(ids).size === ids.length, 'duplicate IDs');
  for (const a of document.querySelectorAll('a[href^="#"]')) {
    check(!!document.getElementById(a.hash.slice(1)), 'missing target ' + a.hash);
  }
  location.hash = '';
  await frame();
  check(visible().length === 1 && visible()[0].hasAttribute('data-default'), 'return to default');
  return {width: innerWidth, pages: links.length, sampledTargets: Math.ceil(targets.length / 10), errors};
})()
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('html', type=Path)
    args = parser.parse_args()
    page = args.html.resolve(strict=True)
    session = f'psop-reader-check-{os.getpid()}'

    def run(*commands: str, stdin: str | None = None):
        result = subprocess.run(['agent-browser', '--session', session, '--json', *commands],
                                input=stdin, capture_output=True, text=True, check=True, timeout=180)
        data = json.loads(result.stdout)
        if not data.get('success'):
            raise RuntimeError(data)
        return data['data']

    try:
        run('open', page.as_uri())
        for width, height in [(1440, 1000), (900, 900), (390, 844), (320, 740)]:
            run('set', 'viewport', str(width), str(height))
            result = run('eval', '--stdin', stdin=CHECK)['result']
            print(json.dumps(result, ensure_ascii=False))
            if result['errors']:
                raise AssertionError(result['errors'])
    finally:
        subprocess.run(['agent-browser', '--session', session, 'close'], capture_output=True)


if __name__ == '__main__':
    main()
