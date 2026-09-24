"""Offline Chromium smoke tests. Inline CSS/assets; mock registry transport only.

Not a live-site, Safari, full-game or deployment test.
Usage: python tests/homepage_browser.py [--browser /usr/bin/chromium] [--out DIR]
Requires the optional development package `playwright` and Chromium.
"""
import argparse
import base64
import json
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://moonlightengineer.github.io/Moonlight-playground/'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--browser')
    parser.add_argument('--out', default='artifacts/homepage')
    args = parser.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    css = (ROOT / 'assets/styles.css').read_text(encoding='utf-8')
    app = (ROOT / 'assets/app.js').read_text(encoding='utf-8')
    registry = json.loads((ROOT / 'projects.json').read_text(encoding='utf-8'))
    cover = 'data:image/svg+xml;base64,' + base64.b64encode(
        (ROOT / 'games/hanzi-generals/cover.svg').read_bytes()).decode()
    html = html.replace('<head>', '<head><base href="' + BASE + '">')
    html = html.replace('<link rel="stylesheet" href="./assets/styles.css">', '<style>' + css + '</style>')
    html = re.sub(r'<script src="\./assets/app\.js" defer></script>', '', html)
    html = re.sub(r'<link rel="icon"[^>]*>', '', html)
    html = html.replace('src="./games/hanzi-generals/cover.svg"', 'src="' + cover + '"')
    results = []
    errors = []
    def passed(name):
        results.append(name)
        print('PASS', name)

    with sync_playwright() as p:
        launch = {'headless': True}
        if args.browser:
            launch['executable_path'] = args.browser
        browser = p.chromium.launch(**launch)

        def page_for(mode='success', data=None, width=390, height=844, run=True):
            page = browser.new_page(viewport={'width': width, 'height': height})
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.set_content(html)
            if run:
                page.evaluate('''({mode, data}) => {
                  window.registryRequests = [];
                  window.fetch = (url, options) => {
                    window.registryRequests.push({url, options});
                    if (mode === 'network') return Promise.reject(new Error('offline'));
                    if (mode === 'http') return Promise.resolve({ok: false, status: 503});
                    if (mode === 'json') return Promise.resolve({ok: true, json: async () => {throw new Error('bad JSON')}});
                    const response = {ok: true, json: async () => data};
                    if (mode === 'delayed') return new Promise(resolve => {window.resolveRegistry = () => resolve(response)});
                    return Promise.resolve(response);
                  };
                }''', {'mode': mode, 'data': registry if data is None else data})
                page.add_script_tag(content=app)
                if mode != 'delayed':
                    page.wait_for_function("/顯示|未能/.test(document.querySelector('#load-status').textContent)")
            return page

        for width, height in ((320,568),(390,844),(768,1024),(1440,900)):
            page = page_for(width=width, height=height)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
            assert page.locator('h1').count() == 1
            assert page.locator('.project-card').count() == 1
            assert page.locator('.series-item').count() == 4
            assert page.evaluate("[...document.querySelectorAll('a[href^=\"#\"]')].every(a=>document.getElementById(a.getAttribute('href').slice(1)))")
            assert page.evaluate("[...document.querySelectorAll('.hero-actions a, .filter-button, .header-nav a')].every(el=>el.getBoundingClientRect().height >= 44)")
            # Inline the same cover bytes after dynamic rendering; no network claim.
            page.eval_on_selector_all('.project-cover img', '(images, src) => images.forEach(img => {img.loading = "eager"; img.src = src})', cover)
            page.evaluate('document.fonts.ready')
            page.evaluate('Promise.all([...document.images].map(img => img.decode().catch(() => null)))')
            if width in (390,1440):
                page.screenshot(path=str(out / f'homepage-{width}.png'), full_page=True)
            passed(f'responsive-{width}, landmarks, anchors, touch targets')
            page.close()

        page = page_for()
        page.get_by_role('button', name='工具', exact=True).click()
        assert page.locator('.project-card').count() == 0
        assert page.locator('.empty-state').count() == 1
        assert page.get_by_role('button', name='工具', exact=True).get_attribute('aria-pressed') == 'true'
        assert '0' in page.locator('#load-status').inner_text()
        page.get_by_role('button', name='全部', exact=True).focus()
        page.keyboard.press('Enter')
        assert page.locator('.project-card').count() == 1
        assert page.get_by_role('button', name='全部', exact=True).get_attribute('aria-pressed') == 'true'
        assert page.locator('.project-action').get_attribute('href') == './games/hanzi-generals/'
        assert page.evaluate("registryRequests.length === 1 && registryRequests[0].url === './projects.json'")
        passed('filter empty state, keyboard restore, aria-pressed, live count, one registry request')
        page.emulate_media(reduced_motion='reduce')
        assert page.evaluate("getComputedStyle(document.documentElement).scrollBehavior === 'auto'")
        passed('reduced motion')
        page.close()

        for mode in ('network','http','json'):
            page = page_for(mode)
            assert page.locator('.project-card').count() == 1
            assert page.locator('#project-filters').is_hidden()
            page.eval_on_selector('[data-filter="tool"]', "button=>button.dispatchEvent(new Event('click'))")
            assert page.locator('.project-card').count() == 1
            passed(f'{mode} failure keeps usable fallback and blocks filtering')
            page.close()

        for data in ({}, {'projects': None}, {'projects': [None]}, {'projects':[{'title':'broken'}]},
                     {'projects':[{**registry['projects'][0], 'path':'javascript:alert(1)'}]}):
            page=page_for(data=data)
            assert '未能' in page.locator('#load-status').inner_text()
            assert page.locator('.project-card').count() == 1
            assert page.locator('#project-filters').is_hidden()
            page.close()
        passed('five malformed/unsafe registry variants preserve fallback')

        page=page_for('delayed')
        assert page.locator('#project-filters').is_hidden()
        page.eval_on_selector('[data-filter="tool"]', "button=>button.dispatchEvent(new Event('click'))")
        assert page.locator('.project-card').count() == 1
        page.evaluate('() => window.resolveRegistry()')
        page.wait_for_function("!document.querySelector('#project-filters').hidden")
        assert page.get_by_role('button',name='全部',exact=True).get_attribute('aria-pressed') == 'true'
        passed('slow response cannot erase fallback or desynchronise selection')
        page.close()

        for data in ({'projects': []}, {'projects': [{**registry['projects'][0], 'published': False}]}):
            page=page_for(data=data)
            assert page.locator('.project-card').count() == 0
            assert page.locator('.empty-state').count() == 1
            page.close()
        passed('empty and unpublished registries do not fabricate public projects')

        context=browser.new_context(java_script_enabled=False,viewport={'width':320,'height':568})
        page=context.new_page()
        page.set_content(html)
        assert page.locator('.project-card').count() == 1
        assert page.locator('#project-filters').is_hidden()
        assert page.locator('.project-action').get_attribute('href') == './games/hanzi-generals/'
        passed('JavaScript disabled: static card and navigation remain available')
        context.close()
        assert not errors, errors
        passed('no uncaught JavaScript errors')
        browser.close()
    (out/'report.json').write_text(json.dumps({'mode':'offline Chromium; inlined assets; mocked registry', 'checks':results, 'passed':len(results), 'uncaught_errors':errors}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'HOMEPAGE_SMOKE_OK groups={len(results)}')


if __name__ == '__main__':
    main()
