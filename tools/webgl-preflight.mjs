import { chromium } from 'playwright';
import fs from 'fs';

const configs = [
  ['default headless-shell',            {}],
  ['+ --enable-unsafe-swiftshader',     { args:['--enable-unsafe-swiftshader'] }],
  ['+ --use-gl=swiftshader',            { args:['--use-gl=swiftshader','--enable-unsafe-swiftshader'] }],
  ['+ --disable-gpu (the trap)',        { args:['--disable-gpu'] }],
];

const probe = `(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2');
  if (!gl) return { webgl2:false };
  const d = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    webgl2: true,
    renderer: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    vendor:   d ? gl.getParameter(d.UNMASKED_VENDOR_WEBGL)   : gl.getParameter(gl.VENDOR),
    maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    hasFloat: !!gl.getExtension('EXT_color_buffer_float'),
    hasS3TC: !!gl.getExtension('WEBGL_compressed_texture_s3tc'),
    hasETC:  !!gl.getExtension('WEBGL_compressed_texture_etc'),
    hasASTC: !!gl.getExtension('WEBGL_compressed_texture_astc'),
  };
})()`;

console.log('=== WEBGL AVAILABILITY BY LAUNCH CONFIG ===');
for (const [name, opts] of configs) {
  let b;
  try {
    b = await chromium.launch({ headless:true, ...opts });
    const p = await b.newPage();
    await p.goto('about:blank');
    const r = await p.evaluate(probe);
    console.log(`  ${name.padEnd(32)} webgl2=${r.webgl2 ? 'YES' : 'NO '}  ${r.renderer ?? ''}`);
    if (r.webgl2 && name.startsWith('+ --use-gl')) global.__caps = r;
  } catch(e) { console.log(`  ${name.padEnd(32)} LAUNCH ERROR: ${e.message.slice(0,60)}`); }
  finally { if (b) await b.close(); }
}
if (global.__caps) {
  const c = global.__caps;
  console.log('\n=== CAPABILITIES (swiftshader config) ===');
  console.log('  MAX_TEXTURE_SIZE   :', c.maxTex);
  console.log('  float color buffer :', c.hasFloat);
  console.log('  S3TC (desktop KTX2):', c.hasS3TC, '  ETC:', c.hasETC, '  ASTC:', c.hasASTC);
}
