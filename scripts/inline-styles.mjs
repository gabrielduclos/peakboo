/** Keep the initial HTML and its styling atomic across deployments and browser caches. */
export function inlineStyles() {
  return {
    name: 'peakboo-inline-styles',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        for (const asset of Object.values(bundle)) {
          if (asset.type !== 'asset' || !asset.fileName.endsWith('.html')) continue;
          let count = 0;
          const html = String(asset.source).replace(/<link\b[^>]*>/gi, tag => {
            if (!/\brel=["']stylesheet["']/i.test(tag)) return tag;
            const href = /\bhref=["']([^"']+)["']/i.exec(tag)?.[1];
            const css = bundle[href?.replace(/^\.?\//, '')];
            if (!css || css.type !== 'asset') throw new Error('Missing bundled stylesheet: ' + href);
            count++;
            const source = typeof css.source === 'string' ? css.source : new TextDecoder().decode(css.source);
            return '<style data-peakboo-styles>' + source.replace(/<\/style/gi, '<\\/style') + '</style>';
          });
          if (!count) throw new Error('No stylesheet found in ' + asset.fileName);
          asset.source = html;
        }
      },
    },
  };
}
