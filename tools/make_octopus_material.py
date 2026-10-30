"""v2.1 octopus B material (offline, reproducible). Inputs: the approved 512 colour PNG only.
Outputs (assets/material/):
  octopus_base_delit.png  - colour with baked specular spots masked + inpainted, low-frequency baked shading partly divided out
  octopus_mat.png         - R thickness (from silhouette inflation + authored head ellipsoid, NOT from luminance)
                            G ambient occlusion (crease/cavity of the thickness field + head/tentacle junction)
                            B face region mask (eyes+mouth area, feathered)
  octopus_specmask.png    - detected baked highlight mask (for the audit / review)
  ../js/material_octopus.js - the above embedded as data URIs (file:// + WebGL needs same-origin pixels)
All constants are 待测初值 (initial guesses to be tuned)."""
import numpy as np, json, base64, io, sys
from PIL import Image
from scipy import ndimage as nd

SRC = '/workspace/jelly/assets/Jelly_Match3_AssetPack_V1/assets/characters/jelly_octopus/jelly_octopus_512.png'
OUT = '/workspace/jelly/game_v2.1/assets/material/'
JS = '/workspace/jelly/game_v2.1/js/material_octopus.js'
HEAD = dict(cx=262.0, cy=200.0, rx=128.0, ry=113.0, ryLow=150.0, rz=118.0)   # authored head ellipsoid (px in the 512 sprite); lower half flows into the arm base
FACE = dict(cx=238.0, cy=280.0, rx=92.0, ry=40.0)                   # eyes + mouth band
HMAX = 128.0                                                        # thickness normalisation (px)

im = np.asarray(Image.open(SRC).convert('RGBA')).astype(np.float64) / 255
rgb, al = im[..., :3], im[..., 3]
H, W = al.shape
yy, xx = np.mgrid[0:H, 0:W].astype(np.float64)
inside = al > 0.5
L = rgb @ np.array([0.2126, 0.7152, 0.0722])
mx, mn = rgb.max(-1), rgb.min(-1)
sat = np.where(mx > 1e-6, (mx - mn) / np.maximum(mx, 1e-6), 0)

def mblur(img, w, s):
    """alpha/mask-weighted gaussian blur"""
    if img.ndim == 3:
        return np.stack([mblur(img[..., c], w, s) for c in range(img.shape[2])], -1)
    a = nd.gaussian_filter(img * w, s); b = nd.gaussian_filter(w, s)
    return a / np.maximum(b, 1e-6)

# ---- 1) baked specular detection (local luminance excess, low saturation), eyes/mouth protected
Lb = mblur(L, al, 6)
dark = (L < 0.24) & inside
eyes = nd.binary_dilation(dark, iterations=7)
spec = inside & ((L - Lb) > 0.05) & (L > 0.6) & (sat < 0.6) & ~eyes
spec = nd.binary_dilation(spec, iterations=2) & inside & ~eyes
specS = np.clip(nd.gaussian_filter(spec.astype(float), 1.4) * 1.6, 0, 1) * (~eyes)

# ---- 2) inpaint the spots from surrounding colour
w = al * (1 - np.clip(specS * 2, 0, 1))
fill = mblur(rgb, w, 5)
fill2 = mblur(rgb, w, 14)
holes = nd.gaussian_filter(w, 5) < 0.15
fill[holes] = fill2[holes]
base = rgb * (1 - specS[..., None]) + fill * specS[..., None]

# ---- 3) partially divide out low-frequency baked shading (the B shader re-lights)
Lbase = base @ np.array([0.2126, 0.7152, 0.0722])
F = mblur(Lbase, al * (~eyes), 30)
ref = np.median(F[inside])
SHADE_K = 0.55                                                       # 待测初值: share of baked shading removed
ratio = np.clip((ref / np.maximum(F, 1e-3)) ** SHADE_K, 0.8, 1.3)
ratio = np.where(eyes, 1.0, ratio)
ratio = nd.gaussian_filter(ratio, 2)
delit = np.clip(base * ratio[..., None], 0, 1)

# ---- 4) thickness: silhouette inflation (local tube radius) + authored head ellipsoid
d = nd.distance_transform_edt(al > 0.35)
disk = (np.hypot(*np.mgrid[-24:25, -24:25]) <= 24)
r = np.minimum(np.maximum(nd.maximum_filter(d, footprint=disk), d), 34.0)   # local tube radius (tentacles ~20-30 px)
h_dt = np.sqrt(np.maximum(0, d * (2 * r - np.minimum(d, r))))
h_dt = np.where(d < r, h_dt, r)                                            # flat-topped beyond the tube radius
def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
low = sstep(HEAD['cy'], HEAD['cy'] + 80, yy)
ryy = HEAD['ry'] + (HEAD['ryLow'] - HEAD['ry']) * low
q = ((xx - HEAD['cx']) / HEAD['rx']) ** 2 + ((yy - HEAD['cy']) / ryy) ** 2
h_head = HEAD['rz'] * np.clip(1 - q, 0, 1) ** (0.5 + 0.3 * low)
headW = np.clip((1 - q) / 0.2, 0, 1)
h = np.maximum(h_dt * (1 - headW), h_head) * (al > 0.35)
h = nd.gaussian_filter(h, 1.5)
thick = np.clip(h / HMAX, 0, 1)

# ---- 5) AO: creases of the thickness field + junction under the head
cav = nd.gaussian_filter(h, 12) - h
ao = 1 - 0.45 * np.clip(cav / 16, 0, 1)
headreg = (((xx - HEAD['cx']) / HEAD['rx']) ** 2 + ((yy - HEAD['cy']) / HEAD['ry']) ** 2) < 1.0   # visible head (for the junction AO)
dh = nd.distance_transform_edt(~headreg)
tent = (~headreg) & (al > 0.35)
ao *= 1 - 0.32 * np.exp(-dh / 12) * tent
ao = np.clip(nd.gaussian_filter(ao, 1.2), 0, 1)

# ---- 6) face mask
fq = ((xx - FACE['cx']) / FACE['rx']) ** 2 + ((yy - FACE['cy']) / FACE['ry']) ** 2
face = np.clip((1.35 - fq) / 0.6, 0, 1)

def png(arr, mode):
    img = Image.fromarray(np.clip(arr * 255 + 0.5, 0, 255).astype(np.uint8), mode)
    b = io.BytesIO(); img.save(b, 'PNG', optimize=True); return img, b.getvalue()

base_img, base_png = png(np.dstack([delit, al]), 'RGBA')
mat_img, mat_png = png(np.dstack([thick, ao, face]), 'RGB')
spec_img, _ = png(specS, 'L')
base_img.save(OUT + 'octopus_base_delit.png'); mat_img.save(OUT + 'octopus_mat.png'); spec_img.save(OUT + 'octopus_specmask.png')

stats = dict(
    opaque_px=int(inside.sum()), spec_px=int(spec.sum()), spec_frac=round(float(spec.sum() / inside.sum()), 4),
    L_p50=round(float(np.median(L[inside])), 3), L_p99=round(float(np.percentile(L[inside], 99)), 3),
    L_after_p99=round(float(np.percentile((delit @ np.array([0.2126, 0.7152, 0.0722]))[inside], 99)), 3),
    head_left_right_L_before=[round(float(L[inside & headreg & (xx < HEAD['cx'])].mean()), 3), round(float(L[inside & headreg & (xx >= HEAD['cx'])].mean()), 3)],
    head_left_right_L_after=[round(float((delit @ np.array([0.2126, 0.7152, 0.0722]))[inside & headreg & (xx < HEAD['cx'])].mean()), 3),
                             round(float((delit @ np.array([0.2126, 0.7152, 0.0722]))[inside & headreg & (xx >= HEAD['cx'])].mean()), 3)],
    lowfreq_shading_range=[round(float(np.percentile(F[inside], 5)), 3), round(float(np.percentile(F[inside], 95)), 3)],
    thickness_max_px=round(float(h.max()), 1), tentacle_tip_thickness_px_p10=round(float(np.percentile(h[tent & (h > 1)], 10)), 1))
print(json.dumps(stats, indent=1))
json.dump(stats, open(OUT + 'octopus_material_stats.json', 'w'), indent=1)

u = lambda b: 'data:image/png;base64,' + base64.b64encode(b).decode()
with open(JS, 'w') as f:
    f.write('/* generated by tools/make_octopus_material.py — octopus B material (de-lit colour + R thickness / G AO / B face mask) */\n')
    f.write('(function () { window.JM = window.JM || {}; JM.MAT = JM.MAT || {};\n')
    f.write('JM.MAT.jelly_octopus = ' + json.dumps(dict(head=HEAD, face=FACE, hmax=HMAX)) + ';\n')
    f.write("JM.MAT.jelly_octopus.base = '" + u(base_png) + "';\n")
    f.write("JM.MAT.jelly_octopus.mat = '" + u(mat_png) + "';\n")
    f.write('})();\n')
print('js bytes', len(open(JS).read()))
