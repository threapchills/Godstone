/* INPUT HANDLER - REMASTERED
   Clean input with proper zoom-aware mouse coordinates.
*/

export class InputHandler {
    constructor() {
        this.keys = {
            w: false, a: false, s: false, d: false,
            space: false, shift: false,
            digit1: false, digit2: false, digit3: false, digit4: false
        };

        this.mouse = {
            x: 0, y: 0,
            leftDown: false, rightDown: false,
            wheelDelta: 0
        };

        this.scrollCallback = null;
        this._initListeners();
    }

    onScroll(callback) {
        this.scrollCallback = callback;
    }

    getWorldMouse(camera) {
        return {
            x: this.mouse.x / camera.zoom + camera.x,
            y: this.mouse.y / camera.zoom + camera.y
        };
    }

    _initListeners() {
        const canvas = document.getElementById('gameCanvas');

        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            if (key in this.keys) this.keys[key] = true;
            if (e.code === 'Space') { this.keys.space = true; e.preventDefault(); }
            if (e.key === 'Shift') this.keys.shift = true;
            if (e.code === 'Digit1') this.keys.digit1 = true;
            if (e.code === 'Digit2') this.keys.digit2 = true;
            if (e.code === 'Digit3') this.keys.digit3 = true;
            if (e.code === 'Digit4') this.keys.digit4 = true;
        });

        window.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            if (key in this.keys) this.keys[key] = false;
            if (e.code === 'Space') this.keys.space = false;
            if (e.key === 'Shift') this.keys.shift = false;
            if (e.code === 'Digit1') this.keys.digit1 = false;
            if (e.code === 'Digit2') this.keys.digit2 = false;
            if (e.code === 'Digit3') this.keys.digit3 = false;
            if (e.code === 'Digit4') this.keys.digit4 = false;
        });

        window.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            this.mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
            this.mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
        });

        window.addEventListener('mousedown', (e) => {
            if (e.button === 0) this.mouse.leftDown = true;
            if (e.button === 2) this.mouse.rightDown = true;
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.mouse.leftDown = false;
            if (e.button === 2) this.mouse.rightDown = false;
        });

        window.addEventListener('wheel', (e) => {
            this.mouse.wheelDelta = Math.sign(e.deltaY);
            if (this.scrollCallback) this.scrollCallback(this.mouse.wheelDelta);
        }, { passive: true });

        window.addEventListener('contextmenu', (e) => { e.preventDefault(); });
    }
}
