/**
 * Prints: a rounded tray holding six prints, one for each year. The print under the pointer stands up and lifts; the ones in
 * front lean forward and the ones behind lean back, staggered outwards from it on the 700ms lift curve. Each print's place is
 * punched on its tab, as one lit dot in a 3 × 2 grid, and goes to the read-out when the print is pulled. The slider is the
 * stagger, in ms. At rest the newest print, the one in front, holds the one bright dot.
 *
 * Adapted from Riffle, one of the six figures of @lucasmarkes/hairline (MIT, see src/lib/hairline/LICENSE): the same pattern,
 * discrete items on tweens, a stagger by distance and a hit test on bands along the resting top edges, with six prints in
 * place of eight cards and a picture window in place of the lines of text. A plain script of the kernel's own shape: it reads
 * the global HL that src/lib/hairline/kernel.js sets, and ends with `export default` where the bench says `hairline(`.
 * Kept out of prettier (.prettierignore): the figure checker holds it to 200 lines as written.
 */
const {
  Cam, clamp, facing, fillet, fit, hull, open, poly, proj, rad, ringAt, rrect, run, seg,
  tdone, tset, tval, tween, disposer, mk, place, pointer, register,
} = HL;

const N = 6, W = 84, H = 54, G = 13, TW = 22, TH = 7, TABS = [6, 31, 56], TK = 1.4;
const REST = -12, BACK = -24, FWD = 20, LIFT = 16;
const X0 = -5, X1 = W + 5, Y0 = -9, Y1 = (N - 1) * G + 9, WH = 20, WR = 6, WT = 2.4;
/** The picture window on a print's face: a filleted rectangle in the print's own plane. */
const WIN = fillet([[8, 8], [W - 8, 8], [W - 8, H - 17], [8, H - 17]], [2, 2, 2, 2], 3);

/** A run of points ordered left to right on screen. */
const LR = (pts) => (pts[0][0] <= pts[pts.length - 1][0] ? pts : pts.slice().reverse());

/** The tray, which never moves: `far` is painted before the prints, `near` after them; each entry is [d, class]. */
function tray(P, front, outer, inner) {
  // far half: body, the rim's inner edge, and the floor seam along the far walls
  const far = [
    [poly(hull(ringAt(P, outer, 0).concat(ringAt(P, outer, WH)))), "sil"],
    [poly(ringAt(P, inner, WH)), "nf"],
    [open(ringAt(P, run(inner, (q) => !front(q)), 2.5)), "nf lo"],
  ];
  // near half: one opaque piece from the rim's inner edge down to the floor
  const iF = LR(ringAt(P, run(inner, front), WH)), oT = LR(ringAt(P, run(outer, front), WH)), oB = LR(ringAt(P, run(outer, front), 0));
  // a finger pull, set into the front
  const hx = (X0 + X1) / 2, onFront = (ring) => ring.map((q) => P(q.u, Y1, q.v));
  const near = [
    [poly([...iF, oT[oT.length - 1], ...oB.slice().reverse(), oT[0]]), "fo"],
    [open(oT), "nf lo"],
    [open(iF), "nf"],
    [open([oT[0], ...oB, oT[oT.length - 1]]), "nf sil"],
    [poly(onFront(rrect(hx - 11, 6.5, hx + 11, 12.5, 3, 5))), "nf"],
    [poly(onFront(rrect(hx - 9.4, 8, hx + 9.4, 11, 1.5, 5))), "nf lo"],
  ];
  return { far, near };
}

/** Print i, back to front: its place (1 at the back, 6 in front), which of three tab positions it takes, and its filleted outline, upright in its own plane. */
function card(i) {
  const n = i + 1, t0 = TABS[(N - 1 - i) % 3];
  const shape = fillet(
    [[0, 0], [W, 0], [W, H], [t0 + TW, H], [t0 + TW, H + TH], [t0, H + TH], [t0, H], [0, H]],
    [1, 1, 3.2, 1.8, 2.4, 2.4, 1.8, 3.2],
  );
  return { n, t0, shape };
}

/** Print i leaning th degrees (negative leans back) and lifted by `lift`: its paths, and where its six punches sit. */
function pose(P, i, t0, shape, th, lift) {
  const yb = i * G, s = Math.sin(rad(th)), c = Math.cos(rad(th));
  const w = (u, v) => P(u, yb + v * s, v * c + lift);
  const wb = (u, v) => P(u, yb + v * s - TK * c, v * c + TK * s + lift);
  const punch = [];
  for (let k = 0; k < 6; k++) punch.push(w(t0 + TW / 2 + ((k % 3) - 1) * 5.4, H + TH / 2 + (0.5 - Math.floor(k / 3)) * 2.8));
  return {
    back: poly(shape.map((p) => wb(p[0], p[1]))),
    face: poly(shape.map((p) => w(p[0], p[1]))),
    head: seg(w(6, H - 11), w(W - 6, H - 11)),
    win: poly(WIN.map((p) => w(p[0], p[1]))),
    punch,
  };
}

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let stag = value;

  // The camera is fitted to the tray with a print lifted, so nothing leaves the frame in any pose.
  const C = Cam(45, 0.5, 2.1);
  fit(C, [[X0, Y0, 0], [X1, Y1, -8], [X1, Y0, 0], [X0, Y1, 0], [X0, Y0, H + TH], [X1, Y0, H + TH + LIFT]], 200, 166);
  const P = proj(C), front = facing(C);
  const outer = rrect(X0, Y0, X1, Y1, WR, 6), inner = rrect(X0 + WT, Y0 + WT, X1 - WT, Y1 - WT, WR - WT, 6);
  const paths = tray(P, front, outer, inner);

  const g = mk("g", {}, svg);
  for (const [d, cls] of paths.far) mk("path", { d, class: cls }, g);

  const cards = [];
  for (let i = 0; i < N; i++) {
    const { n, t0, shape } = card(i);
    const grp = mk("g", {}, g);
    const back = mk("path", { class: "lo" }, grp), face = mk("path", { class: "sil" }, grp);
    const head = mk("path", { class: "nf" }, grp), win = mk("path", { class: "nf lo" }, grp);
    // the print's place, punched in a 3 × 2 grid on its tab; the newest holds the one bright dot at rest
    const punch = [];
    for (let k = 0; k < 6; k++) punch.push(mk("circle", { r: 1.05, class: "dot" + (k !== n - 1 ? " off" : i === N - 1 ? "" : " m") }, grp));
    cards.push({ n, t0, shape, back, face, head, win, punch, a: tween(REST), z: tween(0), th: NaN, lz: NaN });
  }

  for (const [d, cls] of paths.near) mk("path", { d, class: cls }, g);

  // hit bands: oblique strips along the RESTING top edges. They never move, and nothing draws them.
  const top = (i) => P(W / 2, i * G + H * Math.sin(rad(REST)), H * Math.cos(rad(REST)));
  const c0 = top(0), c1 = top(1), d = [c1[0] - c0[0], c1[1] - c0[1]];
  const px0 = P(0, 0, 0), px1 = P(1, 0, 0), ex = [px1[0] - px0[0], px1[1] - px0[1]];
  const HALF = W / 2 + 6, det = d[0] * ex[1] - d[1] * ex[0];

  /** The print whose band holds the point, in the band's own (s, r) coordinates; -1 outside. */
  function hit([x, y]) {
    const qx = x - c0[0], qy = y - c0[1];
    const s = (qx * ex[1] - qy * ex[0]) / det, r = (d[0] * qy - d[1] * qx) / det;
    if (Math.abs(r) > HALF || s < -0.5 || s > N + 1) return -1;
    return clamp(Math.round(s), 0, N - 1);
  }

  function draw(i, th, lift) {
    const cd = cards[i], q = pose(P, i, cd.t0, cd.shape, th, lift);
    cd.back.setAttribute("d", q.back);
    cd.face.setAttribute("d", q.face);
    cd.head.setAttribute("d", q.head);
    cd.win.setAttribute("d", q.win);
    cd.punch.forEach((el, k) => place(el, q.punch[k]));
  }

  const B = register(stage, (_dt, now) => {
    let moving = false;
    cards.forEach((cd, i) => {
      const th = tval(cd.a, now), lift = tval(cd.z, now);
      // a print whose lean and lift have not moved keeps its paths
      if (th !== cd.th || lift !== cd.lz) { cd.th = th; cd.lz = lift; draw(i, th, lift); }
      if (!tdone(cd.a, now) || !tdone(cd.z, now)) moving = true;
    });
    return moving;
  });
  bag.add(B.unregister);

  let act = -1;
  const caption = (a) => (a < 0 ? "rest" : String(a + 1).padStart(2, "0"));
  /** Pulls print a (-1 puts them all back). The stagger spreads out from the print pulled, or the one let go. */
  function setActive(a) {
    if (a === act) return;
    const now = performance.now(), from = a >= 0 ? a : act;
    act = a;
    cards.forEach((cd, i) => {
      const delay = Math.abs(i - from) * stag;
      const th = a < 0 ? REST : i < a ? BACK : i > a ? FWD : 0;
      tset(cd.a, th, now, delay); tset(cd.z, a === i ? LIFT : 0, now, delay);
      cd.face.classList.toggle("hi", i === a); cd.head.classList.toggle("hi", i === a);
      // one bright dot: the print pulled, or the newest at rest
      cd.punch[cd.n - 1].classList.toggle("m", i !== (a < 0 ? N - 1 : a));
    });
    read.textContent = caption(a);
    B.wake();
  }

  bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { stag = v; },
    destroy: bag.dispose,
  };
}

export default {
  name: "prints",
  means: "Six prints in a tray, one for each year: the one under the pointer stands up, and its neighbours lean away in turn.",
  rules: [1, 2, 5, 8],
  range: [0, 40, 90],
  tour: [[168, 134], [207, 115], [246, 96], null],
  mount,
};
