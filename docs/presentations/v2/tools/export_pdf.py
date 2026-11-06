#!/usr/bin/env python3
"""Export manifest-ordered SVG slides to a vector PDF using Chromium.

Requires playwright, pymupdf and Pillow; install a Playwright Chromium browser
or pass --browser. Pages with video retain their SVG's static AR frame.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import sys
import tempfile

import pymupdf
from PIL import Image, ImageChops, ImageStat
from playwright.sync_api import sync_playwright


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--slides', type=Path, default=root / 'slides')
    parser.add_argument('--output', type=Path, default=root / 'psop-v2.pdf')
    parser.add_argument('--checks', type=Path, default=None)
    parser.add_argument('--browser', default=os.environ.get('PSOP_BROWSER'))
    args = parser.parse_args()
    slides, output = args.slides.resolve(), args.output.resolve()
    checks = (args.checks or output.with_suffix('.checks')).resolve()
    checks.mkdir(parents=True, exist_ok=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((slides / 'manifest.json').read_text(encoding='utf-8'))
    page_count = len(manifest['pages'])
    assert page_count > 0 and page_count == manifest.get('page_count', page_count)
    assert [p['page'] for p in manifest['pages']] == list(range(1, page_count + 1))
    width, height = manifest['canvas']
    merged = pymupdf.open()
    results = []
    with tempfile.TemporaryDirectory(prefix='psop-pdf-') as temporary, sync_playwright() as pw:
        launch = {'headless': True}
        if args.browser:
            if not Path(args.browser).is_file():
                raise RuntimeError('PSOP_BROWSER must point to a Chromium executable.')
            launch['executable_path'] = args.browser
        browser = pw.chromium.launch(**launch)
        page = browser.new_page(viewport={'width': width, 'height': height})
        page.emulate_media(media='screen')
        for item in manifest['pages']:
            source = slides / item['file']
            assert sha(source) == item['sha256'], source
            svg = source.read_text(encoding='utf-8')
            # Separate documents isolate SVG IDs and clip paths between pages.
            html = '<!doctype html><meta charset="utf-8"><style>' + (
                f'@page{{size:{width}px {height}px;margin:0}}'
                f'html,body{{margin:0;width:{width}px;height:{height}px;overflow:hidden;'
                '-webkit-print-color-adjust:exact;print-color-adjust:exact}'
                'body>svg{display:block;width:100%;height:100%}'
            ) + '</style>' + svg[svg.index('<svg'):]
            html_path = Path(temporary) / 'page.html'
            html_path.write_text(html, encoding='utf-8')
            page.goto(html_path.as_uri(), wait_until='networkidle')
            page.evaluate('document.fonts.ready')
            source_png = checks / f'{item["page"]:02d}-source.png'
            page.screenshot(path=str(source_png))
            pdf_bytes = page.pdf(width=f'{width}px', height=f'{height}px',
                                 margin={k: '0' for k in ['top', 'right', 'bottom', 'left']},
                                 print_background=True, prefer_css_page_size=True,
                                 display_header_footer=False)
            with pymupdf.open(stream=pdf_bytes, filetype='pdf') as single:
                assert len(single) == 1, (source, 'Unexpected PDF pagination')
                # Chromium rounds CSS paper dimensions to printer units; remove
                # the sub-point blank strip so the PDF remains exactly 16:9.
                assert abs(single[0].rect.width - width*.75) < .5
                assert abs(single[0].rect.height - height*.75) < .5
                single[0].set_mediabox(pymupdf.Rect(0, 0, width*.75, height*.75))
                merged.insert_pdf(single)
            print(f'Exported {item["page"]:02d}: {item["title"]}', flush=True)
        browser.close()

    merged.set_metadata({'title': 'PSOP｜设备任务、能力运营与现场服务平台',
                         'author': 'PSOP', 'subject': f'SVG presentation revision {manifest.get("revision", "")}',
                         'creator': 'PSOP SVG / Chromium', 'keywords': 'PSOP,Microduck,EG,设备任务'})
    merged.set_toc([[1, p['title'], p['page']] for p in manifest['pages']])
    # Merge shared images/font resources without rasterizing SVG text or paths.
    temporary_pdf = checks / 'export.pdf'
    merged.save(temporary_pdf, garbage=4, deflate=True)
    merged.close()
    with pymupdf.open(temporary_pdf) as document:
        assert len(document) == page_count
        for item, pdf_page in zip(manifest['pages'], document):
            assert abs(pdf_page.rect.width - width * .75) < .1
            assert abs(pdf_page.rect.height - height * .75) < .1
            content = pdf_page.get_text()
            assert 'PSOP' in content and len(content.strip()) > 60, item['file']
            fonts = pdf_page.get_fonts(full=True)
            assert fonts and all(document.extract_font(font[0])[3] for font in fonts), 'Font not embedded'
            pix = pdf_page.get_pixmap(matrix=pymupdf.Matrix(4/3, 4/3), alpha=False)
            rendered = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
            rendered.save(checks / f'{item["page"]:02d}-pdf.png')
            reference = Image.open(checks / f'{item["page"]:02d}-source.png').convert('RGB')
            error = sum(ImageStat.Stat(ImageChops.difference(reference, rendered)).mean) / 3
            assert error < 8, (item['file'], 'PDF differs from browser render', error)
            results.append({'page': item['page'], 'svg': item['file'], 'svg_sha256': item['sha256'],
                            'pdf_size_points': list(pdf_page.rect)[2:], 'selectable_text': True,
                            'fonts_embedded': True, 'mean_rgb_difference_0_to_255': round(error, 4)})
    output.write_bytes(temporary_pdf.read_bytes())
    temporary_pdf.unlink()
    rows = (page_count + 3) // 4
    contact = Image.new('RGB', (1660, 12 + rows * 237), '#D3E2EC')
    for i, item in enumerate(manifest['pages']):
        thumb = Image.open(checks / f'{item["page"]:02d}-pdf.png').resize((400, 225), Image.Resampling.LANCZOS)
        contact.paste(thumb, (12 + (i % 4)*412, 12 + (i // 4)*237))
    contact.save(checks / 'contact-sheet.png')
    media_pages = [p['page'] for p in manifest['pages'] if p.get('media')]
    report = {'result': 'passed', 'pdf': output.name, 'pdf_sha256': sha(output),
              'manifest_sha256': sha(slides / 'manifest.json'), 'source_sha256': manifest['source_sha256'],
              'page_count': len(results), 'pages': results, 'bookmarks': len(results),
              'media_pages': media_pages,
              'media_note': 'Pages '+', '.join(map(str,media_pages))+' contain static AR video frames; PDF does not play video.'}
    (checks / 'validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'pdf': str(output), 'pages': len(results), 'bytes': output.stat().st_size,
                      'checks': str(checks / 'validation.json')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
