/* WORLD & CAMERA SYSTEM - REMASTERED
   Advanced camera: trauma shake, time dilation, dynamic zoom, look-ahead,
   procedural sky rendering with parallax layers.
*/

export class Camera {
    constructor(viewportWidth, viewportHeight, worldWidth, worldHeight) {
        this.w = viewportWidth;
        this.h = viewportHeight;
        this.worldW = worldWidth;
        this.worldH = worldHeight;
        this.x = 0;
        this.y = 0;

        // Zoom system
        this.zoom = 0.75;
        this.targetZoom = 0.75;
        this.baseZoom = 0.75;
        this.minZoom = 0.5;
        this.maxZoom = 1.4;

        // Trauma-based shake (squared for exponential feel)
        this.trauma = 0;
        this.maxTrauma = 1.0;
        this.traumaDecay = 1.2;
        this.shakeScale = 12;
        this.shakeAngle = 0;
        this.shakeTime = 0;

        // Time dilation
        this.timeDilation = 1.0;
        this.targetTimeDilation = 1.0;
        this.dilationLerpSpeed = 4.0;

        // Look-ahead
        this.lookAheadX = 0;
        this.lookAheadY = 0;
        this.lookAheadScale = 0.15;
    }

    get effectiveW() { return this.w / this.zoom; }
    get effectiveH() { return this.h / this.zoom; }

    addTrauma(amount) {
        this.trauma = Math.min(this.maxTrauma, this.trauma + amount);
    }

    setTimeDilation(target, speed) {
        this.targetTimeDilation = Math.max(0.05, Math.min(1.0, target));
        if (speed !== undefined) this.dilationLerpSpeed = speed;
    }

    resetTimeDilation() {
        this.targetTimeDilation = 1.0;
        this.dilationLerpSpeed = 4.0;
    }

    setZoom(target) {
        this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, target));
    }

    resetZoom() {
        this.targetZoom = this.baseZoom;
    }

    getScreenRect(worldX, worldY, w, h) {
        const ew = this.effectiveW;
        const eh = this.effectiveH;
        const camCenterX = this.x + ew / 2;
        let dx = worldX - camCenterX;

        // Wrap via shortest path
        const halfWorld = this.worldW / 2;
        if (dx > halfWorld) dx -= this.worldW;
        else if (dx < -halfWorld) dx += this.worldW;

        const screenX = (ew / 2) + dx;
        const screenY = worldY - this.y;
        const margin = 100;

        return {
            x: screenX,
            y: screenY,
            onScreen: (screenX + w > -margin && screenX < ew + margin &&
                       screenY + h > -margin && screenY < eh + margin)
        };
    }

    follow(target, realDt) {
        // Time dilation interpolation (uses real dt, not dilated)
        this.timeDilation += (this.targetTimeDilation - this.timeDilation) * this.dilationLerpSpeed * realDt;

        // Zoom interpolation
        this.zoom += (this.targetZoom - this.zoom) * 3.0 * realDt;

        const ew = this.effectiveW;
        const eh = this.effectiveH;

        // Look-ahead based on velocity
        this.lookAheadX += ((target.vx || 0) * this.lookAheadScale - this.lookAheadX) * 2.0 * realDt;
        this.lookAheadY += ((target.vy || 0) * this.lookAheadScale * 0.5 - this.lookAheadY) * 2.0 * realDt;

        // Target position with look-ahead
        let tx = target.x + this.lookAheadX - ew / 2;
        let ty = target.y + this.lookAheadY - eh / 2;

        // Clamp Y
        if (ty < -600) ty = -600;
        if (ty + eh > this.worldH + 200) ty = this.worldH + 200 - eh;

        // Wrapping X follow
        let dx = tx - this.x;
        if (dx > this.worldW / 2) dx -= this.worldW;
        if (dx < -this.worldW / 2) dx += this.worldW;

        const followSpeed = 4.0;
        this.x += dx * followSpeed * realDt;
        this.y += (ty - this.y) * followSpeed * realDt;

        // Normalize camera X
        while (this.x < 0) this.x += this.worldW;
        while (this.x >= this.worldW) this.x -= this.worldW;

        // Trauma-based shake
        if (this.trauma > 0) {
            this.trauma = Math.max(0, this.trauma - this.traumaDecay * realDt);
            const shake = this.trauma * this.trauma; // Squared for exponential feel
            this.shakeTime += realDt * 30;
            const offsetX = Math.sin(this.shakeTime * 1.1) * shake * this.shakeScale;
            const offsetY = Math.cos(this.shakeTime * 1.7) * shake * this.shakeScale;
            this.shakeAngle = Math.sin(this.shakeTime * 0.7) * shake * 0.02;
            this.x += offsetX;
            this.y += offsetY;
        } else {
            this.shakeAngle = 0;
        }
    }
}

class ParallaxLayer {
    constructor(imagePath, speed, yOffset, autoScrollSpeed, alpha) {
        this.image = new Image();
        this.image.src = imagePath;
        this.speed = speed;
        this.autoScrollSpeed = autoScrollSpeed || 0;
        this.yOffset = yOffset || 0;
        this.alpha = alpha !== undefined ? alpha : 1.0;
        this.loaded = false;
        this.image.onload = () => { this.loaded = true; };
    }

    draw(ctx, camera) {
        if (!this.loaded) return;
        const prevAlpha = ctx.globalAlpha;
        ctx.globalAlpha = prevAlpha * this.alpha;

        const windOffset = (Date.now() / 1000) * this.autoScrollSpeed;
        const totalX = -(camera.x * this.speed) - windOffset;
        const imgW = this.image.width;
        const xPos = ((totalX % imgW) + imgW) % imgW - imgW;

        const needed = Math.ceil(camera.effectiveW / imgW) + 2;
        for (let i = 0; i < needed; i++) {
            ctx.drawImage(this.image, xPos + imgW * i, this.yOffset);
        }
        ctx.globalAlpha = prevAlpha;
    }
}

export class World {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.camera = new Camera(800, 600, width, height);

        // Sky parallax layers with smart transparency so all layers are visible
        // Back layer: most opaque (sky fills behind gradient)
        // Middle layer: semi-transparent so back layer shows through
        // Front layer (clouds): most transparent so depth is preserved
        this.layers = [
            new ParallaxLayer('assets/backgrounds/sky_layer_1.jpeg', 0.08, 0, 3, 0.8),
            new ParallaxLayer('assets/backgrounds/sky_layer_2.png', 0.35, 0, 12, 0.55),
            new ParallaxLayer('assets/backgrounds/clouds_fg.png', 0.65, 80, 30, 0.4)
        ];

        // Procedural sky gradient (drawn behind parallax)
        this.skyColors = {
            day: { top: '#1a0533', mid: '#2d1b69', bot: '#ff6b35' },
            night: { top: '#050510', mid: '#0a0a20', bot: '#1a0a30' }
        };
    }

    update(player, realDt) {
        this.camera.follow(player, realDt);
    }

    draw(ctx, season, dayProgress) {
        // Procedural sky gradient
        const nightBlend = Math.max(0, -Math.sin(dayProgress || 0)) * 0.7;
        const grad = ctx.createLinearGradient(0, 0, 0, this.camera.effectiveH);

        const sc = this.skyColors;
        if (nightBlend < 0.3) {
            grad.addColorStop(0, sc.day.top);
            grad.addColorStop(0.5, sc.day.mid);
            grad.addColorStop(1, sc.day.bot);
        } else {
            grad.addColorStop(0, sc.night.top);
            grad.addColorStop(0.5, sc.night.mid);
            grad.addColorStop(1, sc.night.bot);
        }

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.camera.effectiveW, this.camera.effectiveH);

        // Season filter applied to backgrounds only
        ctx.save();
        if (season === 'winter') {
            ctx.globalAlpha = 0.85;
        }
        this.layers.forEach(layer => layer.draw(ctx, this.camera));
        ctx.restore();
    }
}
