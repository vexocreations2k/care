const $ = id => document.getElementById(id);

$("file").addEventListener("change", e => {
  const f = e.target.files[0];
  if (!f) return;
  const url = URL.createObjectURL(f);
  const img = $("img");
  img.onload = () => { analyse(img); };
  img.src = url;
  $("preview").hidden = false;
});

const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));

function analyse(img) {
  const c = $("c"), ctx = c.getContext("2d", { willReadFrequently: true });
  const s = 256 / Math.max(img.naturalWidth, img.naturalHeight);
  const w = Math.max(32, Math.round(img.naturalWidth * Math.min(1, s)));
  const h = Math.max(32, Math.round(img.naturalHeight * Math.min(1, s)));
  c.width = w; c.height = h;
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;

  const n = w * h, gray = new Float32Array(n);
  let skin = 0, bright = 0, hairPx = 0, dark = 0, lumSum = 0, lumSq = 0, satSum = 0;

  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 128 - 0.1687 * r - 0.3313 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.4187 * g - 0.0813 * b;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx ? (mx - mn) / mx : 0;
    gray[p] = y;
    const isSkin = y > 90 && cb > 77 && cb < 127 && cr > 135 && cr < 173 && sat > 0.18 && sat < 0.6;
    if (isSkin) { skin++; continue; }
    hairPx++;
    lumSum += y; lumSq += y * y; satSum += sat;
    if (y > 190 && sat < 0.35) bright++;
    if (y < 60) dark++;
  }

  // Texture: mean Sobel gradient magnitude
  let grad = 0, cnt = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const k = y * w + x;
    const gx = -gray[k - w - 1] - 2 * gray[k - 1] - gray[k + w - 1] + gray[k - w + 1] + 2 * gray[k + 1] + gray[k + w + 1];
    const gy = -gray[k - w - 1] - 2 * gray[k - w] - gray[k - w + 1] + gray[k + w - 1] + 2 * gray[k + w] + gray[k + w + 1];
    grad += Math.sqrt(gx * gx + gy * gy); cnt++;
  }
  grad /= cnt * 4;

  const hp = Math.max(1, hairPx);
  const mean = lumSum / hp;
  const contrast = Math.sqrt(Math.max(0, lumSq / hp - mean * mean));

  const scalp = clamp(skin / n * 100 * 2.5);        // visible scalp
  const shine = clamp(bright / hp * 100 * 6);       // highlight share
  const frizz = clamp((grad - 6) / 24 * 100);       // rough, high-frequency texture
  const dryness = clamp(frizz * 0.6 + (100 - shine) * 0.4 - (satSum / hp) * 20);
  const health = Math.round(clamp(100 - frizz * 0.35 - dryness * 0.25 - scalp * 0.25 + shine * 0.25));

  let label, explain;
  if (scalp > 45) {
    label = "Possible thinning or wide parting";
    explain = "A large part of the photo looks like scalp skin, so the hair may be thin or the parting wide.";
  } else if (frizz > 65 && shine < 30) {
    label = "Dry and frizzy";
    explain = "Rough, uneven texture and few highlights suggest dry or damaged hair.";
  } else if (frizz > 65) {
    label = "Frizzy or rough texture";
    explain = "There is a lot of fine texture in the image, which often means raised cuticles or flyaways.";
  } else if (shine > 55 && contrast < 55) {
    label = "Shiny, possibly oily";
    explain = "Strong, broad highlights with low contrast can mean oil or product build-up.";
  } else if (health >= 65) {
    label = "Healthy and smooth";
    explain = "Smooth texture and good shine suggest healthy hair.";
  } else {
    label = "Slightly dull";
    explain = "Texture is moderate and shine is low, so hair may need moisture.";
  }

  $("label").textContent = label + " (health " + health + "/100)";
  $("explain").textContent = explain;

  const rows = [
    ["Shine", shine, true], ["Smoothness", 100 - frizz, true],
    ["Moisture", 100 - dryness, true], ["Scalp coverage", 100 - scalp, true]
  ];
  $("metrics").innerHTML = rows.map(([name, v]) => {
    v = Math.round(v);
    const col = v >= 65 ? "var(--good)" : v >= 40 ? "var(--mid)" : "var(--low)";
    return '<div class="m"><div class="row"><span>' + name + '</span><span>' + v + '%</span></div>' +
           '<div class="track"><div class="fill" style="width:' + v + '%;background:' + col + '"></div></div></div>';
  }).join("");

  const tips = [];
  if (frizz > 50) tips.push("Use a leave-in conditioner and detangle gently, from the ends upward.");
  if (dryness > 50) tips.push("Deep condition weekly and limit heat styling; use a heat protectant.");
  if (shine > 55) tips.push("Use a clarifying shampoo every 1 to 2 weeks and avoid heavy oils near the roots.");
  if (scalp > 45) tips.push("Take a second photo in natural light. If thinning persists, see a dermatologist.");
  if (!tips.length) tips.push("Your hair looks good. Keep your routine and retest in a month.");
  $("tips").innerHTML = tips.map(t => "<li>" + t + "</li>").join("");
  $("result").hidden = false;
}
