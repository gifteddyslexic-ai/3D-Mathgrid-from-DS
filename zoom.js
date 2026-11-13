/*
 * 3D MathGrid - Zoom view (Powers of 10), inside Place Value.
 *
 * Kept in its own file so the main index.html only needs a few small hooks.
 * The Zoom view never changes Build's settings (sliders, Decimals, 9 places,
 * large mode). It draws into its own 3D group and hides Build's groups while
 * it is open, so going back to Build shows exactly what was there before.
 *
 * index.html calls:
 *   MathGridZoom.attach(hooks)   once the 3D view has started
 *   MathGridZoom.tick(now)       every frame (instead of Build's auto-zoom while active)
 *   MathGridZoom.beforeMode(m)   at the start of switchMode()
 *   MathGridZoom.refresh()       after the shape toggle or saturation changes
 *
 * Exponent e = 3 x level + shape (0 unit, 1 rod, 2 flat), from 10^-18 to 10^18.
 */
(function () {
    'use strict';

    var Z = { active: false, attached: false };
    window.MathGridZoom = Z;

    // ------------------------------------------------------------------
    // Names
    // ------------------------------------------------------------------
    var MIN_E = -18, MAX_E = 18;
    var LETTERS = { '-6': 'a', '-5': 'f', '-4': 'p', '-3': 'n', '-2': 'µ', '-1': 'm', '0': '1', '1': 'k', '2': 'M', '3': 'G', '4': 'T', '5': 'P', '6': 'E' };
    var LEVEL_WORDS = { '-6': 'atto', '-5': 'femto', '-4': 'pico', '-3': 'nano', '-2': 'micro', '-1': 'milli', '0': 'ones', '1': 'kilo', '2': 'mega', '3': 'giga', '4': 'tera', '5': 'peta', '6': 'exa' };
    var PREFIXES = { '18': 'exa (E)', '15': 'peta (P)', '12': 'tera (T)', '9': 'giga (G)', '6': 'mega (M)', '3': 'kilo (k)', '2': 'hecto (h)', '1': 'deca (da)', '0': 'none', '-1': 'deci (d)', '-2': 'centi (c)', '-3': 'milli (m)', '-6': 'micro (µ)', '-9': 'nano (n)', '-12': 'pico (p)', '-15': 'femto (f)', '-18': 'atto (a)' };
    var SHORT = { '18': 'exa', '15': 'peta', '12': 'tera', '9': 'giga', '6': 'mega', '3': 'kilo', '2': 'hecto', '1': 'deca', '0': 'one', '-1': 'deci', '-2': 'centi', '-3': 'milli', '-6': 'micro', '-9': 'nano', '-12': 'pico', '-15': 'femto', '-18': 'atto' };
    var BIG = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion', 'quintillion'];
    var VIEWS = ['Prefix', 'Exponent', 'Number', 'Scientific notation', 'Name'];
    var VIEW_SHORT = ['Prefix', 'Exponent', 'Number', 'Scientific', 'Name'];
    var SHAPE_CSS = ['var(--color-units)', 'var(--color-tens)', 'var(--color-hundreds)'];

    function levelOf(e) { return Math.floor(e / 3); }
    function shapeOf(e) { return e - 3 * levelOf(e); }
    function letterOf(L) { return LETTERS[String(L)] || ''; }
    function unitsOf(L) { return L === 0 ? 'units' : (letterOf(L) ? letterOf(L) + '-cubes' : 'smaller cubes'); }
    function expText(e) { return e < 0 ? '−' + (-e) : String(e); }
    function prefixOf(e) {
        var p = PREFIXES[String(e)];
        if (p) return p;
        return 'none – ' + (shapeOf(e) === 1 ? '10 ' : '100 ') + letterOf(levelOf(e));
    }
    function nameOf(e) {
        var L = levelOf(e), s = shapeOf(e);
        if (e >= 0) {
            if (L === 0) return ['one', 'ten', 'one hundred'][s];
            return ['one ', 'ten ', 'one hundred '][s] + BIG[L];
        }
        var n = -e, Ln = Math.floor(n / 3), sn = n % 3, base;
        if (Ln === 0) base = ['', 'tenth', 'hundredth'][sn];
        else { var bw = BIG[Ln] + 'th'; base = sn === 0 ? bw : (sn === 1 ? 'ten-' : 'hundred-') + bw; }
        return 'one ' + base;
    }
    function reelName(e) {
        return SHORT[String(e)] || ((shapeOf(e) === 1 ? '10 ' : '100 ') + letterOf(levelOf(e)));
    }
    // Digits of 10^e, each coloured by its place within its group of three.
    function digitsOf(e) {
        var d = [], GREY = '#8a8db0';
        if (e >= 0) {
            for (var p = e; p >= 0; p--) {
                d.push({ ch: p === e ? '1' : '0', c: SHAPE_CSS[p % 3] });
                if (p > 0 && p % 3 === 0) d.push({ ch: ',', c: GREY });
            }
        } else {
            d.push({ ch: '0', c: SHAPE_CSS[0] });
            d.push({ ch: '.', c: GREY });
            for (var k = 1; k <= -e; k++) {
                d.push({ ch: k === -e ? '1' : '0', c: SHAPE_CSS[((-k) % 3 + 3) % 3] });
                if (k < -e && k % 3 === 0) d.push({ ch: ' ', c: GREY });
            }
        }
        return d;
    }
    function captionFor(bL, bS, tt) {
        if (bS === 0) {
            if (tt > 0) return '10 ' + unitsOf(bL) + ' make 1 rod';
            return bL === 0 ? '1 unit' : '1 ' + letterOf(bL) + '-cube = 1000 ' + unitsOf(bL - 1);
        }
        if (bS === 1) return tt > 0 ? '10 rods make 1 flat' : '1 rod = 10 ' + unitsOf(bL);
        if (tt >= 0.6) return 'Zoom out: 1 ' + letterOf(bL + 1) + '-cube is the new unit';
        return tt > 0 ? '10 flats make 1 cube = 1000 ' + unitsOf(bL) : '1 flat = 100 ' + unitsOf(bL);
    }

    // ------------------------------------------------------------------
    // Small maths helpers
    // ------------------------------------------------------------------
    function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
    function ease(x) { x = clamp01(x); return x * x * (3 - 2 * x); }
    function seg(t, a, b) { return ease((t - a) / (b - a)); }
    function lerp(a, b, f) { return a + (b - a) * f; }
    function reduceMotion() {
        try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
    }

    // ------------------------------------------------------------------
    // State
    // ------------------------------------------------------------------
    var H = null; // hooks from index.html
    var st = { e: 0, target: 0, anim: null, slow: false, src: '', scaleOpen: true, view: 2, all: false };
    var followUntil = 0, lastNow = 0;
    var saved = null; // camera/controls settings to put back when leaving Zoom
    var C = 4.5;      // centre of a 10 x 10 x 10 cube of pieces (pieces sit at 0..9)

    // 3D objects
    var group, pieces, pieceMat, block, blockMat, letterSprite, letterCanvas, letterTex, letterText = null;
    var MAX_PIECES = 1000, PIECE = 0.9;
    var dummy, tmpColA, tmpColB;

    function makePieceGeometry() {
        return H.shape() === 'cube'
            ? new THREE.BoxGeometry(PIECE, PIECE, PIECE)
            : new THREE.SphereGeometry(PIECE / 2, 20, 14);
    }
    function makeBlockGeometry() {
        return H.shape() === 'cube'
            ? new THREE.BoxGeometry(9.9, 9.9, 9.9)
            : new THREE.SphereGeometry(4.95, 48, 32);
    }
    function build3D() {
        group = new THREE.Group();
        group.visible = false;
        H.scene.add(group);
        dummy = new THREE.Object3D();
        tmpColA = new THREE.Color(); tmpColB = new THREE.Color();

        pieceMat = new THREE.MeshPhongMaterial({ shininess: 30, specular: 0x111111 });
        pieces = new THREE.InstancedMesh(makePieceGeometry(), pieceMat, MAX_PIECES);
        pieces.frustumCulled = false;
        pieces.count = 0;
        group.add(pieces);

        blockMat = new THREE.MeshPhongMaterial({ shininess: 30, specular: 0x111111, transparent: true, depthWrite: false });
        block = new THREE.Mesh(makeBlockGeometry(), blockMat);
        block.position.set(C, C, C);
        block.visible = false;
        block.renderOrder = 2;
        group.add(block);

        letterCanvas = document.createElement('canvas');
        letterCanvas.width = letterCanvas.height = 256;
        letterTex = new THREE.CanvasTexture(letterCanvas);
        letterSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: letterTex, transparent: true, depthTest: false, depthWrite: false }));
        letterSprite.renderOrder = 10;
        letterSprite.visible = false;
        group.add(letterSprite);
    }
    function drawLetter(text) {
        if (text === letterText) return;
        letterText = text;
        var g = letterCanvas.getContext('2d');
        g.clearRect(0, 0, 256, 256);
        g.font = '800 170px -apple-system, "Helvetica Neue", Arial, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineJoin = 'round';
        g.lineWidth = 18;
        g.strokeStyle = 'rgba(10,10,26,0.9)';
        g.strokeText(text, 128, 136);
        g.fillStyle = '#ffffff';
        g.fillText(text, 128, 136);
        letterTex.needsUpdate = true;
    }
    function shapeColour(out, s) {
        var key = ['units', 'tens', 'hundreds'][s];
        out.copy(H.color(H.placeHex[key]));
        return out;
    }

    // ------------------------------------------------------------------
    // Drawing one frame of the scene.
    // The step drawn is always "forward from base state (bL, bS)" at time tt
    // (0..1); a ÷10 step plays the same thing with tt running backwards.
    // ------------------------------------------------------------------
    var box = { min: [0, 0, 0], max: [0, 0, 0] };
    function grow(x, y, z, r) {
        if (x - r < box.min[0]) box.min[0] = x - r; if (x + r > box.max[0]) box.max[0] = x + r;
        if (y - r < box.min[1]) box.min[1] = y - r; if (y + r > box.max[1]) box.max[1] = y + r;
        if (z - r < box.min[2]) box.min[2] = z - r; if (z + r > box.max[2]) box.max[2] = z + r;
    }
    function frameState(now) {
        var b0 = st.e, tt = 0;
        if (st.anim) {
            var t = clamp01((now - st.anim.start) / Math.max(1, st.anim.dur));
            b0 = st.anim.dir > 0 ? st.e : st.e - 1;
            tt = st.anim.dir > 0 ? t : 1 - t;
        }
        return { bL: levelOf(b0), bS: shapeOf(b0), tt: tt };
    }
    function drawScene(fs) {
        var bL = fs.bL, bS = fs.bS, tt = fs.tt;
        box.min = [Infinity, Infinity, Infinity]; box.max = [-Infinity, -Infinity, -Infinity];
        var n = 0, h = PIECE / 2;
        var pz = bS === 2 ? seg(tt, 0.6, 1) : 0; // the level-change part of a flat -> cube step

        function put(x, y, z, sc) {
            if (n >= MAX_PIECES) return;
            dummy.position.set(x, y, z);
            dummy.scale.set(sc, sc, sc);
            dummy.updateMatrix();
            pieces.setMatrixAt(n++, dummy.matrix);
            grow(x, y, z, h * sc);
        }
        // Item k of the step: k = 0 is what is already there; 1..9 drop in.
        for (var k = 0; k < 10; k++) {
            var pk = 1;
            if (k > 0) {
                pk = bS < 2 ? seg(tt, (k - 1) * 0.06, (k - 1) * 0.06 + 0.27)
                            : seg(tt, (k - 1) * 0.05, (k - 1) * 0.05 + 0.2);
                if (pk <= 0.01) continue;
            }
            var drop = (1 - pk) * (bS < 2 ? 3 : 4);
            if (bS === 0) {
                put(k, drop, 0, pk);
            } else if (bS === 1) {
                for (var x = 0; x < 10; x++) put(x, drop, k, pk);
            } else {
                for (var x2 = 0; x2 < 10; x2++) for (var z2 = 0; z2 < 10; z2++) put(x2, k + drop, z2, pk);
            }
        }
        pieces.count = pz >= 0.999 ? 0 : n;
        pieces.instanceMatrix.needsUpdate = true;

        // Colour: units red, rods orange, flats amber; the step's new shape
        // takes on its colour at the end.
        if (bS < 2) {
            shapeColour(tmpColA, bS); shapeColour(tmpColB, bS + 1);
            pieceMat.color.copy(tmpColA).lerp(tmpColB, seg(tt, 0.78, 1));
        } else {
            shapeColour(pieceMat.color, 2);
        }

        // The cube of 1000 turns into one solid block of the next level.
        if (pz > 0) {
            shapeColour(tmpColA, 2); shapeColour(tmpColB, 0);
            blockMat.color.copy(tmpColA).lerp(tmpColB, pz);
            blockMat.opacity = pz;
            blockMat.depthWrite = pz >= 0.999;
            block.visible = true;
            grow(C, C, C, 5);
        } else {
            block.visible = false;
        }

        // Level letter: on the unit at rest, and on the new block as it forms.
        var lt = null, lop = 0, lpos = null, lsize = 1;
        if (bS === 0) { lt = letterOf(bL); lop = 1 - seg(tt, 0, 0.15); lpos = [0, 1.05, 0]; lsize = 1.1; }
        else if (pz > 0) { lt = letterOf(bL + 1); lop = pz; lpos = [C, 10 + 2.2, C]; lsize = 6; }
        if (lt && lop > 0.01) {
            drawLetter(lt);
            letterSprite.material.opacity = lop;
            letterSprite.position.set(lpos[0], lpos[1], lpos[2]);
            letterSprite.scale.set(lsize, lsize, 1);
            letterSprite.visible = true;
        } else {
            letterSprite.visible = false;
        }
        return { zoomOut: lerp(1, 2.6, pz) };
    }

    // ------------------------------------------------------------------
    // Camera: frame what is on screen, leaving room for the control row and
    // the zoom scale. Follows during a step and briefly after; otherwise the
    // person can rotate and zoom freely.
    // ------------------------------------------------------------------
    var viewOff = { w: -1, h: -1, x: 0, y: 0 };
    function overlaySizes() {
        var W = H.renderer.domElement.clientWidth || 1, Hh = H.renderer.domElement.clientHeight || 1;
        var panel = st.scaleOpen && ui.scale ? ui.scale.offsetWidth + 10 : 0;
        var top = ui.top ? ui.top.offsetHeight + 10 : 0;
        var bottom = ui.caption ? ui.caption.offsetHeight + 8 : 0;
        return { W: W, H: Hh, panel: panel, top: top, bottom: bottom };
    }
    function applyViewOffset(o) {
        var x = o.panel / 2, y = (o.bottom - o.top) / 2;
        if (o.W === viewOff.w && o.H === viewOff.h && x === viewOff.x && y === viewOff.y) return;
        viewOff = { w: o.W, h: o.H, x: x, y: y };
        H.camera.setViewOffset(o.W, o.H, x, y, o.W, o.H);
        H.camera.updateProjectionMatrix();
    }
    function fitDistance(o, zoomOut) {
        var cx = box.max[0] - box.min[0], cy = box.max[1] - box.min[1], cz = box.max[2] - box.min[2];
        var r = Math.max(0.6, 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz));
        var aw = Math.max(40, o.W - o.panel), ah = Math.max(40, o.H - o.top - o.bottom);
        var vfov = H.camera.fov * Math.PI / 180;
        // Visible part of the full view: the fov of the usable area only.
        var vf = 2 * Math.atan(Math.tan(vfov / 2) * ah / o.H);
        var hf = 2 * Math.atan(Math.tan(vfov / 2) * aw / o.H);
        return r / Math.sin(Math.min(vf, hf) / 2) * 1.08 * zoomOut;
    }
    var tmpV, tmpC;
    function stepCamera(now, dt, zoomOut, instant) {
        var o = overlaySizes();
        applyViewOffset(o);
        var follow = instant || st.anim || now < followUntil;
        if (!follow) return;
        var cam = H.camera, tgt = H.controls.target;
        tmpC.set((box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2);
        var want = fitDistance(o, zoomOut);
        var k = instant ? 1 : 1 - Math.exp(-dt / 160);
        tmpV.copy(cam.position).sub(tgt);
        var d = tmpV.length() || 1;
        tgt.lerp(tmpC, k);
        d = d + (want - d) * k;
        tmpV.normalize().multiplyScalar(d);
        cam.position.copy(tgt).add(tmpV);
    }
    // A cube of 1000 becomes the next level's unit: the world shrinks by 10
    // about the cube's centre (and grows back for a ÷10 step), so the
    // picture on screen does not jump.
    function cubeToUnit() {
        // x -> (x - C) / 10
        var c = H.camera.position, t = H.controls.target;
        c.set((c.x - C) / 10, (c.y - C) / 10, (c.z - C) / 10);
        t.set((t.x - C) / 10, (t.y - C) / 10, (t.z - C) / 10);
    }
    function unitToCube() {
        // x -> C + 10 x
        var c = H.camera.position, t = H.controls.target;
        c.set(C + c.x * 10, C + c.y * 10, C + c.z * 10);
        t.set(C + t.x * 10, C + t.y * 10, C + t.z * 10);
    }

    // ------------------------------------------------------------------
    // Steps
    // ------------------------------------------------------------------
    function go(target, slow, src) {
        st.target = Math.max(MIN_E, Math.min(MAX_E, target));
        st.slow = !!slow;
        st.src = src || '';
    }
    function stepLogic(now) {
        if (st.anim) {
            var a = st.anim;
            if (now - a.start < a.dur + a.hold) return;
            st.anim = null;
            var b0 = a.dir > 0 ? st.e : st.e - 1;
            if (a.dir > 0 && shapeOf(b0) === 2) cubeToUnit();
            st.e += a.dir;
            followUntil = now + 900;
        }
        if (st.e !== st.target) {
            var dir = st.target > st.e ? 1 : -1;
            var gap = Math.abs(st.target - st.e);
            var base = dir > 0 ? st.e : st.e - 1;
            var levelStep = shapeOf(base) === 2;
            var dur, hold = 0;
            if (reduceMotion()) dur = 0;
            else {
                dur = st.slow ? 2000 : (gap > 6 ? 260 : (gap > 1 ? 450 : 1200));
                if (levelStep) dur *= 1.35;
                if (st.slow) hold = 450;
            }
            if (dir < 0 && levelStep) unitToCube();
            st.anim = { dir: dir, start: now, dur: dur, hold: hold, src: st.src };
            showPop(st.src, dir);
            st.src = '';
        } else if (st.slow) {
            st.slow = false;
        }
    }
    function resetZoom() {
        st.anim = null; st.e = 0; st.target = 0; st.slow = false;
        var fs = frameState(performance.now());
        var r = drawScene(fs);
        stepCamera(performance.now(), 16, r.zoomOut, true);
        followUntil = performance.now() + 600;
        updateUI(performance.now(), fs);
    }

    // ------------------------------------------------------------------
    // User interface (built here, so index.html stays untouched)
    // ------------------------------------------------------------------
    var ui = {};
    var CSS = [
        '.zg-switch{display:none;margin:0 auto 10px;max-width:520px;height:40px;padding:3px;box-sizing:border-box;border-radius:12px;background:rgba(20,22,44,.9);border:1px solid #2a2c4c;gap:0}',
        '.zg-switch.zg-show{display:flex}',
        '.zg-switch button{flex:1;border:0;border-radius:9px;background:transparent;color:#9a9cc0;font-size:15px;font-weight:800;font-family:inherit;cursor:pointer}',
        '.zg-switch button[aria-pressed="true"]{background:#4ecdc4;color:#0a0a1a}',
        'body.zg-on #main-structure-controls,body.zg-on .canvas-tools{display:none!important}',
        '.zg-ui{display:none}',
        'body.zg-on .zg-ui{display:block}',
        'body.zg-on .zg-top{display:flex}',
        '.zg-top{position:absolute;left:8px;right:8px;top:8px;align-items:center;gap:4px;z-index:6;pointer-events:none}',
        '.zg-top>*{pointer-events:auto}',
        '.zg-reel{position:relative;flex:0 0 auto;width:84px;height:44px;margin-right:4px;border-radius:10px;background:#1a1b36;border:1px solid #44487a;overflow:hidden}',
        '.zg-reel-band{position:absolute;left:0;right:0;top:11px;height:22px;background:#10242a;border-top:1px solid #2c5a56;border-bottom:1px solid #2c5a56}',
        '.zg-reel-list{position:absolute;left:0;right:0;top:0;will-change:transform}',
        '.zg-reel-list div{height:22px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;color:#9a9cc0;white-space:nowrap}',
        '.zg-reel-list div.zg-now{color:#4ecdc4}',
        '.zg-reel-fade{position:absolute;left:0;right:0;height:11px;pointer-events:none}',
        '.zg-btnwrap{position:relative;flex:0 0 auto}',
        '.zg-btn{width:40px;height:40px;border-radius:10px;border:1.5px solid #34375f;background:#1a1b36;color:#f2f3ff;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}',
        '.zg-btn.zg-play{border-color:#4ecdc4;background:#10242a;color:#4ecdc4}',
        '.zg-btn:disabled{opacity:.35;cursor:default}',
        '.zg-round{width:36px;height:36px;border-radius:50%;border:1px solid #44487a;background:#1a1b36;color:#f2f3ff;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}',
        '.zg-round[aria-pressed="true"]{border-color:#4ecdc4;background:#10242a;color:#4ecdc4}',
        '.zg-pop{position:absolute;left:50%;top:46px;transform:translateX(-50%);padding:4px 9px;border-radius:8px;background:#4ecdc4;color:#0a0a1a;font-size:15px;font-weight:800;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.4);pointer-events:none;opacity:0;transition:opacity .35s}',
        '.zg-pop.zg-in{opacity:1;transition:none}',
        '.zg-scale{position:absolute;right:8px;top:62px;bottom:8px;width:70px;border-radius:14px;background:rgba(18,19,42,.92);border:1px solid #24264a;z-index:5}',
        '.zg-scale.zg-hidden{display:none!important}',
        '.zg-track{position:absolute;top:22px;bottom:22px;left:0;right:0}',
        '.zg-rail{position:absolute;top:0;bottom:0;right:40px;width:3px;border-radius:2px;background:linear-gradient(180deg,#4ecdc4,#3a3f6e 50%,#4ecdc4)}',
        '.zg-notch{position:absolute;right:37px;width:9px;height:1px;background:#4a4e80}',
        '.zg-letter{position:absolute;right:4px;width:32px;height:30px;transform:translateY(-50%);border-radius:8px;border:1px solid #34375f;background:#1a1b36;color:#c9cbe8;font-size:14px;font-weight:800;cursor:pointer;padding:0;font-family:inherit}',
        '.zg-letter.zg-on{background:#4ecdc4;border-color:#4ecdc4;color:#0a0a1a}',
        '.zg-pointer{position:absolute;left:6px;width:12px;height:18px;transform:translateY(-50%)}',
        '.zg-caption{position:absolute;left:10px;right:88px;bottom:10px;text-align:center;font-size:14px;line-height:1.35;color:#c9cbe8;z-index:4;pointer-events:none;text-shadow:0 1px 3px #000}',
        '.zg-readout{border-radius:14px;background:rgba(18,19,42,.9);border:1px solid #24264a;padding:10px 12px;margin-bottom:12px;font-weight:700}',
        '.zg-rhead{display:flex;align-items:center;justify-content:space-between;gap:6px}',
        'body.zg-scaleoff .zg-caption{right:10px}',
        '.zg-rnav{display:flex;align-items:center;gap:6px;flex:1;min-width:0}',
        '.zg-sq{flex:0 0 auto;width:32px;height:36px;border-radius:10px;border:1px solid #34375f;background:#1a1b36;color:#f2f3ff;font-size:20px;cursor:pointer;padding:0}',
        '.zg-title{flex:1;min-width:0;max-width:220px;height:36px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-radius:10px;border:1px solid #2c5a56;background:#10242a;color:#4ecdc4;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;padding:0 6px}',
        '.zg-all{height:36px;padding:0 12px;border-radius:10px;border:1px solid #3a3570;background:#1a1b36;color:#c4a5ff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}',
        '.zg-drum{position:relative;height:84px;overflow:hidden;margin-top:6px}',
        '.zg-ditem{position:absolute;left:0;right:0;top:0;height:84px;display:flex;align-items:center;justify-content:center;text-align:center;word-break:break-all;font-weight:800;line-height:1.15;transition:transform .3s cubic-bezier(.34,1.56,.64,1),opacity .3s}',
        '.zg-mono{font-family:"SF Mono",Menlo,Consolas,monospace}',
        '.zg-list{display:none;flex-direction:column;gap:4px;margin-top:8px;font-size:14px}',
        '.zg-list div{display:flex;justify-content:space-between;gap:10px}',
        '.zg-list span:first-child{color:#9a9cc0;flex-shrink:0;font-weight:600}',
        '.zg-list span:last-child{text-align:right;word-break:break-all}',
        '.zg-readout.zg-allon .zg-list{display:flex}',
        '.zg-readout.zg-allon .zg-drum,.zg-readout.zg-allon .zg-rnav{display:none}',
        '.zg-alltitle{display:none;font-size:13px;color:#4ecdc4;text-transform:uppercase;letter-spacing:.8px}',
        '.zg-readout.zg-allon .zg-alltitle{display:inline}',
        '.zg-wheel{position:fixed;inset:0;z-index:1000;display:none;background:rgba(5,6,16,.72)}',
        '.zg-wheel.zg-open{display:block}',
        '.zg-wheel-box{position:absolute;left:50%;bottom:120px;transform:translateX(-50%);width:280px;border-radius:18px;background:#12132a;border:1px solid #34375f;box-shadow:0 16px 40px rgba(0,0,0,.5);padding:12px}',
        '.zg-wheel-box p{margin:0 0 6px;font-size:12px;color:#9a9cc0;text-align:center}',
        '.zg-wheel-list{height:220px;overflow-y:auto;scroll-snap-type:y mandatory;padding:88px 0;box-sizing:border-box}',
        '.zg-wheel-list button{display:block;width:100%;height:44px;scroll-snap-align:center;border:0;border-radius:10px;background:transparent;color:#c9cbe8;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit}',
        '.zg-wheel-list button.zg-cur{background:#10242a;color:#4ecdc4;font-size:19px}',
        '#pv-quiz-btn.zg-off{opacity:.35;pointer-events:none}',
        '@media (max-width:480px){body.zg-on .canvas-container{height:62vh!important}.zg-reel{width:74px}.zg-btn{width:36px}.zg-round{width:34px;height:34px}.zg-scale{width:62px}.zg-title{max-width:none}}',
        '@media (prefers-reduced-motion:reduce){.zg-ditem,.zg-reel-list,.zg-pop{transition:none!important}}'
    ].join('\n');

    var ICON = {
        playUp: '<svg width="16" height="18" viewBox="0 0 24 26" fill="currentColor" aria-hidden="true"><path d="M12 1l8 11H4z"/><path d="M12 13l8 11H4z"/></svg>',
        up: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 5l9 14H3z"/></svg>',
        down: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 19L3 5h18z"/></svg>',
        playDown: '<svg width="16" height="18" viewBox="0 0 24 26" fill="currentColor" aria-hidden="true"><path d="M12 13L4 2h16z"/><path d="M12 25L4 14h16z"/></svg>',
        reset: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
        scale: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 3h6v18H9z"/><path d="M9 7h3M9 11h3M9 15h3M9 19h2"/></svg>'
    };
    function el(tag, cls, html) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (html !== undefined) e.innerHTML = html;
        return e;
    }
    function buildUI() {
        var style = el('style'); style.textContent = CSS; document.head.appendChild(style);

        // Build / Zoom switch, under the mode tabs (Place Value only).
        var tabs = document.querySelector('.mode-tabs');
        ui.sw = el('div', 'zg-switch');
        ui.sw.setAttribute('role', 'group');
        ui.sw.setAttribute('aria-label', 'Place Value view');
        ui.swBuild = el('button', '', 'Build'); ui.swBuild.type = 'button';
        ui.swZoom = el('button', '', 'Zoom (Powers of 10)'); ui.swZoom.type = 'button';
        ui.sw.appendChild(ui.swBuild); ui.sw.appendChild(ui.swZoom);
        if (tabs && tabs.parentNode) tabs.parentNode.insertBefore(ui.sw, tabs.nextSibling);
        ui.swBuild.addEventListener('click', function () { exit(); });
        ui.swZoom.addEventListener('click', function () { enter(); });

        var canvasBox = document.querySelector('.canvas-container');

        // Control row over the top of the 3D view.
        ui.top = el('div', 'zg-ui zg-top');
        ui.reel = el('div', 'zg-reel');
        ui.reelLive = el('span', '');
        ui.reelLive.setAttribute('aria-live', 'polite');
        ui.reelLive.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)';
        ui.reel.appendChild(ui.reelLive);
        ui.reel.appendChild(el('div', 'zg-reel-band'));
        ui.reelList = el('div', 'zg-reel-list');
        ui.reelList.setAttribute('aria-hidden', 'true');
        ui.reelItems = [];
        for (var rv = MAX_E; rv >= MIN_E; rv--) { var it = el('div', '', reelName(rv)); ui.reelItems.push(it); ui.reelList.appendChild(it); }
        ui.reel.appendChild(ui.reelList);
        var f1 = el('div', 'zg-reel-fade'); f1.style.cssText = 'top:0;background:linear-gradient(180deg,#1a1b36,rgba(26,27,54,.35))';
        var f2 = el('div', 'zg-reel-fade'); f2.style.cssText = 'bottom:0;background:linear-gradient(0deg,#1a1b36,rgba(26,27,54,.35))';
        ui.reel.appendChild(f1); ui.reel.appendChild(f2);
        ui.top.appendChild(ui.reel);

        ui.pops = {};
        ui.btns = {};
        [['playUp', 'Play build-up to the next level', true],
         ['up', 'Multiply by ten', false],
         ['down', 'Divide by ten', false],
         ['playDown', 'Play break-down to the level below', true]].forEach(function (d) {
            var wrap = el('div', 'zg-btnwrap');
            var b = el('button', 'zg-btn' + (d[2] ? ' zg-play' : ''), ICON[d[0]]);
            b.type = 'button'; b.title = d[1]; b.setAttribute('aria-label', d[1]);
            var pop = el('span', 'zg-pop'); pop.setAttribute('aria-hidden', 'true');
            wrap.appendChild(b); wrap.appendChild(pop);
            ui.top.appendChild(wrap);
            ui.pops[d[0]] = pop; ui.btns[d[0]] = b;
        });
        ui.btns.up.addEventListener('click', function () { go(st.target + 1, false, 'up'); });
        ui.btns.down.addEventListener('click', function () { go(st.target - 1, false, 'down'); });
        ui.btns.playUp.addEventListener('click', function () { go(3 * levelOf(st.e) + 3, true, 'playUp'); });
        ui.btns.playDown.addEventListener('click', function () {
            var lv0 = levelOf(st.e);
            go(st.e === 3 * lv0 ? 3 * lv0 - 3 : 3 * lv0, true, 'playDown');
        });
        ui.top.appendChild(el('div', '')).style.flex = '1';
        ui.resetBtn = el('button', 'zg-round', ICON.reset);
        ui.resetBtn.type = 'button'; ui.resetBtn.title = 'Reset to 10⁰'; ui.resetBtn.setAttribute('aria-label', 'Reset to 10 to the power 0');
        ui.resetBtn.addEventListener('click', resetZoom);
        ui.scaleBtn = el('button', 'zg-round', ICON.scale);
        ui.scaleBtn.type = 'button';
        ui.scaleBtn.addEventListener('click', function () { st.scaleOpen = !st.scaleOpen; followUntil = performance.now() + 700; updateScaleBtn(); });
        var rb = el('div', ''); rb.style.cssText = 'display:flex;gap:4px;flex:0 0 auto';
        rb.appendChild(ui.resetBtn); rb.appendChild(ui.scaleBtn);
        ui.top.appendChild(rb);
        canvasBox.appendChild(ui.top);

        // Zoom scale (tap only).
        ui.scale = el('div', 'zg-ui zg-scale');
        var track = el('div', 'zg-track');
        track.appendChild(el('div', 'zg-rail'));
        for (var nv = MIN_E; nv <= MAX_E; nv++) { var nt = el('div', 'zg-notch'); nt.style.top = yPct(nv); track.appendChild(nt); }
        ui.letters = {};
        for (var lv = 6; lv >= -6; lv--) {
            (function (lvl) {
                var b = el('button', 'zg-letter', letterOf(lvl));
                b.type = 'button';
                b.style.top = yPct(3 * lvl);
                b.setAttribute('aria-label', 'Jump to ' + (lvl === 0 ? 'ones' : LEVEL_WORDS[String(lvl)]));
                b.addEventListener('click', function () { go(3 * lvl, false, ''); });
                ui.letters[lvl] = b;
                track.appendChild(b);
            })(lv);
        }
        ui.pointer = el('div', 'zg-pointer', '<svg width="12" height="18" viewBox="0 0 12 18" aria-hidden="true"><path d="M0 0L12 9L0 18z" fill="#4ecdc4"/></svg>');
        track.appendChild(ui.pointer);
        ui.scale.appendChild(track);
        canvasBox.appendChild(ui.scale);

        ui.caption = el('div', 'zg-ui zg-caption');
        ui.caption.setAttribute('aria-live', 'polite');
        canvasBox.appendChild(ui.caption);

        // Readout card (in the sidebar, where the sliders are in Build).
        ui.readout = el('div', 'zg-ui zg-readout');
        ui.readout.innerHTML =
            '<div class="zg-rhead"><div class="zg-rnav">' +
            '<button type="button" class="zg-sq" data-r="prev" aria-label="Previous view">‹</button>' +
            '<button type="button" class="zg-title" aria-haspopup="dialog"></button>' +
            '<button type="button" class="zg-sq" data-r="next" aria-label="Next view">›</button></div>' +
            '<span class="zg-alltitle">All five</span>' +
            '<button type="button" class="zg-all" aria-pressed="false">All</button></div>' +
            '<div class="zg-drum" aria-live="polite"></div>' +
            '<div class="zg-list"></div>';
        ui.title = ui.readout.querySelector('.zg-title');
        ui.drum = ui.readout.querySelector('.zg-drum');
        ui.list = ui.readout.querySelector('.zg-list');
        ui.allBtn = ui.readout.querySelector('.zg-all');
        ui.readout.querySelector('[data-r="prev"]').addEventListener('click', function () { rollView(-1); });
        ui.readout.querySelector('[data-r="next"]').addEventListener('click', function () { rollView(1); });
        ui.title.addEventListener('click', openWheel);
        ui.allBtn.addEventListener('click', function () {
            st.all = !st.all;
            ui.readout.classList.toggle('zg-allon', st.all);
            ui.allBtn.textContent = st.all ? 'One at a time' : 'All';
            ui.allBtn.setAttribute('aria-pressed', st.all ? 'true' : 'false');
            lastReadout = '';
        });
        var side = document.querySelector('.controls-sidebar > div') || document.querySelector('.controls-sidebar');
        if (side) side.insertBefore(ui.readout, side.firstChild);

        // Pop-up wheel to choose what the readout shows.
        ui.wheel = el('div', 'zg-wheel');
        ui.wheel.innerHTML = '<div class="zg-wheel-box" role="dialog" aria-label="Choose what to show"><p>Scroll or tap to choose</p><div class="zg-wheel-list"></div></div>';
        ui.wheelList = ui.wheel.querySelector('.zg-wheel-list');
        VIEWS.forEach(function (v, i) {
            var b = el('button', '', v); b.type = 'button';
            b.addEventListener('click', function (ev) { ev.stopPropagation(); st.view = i; lastReadout = ''; drumSet(0); closeWheel(); });
            ui.wheelList.appendChild(b);
        });
        ui.wheel.addEventListener('click', function (ev) { if (ev.target === ui.wheel) closeWheel(); });
        document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && ui.wheel.classList.contains('zg-open')) closeWheel(); });
        document.body.appendChild(ui.wheel);

        updateScaleBtn();
        drumSet(0);
    }
    function yPct(v) { return ((MAX_E - v) / (MAX_E - MIN_E) * 100).toFixed(3) + '%'; }
    function updateScaleBtn() {
        var lbl = st.scaleOpen ? 'Hide zoom scale' : 'Show zoom scale';
        ui.scaleBtn.title = lbl; ui.scaleBtn.setAttribute('aria-label', lbl);
        ui.scaleBtn.setAttribute('aria-pressed', st.scaleOpen ? 'true' : 'false');
        ui.scale.classList.toggle('zg-hidden', !st.scaleOpen);
        document.body.classList.toggle('zg-scaleoff', !st.scaleOpen);
    }
    var popTimers = {};
    function showPop(src, dir) {
        var p = ui.pops && ui.pops[src];
        if (!p) return;
        p.textContent = dir > 0 ? '×10' : '÷10';
        p.classList.add('zg-in');
        clearTimeout(popTimers[src]);
        popTimers[src] = setTimeout(function () { p.classList.remove('zg-in'); }, 650);
    }

    // Readout drum
    function viewHTML(i, e) {
        if (i === 0) return '<span style="font-size:28px">' + prefixOf(e) + '</span>';
        if (i === 1) return '<span style="font-size:40px">' + expText(e) + '</span>';
        if (i === 2) return numberHTML(e, true);
        if (i === 3) return '<span style="font-size:40px">10<sup style="font-size:22px">' + expText(e) + '</sup></span>';
        return '<span style="font-size:26px;word-break:normal">' + nameOf(e) + '</span>';
    }
    function numberHTML(e, big) {
        var d = digitsOf(e), len = d.length;
        var fs = big ? (len <= 11 ? 34 : (len <= 17 ? 24 : 17)) : (len <= 17 ? 14 : 11);
        return '<span class="zg-mono" style="font-size:' + fs + 'px">' + d.map(function (x) { return '<span style="color:' + x.c + '">' + x.ch + '</span>'; }).join('') + '</span>';
    }
    var lastReadout = '';
    function drumSet(dir) {
        // dir: 0 = just redraw; +1 / -1 = roll to the new view
        var html = viewHTML(st.view, st.e);
        ui.title.innerHTML = VIEW_SHORT[st.view] + ' <span aria-hidden="true">⇅</span>';
        ui.title.setAttribute('aria-label', 'Choose view: ' + VIEWS[st.view]);
        var old = ui.drum.firstChild;
        var nu = el('div', 'zg-ditem', html);
        if (dir && old && !reduceMotion()) {
            nu.style.transform = 'translateY(' + (dir > 0 ? 70 : -70) + 'px)';
            nu.style.opacity = '0';
            ui.drum.appendChild(nu);
            void nu.offsetWidth;
            nu.style.transform = 'translateY(0)'; nu.style.opacity = '1';
            old.style.transform = 'translateY(' + (dir > 0 ? -70 : 70) + 'px)'; old.style.opacity = '0';
            setTimeout(function () { if (old.parentNode) old.parentNode.removeChild(old); }, 320);
        } else {
            ui.drum.innerHTML = '';
            ui.drum.appendChild(nu);
        }
        ui.list.innerHTML = VIEWS.map(function (v, i) {
            var val = i === 0 ? prefixOf(st.e) : i === 1 ? expText(st.e) : i === 2 ? numberHTML(st.e, false)
                : i === 3 ? '10<sup>' + expText(st.e) + '</sup>' : nameOf(st.e);
            return '<div><span>' + v + '</span><span>' + val + '</span></div>';
        }).join('');
        lastReadout = st.e + '|' + st.view + '|' + st.all;
    }
    function rollView(d) { st.view = ((st.view + d) % 5 + 5) % 5; drumSet(d); }
    function openWheel() {
        Array.prototype.forEach.call(ui.wheelList.children, function (b, i) { b.classList.toggle('zg-cur', i === st.view); });
        ui.wheel.classList.add('zg-open');
        var cur = ui.wheelList.children[st.view];
        ui.wheelList.scrollTop = cur.offsetTop - 88;
        cur.focus();
    }
    function closeWheel() { ui.wheel.classList.remove('zg-open'); ui.title.focus(); }

    // Per-frame UI: reel, scale pointer, caption, readout, button states.
    var lastReelPos = null, lastCaption = '', lastLevel = null;
    function updateUI(now, fs) {
        var a = st.anim, rm = reduceMotion();
        var reelPos = st.e;
        if (a && !rm) {
            var rt = clamp01((now - a.start) / Math.max(1, a.dur * 0.55));
            var c1 = 1.70158, c3 = c1 + 1;
            var back = rt >= 1 ? 1 : 1 + c3 * Math.pow(rt - 1, 3) + c1 * Math.pow(rt - 1, 2);
            reelPos = st.e + a.dir * back;
        } else if (a) {
            reelPos = st.e + a.dir;
        }
        if (reelPos !== lastReelPos) {
            ui.reelList.style.transform = 'translateY(' + (11 - (MAX_E - reelPos) * 22).toFixed(1) + 'px)';
            var nowIdx = Math.round(MAX_E - reelPos);
            for (var i = 0; i < ui.reelItems.length; i++) ui.reelItems[i].classList.toggle('zg-now', i === nowIdx);
            lastReelPos = reelPos;
        }
        var shownE = a ? st.e + a.dir : st.e;
        var live = reelName(shownE);
        if (ui.reelLive.textContent !== live) ui.reelLive.textContent = live;

        var pos = st.e + (a ? a.dir * clamp01((now - a.start) / Math.max(1, a.dur)) : 0);
        ui.pointer.style.top = yPct(pos);
        var L = levelOf(st.e);
        if (L !== lastLevel) {
            for (var k in ui.letters) ui.letters[k].classList.toggle('zg-on', +k === L);
            lastLevel = L;
        }
        var cap = captionFor(fs.bL, fs.bS, fs.tt);
        if (cap !== lastCaption) { ui.caption.textContent = cap; lastCaption = cap; }
        var key = st.e + '|' + st.view + '|' + st.all;
        if (key !== lastReadout) drumSet(0);

        ui.btns.up.disabled = ui.btns.playUp.disabled = st.target >= MAX_E;
        ui.btns.down.disabled = ui.btns.playDown.disabled = st.target <= MIN_E;
    }

    // ------------------------------------------------------------------
    // Entering / leaving the Zoom view
    // ------------------------------------------------------------------
    function enter() {
        if (!Z.attached || Z.active) return;
        if (H.getMode() !== 'placevalue') return;
        Z.active = true;
        H.hideBuild();
        var c = H.controls;
        saved = { min: c.minDistance, max: c.maxDistance };
        c.minDistance = 0.3; c.maxDistance = 3000;
        group.visible = true;
        document.body.classList.add('zg-on');
        setSwitch();
        var q = document.getElementById('pv-quiz-btn');
        if (q) { q.classList.add('zg-off'); q.setAttribute('aria-disabled', 'true'); q.title = 'Quiz is not available in the Zoom view yet'; }
        // Default viewing angle, the same one Build starts with.
        st.anim = null; st.target = st.e;
        var now = performance.now();
        var fs = frameState(now);
        var r = drawScene(fs);
        H.controls.target.set(0, 0, 0);
        H.camera.position.set(40, 50, 60);
        viewOff.w = -1;
        window.dispatchEvent(new Event('resize')); // the canvas may have changed height
        requestAnimationFrame(function () {
            var n2 = performance.now();
            var r2 = drawScene(frameState(n2));
            stepCamera(n2, 16, r2.zoomOut, true);
        });
        stepCamera(now, 16, r.zoomOut, true);
        updateUI(now, fs);
    }
    function exit(silent) {
        if (!Z.active) { setSwitch(); return; }
        Z.active = false;
        if (st.anim) { // finish where the step was heading
            var a = st.anim; st.anim = null;
            if (a.dir < 0 && shapeOf(st.e - 1) === 2) { /* camera is reset below anyway */ }
            st.e += a.dir;
        }
        st.target = st.e;
        group.visible = false;
        document.body.classList.remove('zg-on');
        H.camera.clearViewOffset();
        H.camera.updateProjectionMatrix();
        viewOff.w = -1;
        if (saved) { H.controls.minDistance = saved.min; H.controls.maxDistance = saved.max; }
        var q = document.getElementById('pv-quiz-btn');
        if (q) { q.classList.remove('zg-off'); q.removeAttribute('aria-disabled'); q.title = 'Quiz me: build the target number shown'; }
        closeWheel();
        setSwitch();
        if (!silent) {
            window.dispatchEvent(new Event('resize'));
            H.showBuild();
        }
    }
    function setSwitch() {
        if (!ui.sw) return;
        var pv = H && H.getMode() === 'placevalue';
        ui.sw.classList.toggle('zg-show', !!pv);
        ui.swBuild.setAttribute('aria-pressed', Z.active ? 'false' : 'true');
        ui.swZoom.setAttribute('aria-pressed', Z.active ? 'true' : 'false');
    }

    // ------------------------------------------------------------------
    // Public hooks
    // ------------------------------------------------------------------
    Z.attach = function (hooks) {
        if (Z.attached || !hooks || !hooks.scene || typeof THREE === 'undefined') return;
        H = hooks;
        tmpV = new THREE.Vector3(); tmpC = new THREE.Vector3();
        build3D();
        buildUI();
        Z.attached = true;
        setSwitch();
    };
    Z.tick = function (now) {
        if (!Z.active) return;
        now = now || performance.now();
        var dt = lastNow ? Math.min(100, now - lastNow) : 16;
        lastNow = now;
        stepLogic(now);
        var fs = frameState(now);
        var r = drawScene(fs);
        stepCamera(now, dt, r.zoomOut, reduceMotion() && !!st.anim);
        updateUI(now, fs);
    };
    // Called at the start of switchMode(): leaving Place Value closes Zoom
    // (Build's own switchMode code then sets up the new mode).
    Z.beforeMode = function (mode) {
        if (!Z.attached) return;
        if (mode !== 'placevalue' && Z.active) exit(true);
        setTimeout(setSwitch, 0);
    };
    // Shape toggle or colour saturation changed.
    Z.refresh = function () {
        if (!Z.attached) return;
        var old = pieces.geometry; pieces.geometry = makePieceGeometry(); old.dispose();
        var ob = block.geometry; block.geometry = makeBlockGeometry(); ob.dispose();
        lastReadout = '';
    };
    Z.enter = enter;
    Z.exit = exit;
    Z.state = st; // for testing
})();
