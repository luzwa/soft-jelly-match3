/* Jelly Match-3 V2.2 · jelly renderer (v2.2 mobile: persistent dynamic VBOs + bufferSubData, pooled items, atlas slot from sprite size, lit uniforms once per frame, optional front-only shell)
 * (was V2.1 (v2.1: + lit 3D-shell program for the octopus 'B' display, soft contact-shadow quad 13): WebGL (batched textured soft-body meshes, procedural special-piece
 * shading, contact shadows, glows) with a Canvas2D affine-triangle fallback. Sprites come from data URIs,
 * so texture upload is CORS-clean even from file://. */
(function () {
  'use strict';
  var JM = window.JM, Body = JM.Body;
  var SLOT = { jelly_squid: 0, jelly_fugu: 1, jelly_jellyfish: 2, jelly_octopus: 3, jelly_bear: 4, jelly_fig: 5 };
  var FLOATS = 16, CSX = [-1, 1, 1, -1], CSY = [-1, -1, 1, 1];
  var VS = 'attribute vec2 a_pos;attribute vec2 a_uv;attribute vec2 a_loc;attribute vec4 a_col;attribute vec4 a_fx;' +
    'uniform vec2 u_res;varying vec2 v_uv;varying vec2 v_loc;varying vec4 v_col;varying vec4 v_fx;' +
    'void main(){v_uv=a_uv;v_loc=a_loc;v_col=a_col;v_fx=a_fx;gl_Position=vec4(a_pos.x/u_res.x*2.0-1.0,1.0-a_pos.y/u_res.y*2.0,0.0,1.0);}';
  var FS = 'precision mediump float;uniform sampler2D u_tex;uniform float u_time;varying vec2 v_uv;varying vec2 v_loc;varying vec4 v_col;varying vec4 v_fx;' +
    'vec3 hsv(float h,float s,float v){vec3 k=clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);return v*mix(vec3(1.0),k,s);}' +
    'void main(){float kind=v_fx.y;float al=v_fx.x;' +
    ' if(kind>13.5){vec4 c=texture2D(u_tex,v_uv);gl_FragColor=vec4(v_col.rgb*(c.a-c.r)+vec3(c.r),c.a)*al;return;}' +   // v2.2 goo decal: atlas mask (a) + highlight (r), tinted
    ' if(kind>9.5){vec2 d=v_loc*2.0-1.0;float r=length(d);' +
    '  if(kind<10.5){float a=1.0-smoothstep(0.0,1.0,r);a*=a;gl_FragColor=vec4(v_col.rgb,1.0)*v_col.a*a*al;}' +
    '  else if(kind<11.5){float a=exp(-r*r*3.2)*(1.0-smoothstep(0.8,1.0,r));gl_FragColor=vec4(v_col.rgb*a*al*v_col.a,0.0);}' +
    '  else if(kind>12.5){float sf=max(0.04,v_fx.z);float a=clamp((1.0-r)/sf,0.0,1.0);a=a*a*(3.0-2.0*a);gl_FragColor=vec4(v_col.rgb,1.0)*v_col.a*a*al;}' +
    '  else {float a=smoothstep(1.0,0.82,r)*smoothstep(0.55,0.8,r);gl_FragColor=vec4(v_col.rgb*a*al*v_col.a,0.0);}' +
    '  return;}' +
    ' vec4 c=texture2D(u_tex,v_uv);float a=c.a;if(a<0.004)discard;' +
    ' vec3 un=c.rgb/max(a,0.001);float t=u_time+v_fx.w*7.0;' +
    ' if(kind>0.5&&kind<2.5){float co=kind<1.5?v_loc.y:v_loc.x;float b=abs(fract(co*6.0-t*0.7)-0.5)*2.0;float band=smoothstep(0.55,0.75,b);' +
    '   un=mix(un,vec3(1.0,0.99,0.95),band*0.62);float gl=smoothstep(0.92,1.0,1.0-abs(fract((v_loc.x+v_loc.y)*0.8-t*0.35)-0.5)*2.0);un+=gl*0.25;}' +
    ' else if(kind>2.5&&kind<3.5){float p=0.5+0.5*sin(t*6.5);vec2 d=v_loc-vec2(0.5,0.55);float r=length(d);' +
    '   float ring=1.0-smoothstep(0.0,0.12,abs(fract(r*3.2-t*1.4)-0.5));un=mix(un,vec3(1.0,0.5,0.18),0.25+0.2*p);un+=ring*(0.45+0.25*p)*smoothstep(0.62,0.2,r)*vec3(1.0,0.9,0.6);float core=smoothstep(0.16,0.0,r);un+=core*(0.35+0.4*p)*vec3(1.0,0.95,0.8);}' +
    ' else if(kind>3.5&&kind<4.5){float l=dot(un,vec3(0.3,0.59,0.11));vec3 rb=hsv(fract(v_loc.y*0.9+v_loc.x*0.45-t*0.28),0.6,1.0);' +
    '   un=rb*(0.5+0.85*l);float sp=pow(max(0.0,sin(v_loc.x*41.0+t*3.0)*sin(v_loc.y*37.0-t*2.3)),16.0);un+=sp*0.9;}' +
    ' un=mix(un,vec3(1.0),v_fx.z);un=mix(un,v_col.rgb,v_col.a);' +
    ' gl_FragColor=vec4(un*a,a)*al;}';

  // ---- lit program (v2.1 B): 3D shell with per-vertex normals, one fixed light, de-lit base colour + material map
  var LFLOATS = 12;   // pos.xy, z(ndc), normal.xyz, uv.xy, fx(alpha, flash, side, -)
  var LVS = 'attribute vec3 a_pos;attribute vec3 a_n;attribute vec2 a_uv;attribute vec4 a_fx;uniform vec2 u_res;' +
    'varying vec3 v_n;varying vec2 v_uv;varying vec4 v_fx;' +
    'void main(){v_n=a_n;v_uv=a_uv;v_fx=a_fx;gl_Position=vec4(a_pos.x/u_res.x*2.0-1.0,1.0-a_pos.y/u_res.y*2.0,a_pos.z,1.0);}';
  var LFS = 'precision mediump float;uniform sampler2D u_base;uniform sampler2D u_mat;uniform vec3 u_light;uniform vec4 u_k;uniform vec4 u_k2;' +
    'varying vec3 v_n;varying vec2 v_uv;varying vec4 v_fx;' +
    'void main(){vec4 c=texture2D(u_base,v_uv);float a=c.a;if(a<0.004)discard;' +
    ' vec3 alb=c.rgb/max(a,0.001);vec3 m=texture2D(u_mat,v_uv).rgb;float th=m.r;float ao=mix(1.0,m.g,u_k2.x);' +
    ' vec3 N=normalize(v_n);vec3 Ld=normalize(u_light);vec3 V=vec3(0.0,0.0,1.0);' +
    ' float wrap=u_k.x;float dif=max(0.0,(dot(N,Ld)+wrap)/(1.0+wrap));' +
    ' float amb=u_k.y+0.1*(-N.y);' +                                   // sky from above (screen y is down)
    ' float thin=1.0-smoothstep(0.04,0.42,th);' +
    ' vec3 col=alb*(amb+u_k.z*dif)*ao;' +
    ' col=mix(col,col*0.9+alb*vec3(0.32,0.2,0.18)+vec3(0.06,0.03,0.03),thin*u_k2.y);' +       // thin tips lighter
    ' float tr=thin*max(0.0,dot(-N,Ld)*0.5+0.5);col+=alb*tr*u_k2.z;' +                          // transmission
    ' col*=mix(1.0,0.93,1.0-thin);' +                                                          // thick body: denser colour
    ' vec3 H=normalize(Ld+V);float nh=max(0.0,dot(N,H));' +
    ' float sp=pow(nh,18.0)*0.14+pow(nh,96.0)*u_k.w;' +                                        // wet: broad sheen + tight spot
    ' float fr=pow(1.0-max(0.0,N.z),3.0);' +
    ' col+=vec3(1.0,0.97,0.96)*sp*ao+vec3(1.0,0.9,0.9)*fr*u_k2.w*ao;' +
    ' col=mix(col,vec3(1.0),v_fx.y);' +
    ' float al=a*mix(1.0,0.84,thin)*v_fx.x;' +
    ' gl_FragColor=vec4(col*al,al);}';

  function Renderer(canvas, images) {
    this.canvas = canvas; this.images = images; this.mode = 'none';
    var forced = /[?&]renderer=2d/.test(location.search);
    var opts = { premultipliedAlpha: true, alpha: true, antialias: true };
    var gl = null;
    if (!forced) { try { gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts); } catch (e) { gl = null; } }
    if (gl && this.initGL(gl)) { this.mode = gl instanceof (window.WebGL2RenderingContext || function () { }) ? 'webgl2' : 'webgl'; }
    else { this.gl = null; this.ctx = canvas.getContext('2d'); this.mode = 'canvas2d'; }
    this.batches = [];
  }
  Renderer.prototype.initGL = function (gl) {
    try {
      var sh = function (type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      var pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      gl.useProgram(pr);
      this.loc = { pos: gl.getAttribLocation(pr, 'a_pos'), uv: gl.getAttribLocation(pr, 'a_uv'), lc: gl.getAttribLocation(pr, 'a_loc'), col: gl.getAttribLocation(pr, 'a_col'), fx: gl.getAttribLocation(pr, 'a_fx'),
        res: gl.getUniformLocation(pr, 'u_res'), time: gl.getUniformLocation(pr, 'u_time'), tex: gl.getUniformLocation(pr, 'u_tex') };
      // atlas 4x2 slots; v2.2: slot = sprite size (256 in the mobile build → 1024x512 atlas, 4x less texture memory)
      var SS = this.SS = this.images.jelly_bear.width || 512;
      var at = document.createElement('canvas'); at.width = 4 * SS; at.height = 2 * SS; var ax = at.getContext('2d');
      for (var t in SLOT) { var s = SLOT[t]; ax.drawImage(this.images[t], (s % 4) * SS, Math.floor(s / 4) * SS, SS, SS); }
      bakeDecals(ax, SS);
      var tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); this.atlasTex = tex;
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, at);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      // v2.2: buffers allocated once (DYNAMIC_DRAW), refilled with bufferSubData each flush
      this.vbo = gl.createBuffer(); this.ibo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo); gl.bufferData(gl.ARRAY_BUFFER, FLOATS * 4 * 12000, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, 2 * 36000, gl.DYNAMIC_DRAW);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.DEPTH_TEST);
      this.verts = new Float32Array(FLOATS * 12000); this.inds = new Uint16Array(36000);
      this.gl = gl;
      this.prog = pr;
      var err = gl.getError(); if (err) throw new Error('gl error ' + err);
      try { this.initLit(gl, sh); } catch (e2) { this.lit = null; if (window.console) console.warn('lit program unavailable (B display off):', e2.message); }
      gl.useProgram(pr);
      return true;
    } catch (e) { if (window.console) console.warn('WebGL init failed, using Canvas2D fallback:', e.message); return false; }
  };
  // lighting constants (待测初值): light dir (screen space, y down, z to viewer), u_k = wrap, ambient, diffuse, tight spec;
  // u_k2 = AO strength, thin-lighten, transmission, fresnel rim
  Renderer.LIGHT = { dir: [-0.45, -0.62, 0.64], k: [0.6, 0.64, 0.52, 0.5], k2: [0.75, 0.55, 0.25, 0.3] };
  Renderer.prototype.initLit = function (gl, sh) {
    var bi = this.images.__octoBase, mi = this.images.__octoMat;
    if (!bi || !mi) { this.lit = null; return; }
    var pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, LVS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, LFS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    var L = { pos: gl.getAttribLocation(pr, 'a_pos'), n: gl.getAttribLocation(pr, 'a_n'), uv: gl.getAttribLocation(pr, 'a_uv'), fx: gl.getAttribLocation(pr, 'a_fx'),
      res: gl.getUniformLocation(pr, 'u_res'), base: gl.getUniformLocation(pr, 'u_base'), mat: gl.getUniformLocation(pr, 'u_mat'),
      light: gl.getUniformLocation(pr, 'u_light'), k: gl.getUniformLocation(pr, 'u_k'), k2: gl.getUniformLocation(pr, 'u_k2') };
    function tex(img, premul) {
      var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premul);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    gl.activeTexture(gl.TEXTURE1); tex(bi, true);
    gl.activeTexture(gl.TEXTURE2); tex(mi, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    var hasDepth = gl.getContextAttributes && gl.getContextAttributes().depth;
    if (!hasDepth) throw new Error('no depth buffer');
    this.lit = { prog: pr, loc: L, verts: new Float32Array(LFLOATS * 2 * 26 * 26), inds: new Uint16Array(2 * 6 * 25 * 25), vbo: gl.createBuffer(), ibo: gl.createBuffer() };
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lit.vbo); gl.bufferData(gl.ARRAY_BUFFER, this.lit.verts.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.lit.ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.lit.inds.byteLength, gl.DYNAMIC_DRAW);
    var gerr = gl.getError(); if (gerr) throw new Error('gl error ' + gerr);
  };
  // v2.2: 8 goo-decal shapes baked into the two free atlas slots (6, 7) as 2x2 sub-cells; decals then draw as GL quads
  // (black blobs at 0.5 opacity, overlaps compound like the v2.1 canvas decal; white highlight at 0.3). 1 unit = 1 cell; sub-cell spans 1.2 cells.
  Renderer.DECAL_SPAN = 1.2;
  function bakeDecals(ax, SS) {
    var sd = 7771; function r01() { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; }
    var h = SS / 2, f = h / Renderer.DECAL_SPAN;
    for (var v = 0; v < 8; v++) {
      var slot = 6 + (v >> 2), sub = v & 3, ox = (slot % 4) * SS + (sub & 1) * h + h / 2, oy = Math.floor(slot / 4) * SS + (sub >> 1) * h + h / 2;
      ax.save(); ax.translate(ox, oy); ax.scale(f, f); ax.fillStyle = 'rgba(0,0,0,0.5)';
      for (var j = 0; j < 7; j++) {
        var ang = r01() * 6.28, d = j === 0 ? 0 : 0.12 + r01() * 0.30, r = j === 0 ? 0.34 : 0.06 + r01() * 0.10;
        ax.beginPath(); ax.arc(Math.cos(ang) * d, Math.sin(ang) * d, r, 0, 7); ax.fill();
      }
      ax.fillStyle = 'rgba(255,255,255,0.3)'; ax.beginPath(); ax.arc(-0.34 * 0.3, -0.34 * 0.35, 0.34 * 0.22, 0, 7); ax.fill();
      ax.restore();
    }
  }
  // decal quad: centre, size (logical px, = DECAL_SPAN cells at scale 1), rotation, shape 0..7, colour [r,g,b] 0..1, alpha
  Renderer.prototype.decal = function (cx, cy, size, rot, shape, col, alpha) { var o = this._item(); o.q = 2; o.x = cx; o.y = cy; o.w = size; o.r = rot; o.v = shape; o.c = col; o.a = alpha; };
  Renderer.prototype.hasLit = function () { return !!(this.gl && this.lit); };
  // frame API ------------------------------------------------------------
  // v2.2: batches / items come from pools (no per-frame object churn); this.litBack=false draws the shell front surface only
  Renderer.prototype.begin = function (scale, time) { this.scale = scale; this.time = time; this.batches.length = 0; this.cur = null; this._nb = 0; this._ni = 0; this._litSet = false; };
  Renderer.prototype.batch = function (scissor) {
    var bp = this._bpool || (this._bpool = []), b = bp[this._nb] || (bp[this._nb] = { scissor: null, items: [] }); this._nb++;
    b.scissor = scissor; b.items.length = 0; this.cur = b; this.batches.push(b);
  };
  Renderer.prototype._item = function () {
    var ip = this._ipool || (this._ipool = []), o = ip[this._ni] || (ip[this._ni] = {}); this._ni++;
    o.m = null; o.q = 0; o.L = null; this.cur.items.push(o); return o;
  };
  // mesh item: body (with px/py in logical px), alpha, kind (0 normal,1 h-stripe,2 v-stripe,3 bomb,4 rainbow), flash 0..1, tint [r,g,b,a]
  Renderer.prototype.mesh = function (body, alpha, kind, flash, seed, tint, ox, oy) { var o = this._item(); o.m = body; o.a = alpha; o.k = kind || 0; o.f = flash || 0; o.s = seed || 0; o.t = tint; o.ox = ox || 0; o.oy = oy || 0; };
  // quad item: kind 10 shadow, 11 glow, 12 ring; color [r,g,b,a] 0..1
  Renderer.prototype.quad = function (cx, cy, w, h, kind, col, alpha, soft) { var o = this._item(); o.q = 1; o.x = cx; o.y = cy; o.w = w; o.h = h; o.k = kind; o.c = col; o.a = alpha; o.sf = soft || 0; };
  // lit 3D shell item (JM.Volume), drawn with the lit program + a depth test local to this item
  Renderer.prototype.litMesh = function (vol, alpha, flash, ox, oy) { var o = this._item(); o.L = vol; o.a = alpha; o.f = flash || 0; o.ox = ox || 0; o.oy = oy || 0; };
  Renderer.prototype.end = function () { if (this.gl) this.endGL(); else this.end2D(); };

  Renderer.prototype.bindFlat = function () {
    var gl = this.gl, L = this.loc, st = FLOATS * 4;
    gl.useProgram(this.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.enableVertexAttribArray(L.pos); gl.vertexAttribPointer(L.pos, 2, gl.FLOAT, false, st, 0);
    gl.enableVertexAttribArray(L.uv); gl.vertexAttribPointer(L.uv, 2, gl.FLOAT, false, st, 8);
    gl.enableVertexAttribArray(L.lc); gl.vertexAttribPointer(L.lc, 2, gl.FLOAT, false, st, 16);
    gl.enableVertexAttribArray(L.col); gl.vertexAttribPointer(L.col, 4, gl.FLOAT, false, st, 24);
    gl.enableVertexAttribArray(L.fx); gl.vertexAttribPointer(L.fx, 4, gl.FLOAT, false, st, 40);
  };
  Renderer.prototype.endGL = function () {
    var gl = this.gl, W = this.canvas.width, H = this.canvas.height, sc = this.scale, L = this.loc, self = this;
    gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.disable(gl.SCISSOR_TEST); gl.clear(gl.COLOR_BUFFER_BIT);
    this.bindFlat();
    gl.uniform2f(L.res, W, H); gl.uniform1f(L.time, this.time / 1000); gl.uniform1i(L.tex, 0);
    var V = this.verts, I = this.inds, IDX = Body.IDX, nv = 0, ni = 0, scis = null;
    var stt = this.stats || (this.stats = {}); stt.flatDraws = 0; stt.litDraws = 0; stt.litVerts = 0;
    var SS = this.SS, AW = 4 * SS, AH = 2 * SS;
    function flush() {
      if (!ni) return;
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, V.subarray(0, nv * FLOATS));
      gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, I.subarray(0, ni));
      gl.drawElements(gl.TRIANGLES, ni, gl.UNSIGNED_SHORT, 0); self.stats.flatDraws++;
      nv = 0; ni = 0;
    }
    function setScissor(r) {
      if (r) { gl.enable(gl.SCISSOR_TEST); gl.scissor(Math.floor(r.x * sc), Math.floor(H - (r.y + r.h) * sc), Math.ceil(r.w * sc), Math.ceil(r.h * sc)); }
      else gl.disable(gl.SCISSOR_TEST);
    }
    for (var b = 0; b < this.batches.length; b++) {
      var bt = this.batches[b];
      scis = bt.scissor; setScissor(scis);
      for (var it = 0; it < bt.items.length; it++) {
        var o = bt.items[it];
        if (o.L) { flush(); this.drawLit(o, scis); this.bindFlat(); continue; }
        if (nv + 40 >= 12000 || ni + 120 >= 36000) flush();
        var base = nv, k, off;
        if (o.q === 2) {   // v2.2 decal quad (rotated, atlas sub-cell)
          var dsl = 6 + (o.v >> 2), dsb = o.v & 3, hs = SS / 2, u0 = (dsl % 4) * SS + (dsb & 1) * hs, v0 = Math.floor(dsl / 4) * SS + (dsb >> 1) * hs;
          var rc = Math.cos(o.r), rs = Math.sin(o.r), hw = o.w / 2;
          for (k = 0; k < 4; k++) {
            var lx = CSX[k] * hw, ly = CSY[k] * hw;
            off = nv * FLOATS; V[off] = (o.x + lx * rc - ly * rs) * sc; V[off + 1] = (o.y + lx * rs + ly * rc) * sc;
            V[off + 2] = (u0 + (CSX[k] + 1) / 2 * hs) / AW; V[off + 3] = (v0 + (CSY[k] + 1) / 2 * hs) / AH; V[off + 4] = 0; V[off + 5] = 0;
            V[off + 6] = o.c[0]; V[off + 7] = o.c[1]; V[off + 8] = o.c[2]; V[off + 9] = 1;
            V[off + 10] = o.a; V[off + 11] = 14; V[off + 12] = 0; V[off + 13] = 0; nv++;
          }
          I[ni++] = base; I[ni++] = base + 1; I[ni++] = base + 2; I[ni++] = base; I[ni++] = base + 2; I[ni++] = base + 3;
        } else if (o.q) {
          for (k = 0; k < 4; k++) {
            var cx0 = CSX[k], cy0 = CSY[k];
            off = nv * FLOATS; V[off] = (o.x + cx0 * o.w / 2) * sc; V[off + 1] = (o.y + cy0 * o.h / 2) * sc; V[off + 2] = 0; V[off + 3] = 0;
            V[off + 4] = (cx0 + 1) / 2; V[off + 5] = (cy0 + 1) / 2; V[off + 6] = o.c[0]; V[off + 7] = o.c[1]; V[off + 8] = o.c[2]; V[off + 9] = o.c[3];
            V[off + 10] = o.a; V[off + 11] = o.k; V[off + 12] = o.sf || 0; V[off + 13] = 0; nv++;
          }
          I[ni++] = base; I[ni++] = base + 1; I[ni++] = base + 2; I[ni++] = base; I[ni++] = base + 2; I[ni++] = base + 3;
        } else {
          var m = o.m, s = SLOT[m.sprite], sx = (s % 4) * SS, sy = Math.floor(s / 4) * SS, t = o.t;
          for (k = 0; k < m.n; k++) {
            off = nv * FLOATS; V[off] = (m.px[k] + o.ox) * sc; V[off + 1] = (m.py[k] + o.oy) * sc;
            V[off + 2] = (sx + m.u[k] * SS) / AW; V[off + 3] = (sy + m.v[k] * SS) / AH; V[off + 4] = m.u[k]; V[off + 5] = m.v[k];
            V[off + 6] = t ? t[0] : 0; V[off + 7] = t ? t[1] : 0; V[off + 8] = t ? t[2] : 0; V[off + 9] = t ? t[3] : 0;
            V[off + 10] = o.a; V[off + 11] = o.k; V[off + 12] = o.f; V[off + 13] = o.s; nv++;
          }
          for (k = 0; k < IDX.length; k++) I[ni++] = base + IDX[k];
        }
      }
      flush();
    }
    gl.disable(gl.SCISSOR_TEST);
  };
  // one lit shell: back + front surfaces, depth-tested only against itself (depth cleared inside its own bbox),
  // so between pieces the usual painter's order still holds
  Renderer.prototype.drawLit = function (o, scis) {
    var gl = this.gl, lt = this.lit, L = lt.loc, v = o.L, sc = this.scale, W = this.canvas.width, H = this.canvas.height;
    var n = v.n, V = lt.verts, I = lt.inds, k, off, zr = 1 / (v.S * 0.6), x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    var back = this.litBack !== false && !v.frontOnly;
    for (var side = back ? 0 : 1; side < 2; side++) {
      var X = side ? v.xf : v.xb, Z = side ? v.zf : v.zb, Nn = side ? v.nf : v.nb, b0 = side * n;
      for (k = 0; k < n; k++) {
        off = (b0 + k) * LFLOATS; var px = (X[k] + o.ox) * sc, py = (v.y[k] + o.oy) * sc;
        V[off] = px; V[off + 1] = py; V[off + 2] = Math.max(-0.98, Math.min(0.98, -Z[k] * zr));
        V[off + 3] = Nn[k * 3]; V[off + 4] = Nn[k * 3 + 1]; V[off + 5] = Nn[k * 3 + 2];
        V[off + 6] = v.u[k]; V[off + 7] = v.v[k]; V[off + 8] = o.a; V[off + 9] = o.f; V[off + 10] = side ? 1 : -1; V[off + 11] = 0;
        if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
      }
    }
    var ix = v.idx, ni = 0;
    if (back) for (k = 0; k < ix.length; k++) I[ni++] = ix[k];  // back first
    for (k = 0; k < ix.length; k++) I[ni++] = ix[k] + n;        // then front
    gl.useProgram(lt.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, lt.vbo); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lt.ibo);
    var st = LFLOATS * 4;
    gl.disableVertexAttribArray(this.loc.lc); gl.disableVertexAttribArray(this.loc.col);
    gl.enableVertexAttribArray(L.pos); gl.vertexAttribPointer(L.pos, 3, gl.FLOAT, false, st, 0);
    gl.enableVertexAttribArray(L.n); gl.vertexAttribPointer(L.n, 3, gl.FLOAT, false, st, 12);
    gl.enableVertexAttribArray(L.uv); gl.vertexAttribPointer(L.uv, 2, gl.FLOAT, false, st, 24);
    gl.enableVertexAttribArray(L.fx); gl.vertexAttribPointer(L.fx, 4, gl.FLOAT, false, st, 32);
    if (!this._litSet) {   // v2.2: program uniforms persist → set once per frame, not per shell
      var LG = Renderer.LIGHT; this._litSet = true;
      gl.uniform2f(L.res, W, H); gl.uniform1i(L.base, 1); gl.uniform1i(L.mat, 2);
      gl.uniform3f(L.light, LG.dir[0], LG.dir[1], LG.dir[2]); gl.uniform4f(L.k, LG.k[0], LG.k[1], LG.k[2], LG.k[3]); gl.uniform4f(L.k2, LG.k2[0], LG.k2[1], LG.k2[2], LG.k2[3]);
    }
    // depth: clear only this item's bbox (∩ batch scissor), test LESS
    var bx = Math.floor(x0) - 2, by = Math.floor(y0) - 2, bw = Math.ceil(x1 - x0) + 4, bh = Math.ceil(y1 - y0) + 4;
    if (scis) { var sx0 = scis.x * sc, sy0 = scis.y * sc, sx1 = (scis.x + scis.w) * sc, sy1 = (scis.y + scis.h) * sc; var nx0 = Math.max(bx, sx0), ny0 = Math.max(by, sy0); bw = Math.min(bx + bw, sx1) - nx0; bh = Math.min(by + bh, sy1) - ny0; bx = nx0; by = ny0; }
    if (bw > 0 && bh > 0) {
      gl.enable(gl.SCISSOR_TEST); gl.scissor(Math.floor(bx), Math.floor(H - by - bh), Math.ceil(bw), Math.ceil(bh));
      gl.depthMask(true); gl.clearDepth(1); gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, V.subarray(0, 2 * n * LFLOATS));
      gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, I.subarray(0, ni));
      gl.drawElements(gl.TRIANGLES, ni, gl.UNSIGNED_SHORT, 0);
      gl.disable(gl.DEPTH_TEST);
      this.stats.litDraws++; this.stats.litVerts += (back ? 2 : 1) * n;
    }
    // restore batch scissor
    if (scis) { gl.enable(gl.SCISSOR_TEST); gl.scissor(Math.floor(scis.x * sc), Math.floor(H - (scis.y + scis.h) * sc), Math.ceil(scis.w * sc), Math.ceil(scis.h * sc)); }
    else gl.disable(gl.SCISSOR_TEST);
    gl.disableVertexAttribArray(L.n);
  };

  // ---- Canvas2D fallback: affine-mapped triangles, simple overlays for specials
  Renderer.prototype.end2D = function () {
    var c = this.ctx, sc = this.scale, IDX = Body.IDX;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (var b = 0; b < this.batches.length; b++) {
      var bt = this.batches[b];
      c.save(); c.setTransform(sc, 0, 0, sc, 0, 0);
      if (bt.scissor) { c.beginPath(); c.rect(bt.scissor.x, bt.scissor.y, bt.scissor.w, bt.scissor.h); c.clip(); }
      for (var it = 0; it < bt.items.length; it++) {
        var o = bt.items[it];
        if (o.L || o.q === 2) continue;
        if (o.q) {
          var g = c.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.w / 2), col = o.c, rgb = Math.round(col[0] * 255) + ',' + Math.round(col[1] * 255) + ',' + Math.round(col[2] * 255);
          if (o.k === 10 || o.k === 13) { g.addColorStop(0, 'rgba(' + rgb + ',' + (col[3] * o.a) + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)'); c.save(); c.translate(o.x, o.y); c.scale(1, o.h / o.w); c.translate(-o.x, -o.y); c.fillStyle = g; c.beginPath(); c.arc(o.x, o.y, o.w / 2, 0, 7); c.fill(); c.restore(); }
          else { c.globalCompositeOperation = 'lighter'; g.addColorStop(0, 'rgba(' + rgb + ',' + (0.6 * o.a * col[3]) + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)'); c.fillStyle = g; c.beginPath(); c.arc(o.x, o.y, o.w / 2, 0, 7); c.fill(); c.globalCompositeOperation = 'source-over'; }
          continue;
        }
        var m = o.m, img = this.images[m.sprite], iw = img.width, ih = img.height;
        c.globalAlpha = o.a;
        for (var k = 0; k < IDX.length; k += 3) {
          var i0 = IDX[k], i1 = IDX[k + 1], i2 = IDX[k + 2];
          tri(c, img, m.px[i0] + o.ox, m.py[i0] + o.oy, m.px[i1] + o.ox, m.py[i1] + o.oy, m.px[i2] + o.ox, m.py[i2] + o.oy,
            m.u[i0] * iw, m.v[i0] * ih, m.u[i1] * iw, m.v[i1] * ih, m.u[i2] * iw, m.v[i2] * ih);
        }
        if (o.k) { // special overlay (approximate)
          var cx = (m.px[14] + m.px[21]) / 2 + o.ox, cy = (m.py[14] + m.py[21]) / 2 + o.oy, R = m.S * 0.36;
          c.save(); c.beginPath(); c.ellipse(cx, cy, R, R * 0.95, 0, 0, 7); c.clip();
          if (o.k <= 2) { c.strokeStyle = 'rgba(255,255,250,0.6)'; c.lineWidth = R * 0.18; c.beginPath(); for (var q = -2; q <= 2; q++) { if (o.k === 1) { c.moveTo(cx - R, cy + q * R * 0.42); c.lineTo(cx + R, cy + q * R * 0.42); } else { c.moveTo(cx + q * R * 0.42, cy - R); c.lineTo(cx + q * R * 0.42, cy + R); } } c.stroke(); }
          else if (o.k === 3) { c.fillStyle = 'rgba(255,140,60,' + (0.25 + 0.15 * Math.sin(this.time / 150)) + ')'; c.fillRect(cx - R, cy - R, 2 * R, 2 * R); }
          else { var gr = c.createLinearGradient(cx - R, cy - R, cx + R, cy + R); ['#ff7a7a', '#ffd36b', '#8be38b', '#7ac8ff', '#c49bff'].forEach(function (s, i) { gr.addColorStop(i / 4, s); }); c.globalAlpha = 0.55 * o.a; c.fillStyle = gr; c.fillRect(cx - R, cy - R, 2 * R, 2 * R); }
          c.restore();
        }
        if (o.f > 0.01) { c.globalAlpha = o.f * 0.6; c.fillStyle = '#fff'; c.beginPath(); c.arc((m.px[14] + m.px[21]) / 2 + o.ox, (m.py[14] + m.py[21]) / 2 + o.oy, m.S * 0.38, 0, 7); c.fill(); }
        c.globalAlpha = 1;
      }
      c.restore();
    }
  };
  function tri(c, img, x0, y0, x1, y1, x2, y2, u0, v0, u1, v1, u2, v2) {
    // expand slightly around the centroid to hide seams
    var mx = (x0 + x1 + x2) / 3, my = (y0 + y1 + y2) / 3, e = 0.6;
    function ex(x, y) { var dx = x - mx, dy = y - my, l = Math.sqrt(dx * dx + dy * dy) || 1; return [x + dx / l * e, y + dy / l * e]; }
    var a = ex(x0, y0), b = ex(x1, y1), d = ex(x2, y2);
    c.save(); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(d[0], d[1]); c.closePath(); c.clip();
    var den = u0 * (v1 - v2) + u1 * (v2 - v0) + u2 * (v0 - v1); if (Math.abs(den) < 1e-6) { c.restore(); return; }
    var m11 = (x0 * (v1 - v2) + x1 * (v2 - v0) + x2 * (v0 - v1)) / den, m12 = (x0 * (u2 - u1) + x1 * (u0 - u2) + x2 * (u1 - u0)) / den,
      m13 = (x0 * (u1 * v2 - u2 * v1) + x1 * (u2 * v0 - u0 * v2) + x2 * (u0 * v1 - u1 * v0)) / den,
      m21 = (y0 * (v1 - v2) + y1 * (v2 - v0) + y2 * (v0 - v1)) / den, m22 = (y0 * (u2 - u1) + y1 * (u0 - u2) + y2 * (u1 - u0)) / den,
      m23 = (y0 * (u1 * v2 - u2 * v1) + y1 * (u2 * v0 - u0 * v2) + y2 * (u0 * v1 - u1 * v0)) / den;
    c.transform(m11, m21, m12, m22, m13, m23); c.drawImage(img, 0, 0); c.restore();
  }
  JM.Renderer = Renderer;
})();
