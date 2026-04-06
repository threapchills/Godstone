/* ENTITIES - REMASTERED 2.5D
   Procedural floating island rendering with visible depth,
   entity shadows, optimized rendering (NO CSS filters),
   object pooling for particles.
*/

// --- GLOBAL ASSET LOADER ---
export const Assets = {
    tilesetNormal: new Image(), tilesetWinter: new Image(),
    treeNormal: new Image(), treeWinter: new Image(),
    grass: new Image(),
    teepeeGreen: new Image(), teepeeBlue: new Image(),
    fire: new Image(), leaf: new Image(),
    playerGreen: new Image(), playerBlue: new Image(),
    pig: new Image(),
    villagerGreen: [], villagerBlue: [],
    warriorGreen: new Image(), warriorBlue: new Image(),
    projectile: new Image(), totem: new Image()
};

Assets.tilesetNormal.src = 'assets/environment/island_tileset.png';
Assets.tilesetWinter.src = 'assets/environment/island_tileset_winter.png';
Assets.treeNormal.src = 'assets/environment/tree_variant1.png';
Assets.treeWinter.src = 'assets/environment/tree_variant1_winter.png';
Assets.grass.src = 'assets/environment/grass.png';
Assets.teepeeGreen.src = 'assets/environment/teepee_green.png';
Assets.teepeeBlue.src = 'assets/environment/teepee_blue.png';
Assets.fire.src = 'assets/environment/fireplace_lit.png';
Assets.leaf.src = 'assets/environment/leaf.png';
Assets.totem.src = 'assets/environment/totem.png';
Assets.playerGreen.src = 'assets/sprites/player_green.png';
Assets.playerBlue.src = 'assets/sprites/player_blue.png';
Assets.pig.src = 'assets/sprites/pig.png';
Assets.warriorGreen.src = 'assets/sprites/warrior_green.png';
Assets.warriorBlue.src = 'assets/sprites/warrior_blue.png';
Assets.projectile.src = 'assets/sprites/projectile_arrow.png';

for (let i = 1; i <= 4; i++) {
    let vG = new Image(); vG.src = `assets/sprites/villager_green_${i}.png`;
    Assets.villagerGreen.push(vG);
    let vB = new Image(); vB.src = `assets/sprites/villager_blue_${i}.png`;
    Assets.villagerBlue.push(vB);
}

// --- HELPERS ---
function imgReady(img) {
    return img && img.complete && img.naturalWidth > 0;
}

function drawShadow(ctx, x, y, w) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, y, w * 0.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
}

// --- PARTICLE POOL ---
const PARTICLE_POOL_SIZE = 600;
const particlePool = [];
let activeParticles = [];

class PooledParticle {
    constructor() { this.reset(); }
    reset() {
        this.x = 0; this.y = 0;
        this.vx = 0; this.vy = 0;
        this.life = 0; this.maxLife = 0;
        this.size = 4; this.color = '#ff0000';
        this.type = 'normal'; // 'normal', 'trail', 'glow'
        this.active = false;
        this.gravity = 400;
    }
}

// Pre-allocate pool
for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
    particlePool.push(new PooledParticle());
}

export function spawnParticle(x, y, color, speed, life, size, type) {
    // Find inactive particle
    for (let i = 0; i < particlePool.length; i++) {
        const p = particlePool[i];
        if (!p.active) {
            p.active = true;
            p.x = x; p.y = y;
            p.color = color || '#cc0000';
            p.life = life || 0.5;
            p.maxLife = p.life;
            p.size = (size || 5) * 1.5;
            p.type = type || 'normal';
            if (type === 'trail') {
                p.vx = (Math.random() - 0.5) * 10;
                p.vy = (Math.random() - 0.5) * 10;
                p.gravity = 0;
            } else if (type === 'glow') {
                const a = Math.random() * Math.PI * 2;
                p.vx = Math.cos(a) * (speed || 50);
                p.vy = Math.sin(a) * (speed || 50) - 30;
                p.gravity = 100;
            } else {
                const a = Math.random() * Math.PI * 2;
                p.vx = Math.cos(a) * (speed || 100);
                p.vy = Math.sin(a) * (speed || 100) - 50;
                p.gravity = 400;
            }
            activeParticles.push(p);
            return p;
        }
    }
    return null;
}

export function spawnBlood(x, y, color, count) {
    const c = Math.min(count || 20, 30);
    for (let i = 0; i < c; i++) {
        spawnParticle(x, y, color || '#cc0000', 80 + Math.random() * 80, 0.4 + Math.random() * 0.4, 4 + Math.random() * 5, 'normal');
    }
}

export function updateParticles(dt) {
    for (let i = activeParticles.length - 1; i >= 0; i--) {
        const p = activeParticles[i];
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) {
            p.active = false;
            p.reset();
            activeParticles[i] = activeParticles[activeParticles.length - 1];
            activeParticles.pop();
        }
    }
}

export function drawParticles(ctx, camera) {
    for (let i = 0; i < activeParticles.length; i++) {
        const p = activeParticles[i];
        const sx = p.x - camera.x;
        const sy = p.y - camera.y;
        if (sx < -50 || sx > camera.effectiveW + 50) continue;

        const alpha = p.life / p.maxLife;
        if (p.type === 'glow') {
            ctx.globalAlpha = alpha * 0.6;
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(sx, sy, p.size * 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
        } else {
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.fillRect(sx - p.size * 0.5, sy - p.size * 0.5, p.size, p.size);
        }
    }
    ctx.globalAlpha = 1;
}

export function getActiveParticleCount() { return activeParticles.length; }

// --- BASE CLASS ---
export class Entity {
    constructor(x, y, w, h) {
        this.x = x; this.y = y;
        this.w = w; this.h = h;
        this.dead = false;
    }

    drawSprite(ctx, img, sx, sy, w, h) {
        if (imgReady(img)) ctx.drawImage(img, sx, sy, w, h);
    }
}

// --- ISLAND (2.5D Floating) ---
export class Island extends Entity {
    constructor(x, y, w, h, team) {
        super(x, y, w, h);
        this.team = team;
        this.activeTileset = Assets.tilesetNormal;
        this.activeTree = Assets.treeNormal;

        this.hasTeepee = true;
        this.hasFireplace = Math.random() > 0.4;
        this.conversionTimer = 0;

        // 2.5D depth (visible underside) - MASSIVE floating rocks
        this.depth = 120 + Math.random() * 100;

        // Procedural rocky bottom edge
        this.rockPoints = [];
        const segments = Math.max(5, Math.floor(w / 35));
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const baseDepth = this.depth * (1 - Math.pow(2 * t - 1, 4));
            this.rockPoints.push({
                x: t * w,
                y: baseDepth * (0.6 + Math.random() * 0.4) + (Math.random() - 0.5) * 12
            });
        }

        // Trees - split into background and foreground layers
        // BG trees: normal game-layer trees behind entities
        // FG trees: bigger, slightly darker, rendered OVER entities (Silksong-style)
        this.trees = [];
        const numTrees = 3 + Math.floor(Math.random() * (w / 60));
        for (let i = 0; i < numTrees; i++) {
            const xPos = 20 + Math.random() * (w - 80);
            const edgeDist = Math.min(xPos, w - xPos) / w;
            // Edge trees very likely foreground; center trees rarely
            const isFg = edgeDist < 0.25 ? Math.random() < 0.7 : Math.random() < 0.15;
            this.trees.push({
                x: xPos,
                // FG trees are 30% bigger (perspective: closer = larger)
                scale: isFg ? (1.5 + Math.random() * 1.2) : (1.0 + Math.random() * 1.2),
                burnt: false, burntTimer: 0,
                layer: isFg ? 'fg' : 'bg'
            });
        }

        // Background grass patches (drawn with island)
        this.grassPatches = [];
        const numGrass = 3 + Math.floor(Math.random() * (w / 40));
        for (let i = 0; i < numGrass; i++) {
            this.grassPatches.push({
                x: Math.random() * (w - 40),
                scale: 1.0 + Math.random() * 1.0
            });
        }

        // Foreground grass tufts (drawn over entities - big, lush)
        this.fgGrass = [];
        const numFgGrass = 2 + Math.floor(Math.random() * (w / 80));
        for (let i = 0; i < numFgGrass; i++) {
            this.fgGrass.push({
                x: Math.random() * (w - 50),
                scale: 1.5 + Math.random() * 1.5,
                flip: Math.random() > 0.5
            });
        }

        this.vx = 0; this.vy = 0;
        this.friction = 0.92;
        this.mass = w * h;
        this.greenCount = 0; this.blueCount = 0;

        // Pre-built underside path for rendering efficiency
        this._undersidePath = null;
    }

    setSeason(isWinter) {
        this.activeTileset = isWinter ? Assets.tilesetWinter : Assets.tilesetNormal;
        this.activeTree = isWinter ? Assets.treeWinter : Assets.treeNormal;
    }

    update(dt, player, enemyChief, audio) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vx *= this.friction;
        this.vy *= this.friction;

        // Heal burnt trees
        for (let i = 0; i < this.trees.length; i++) {
            const t = this.trees[i];
            if (t.burnt) {
                t.burntTimer -= dt;
                if (t.burntTimer <= 0) t.burnt = false;
            }
        }

        if (this.conversionTimer > 0) {
            this.conversionTimer -= dt;
            return;
        }

        // Territory conversion
        if (this.hasTeepee) {
            const tentX = this.x + this.w * 0.5;
            const tentY = this.y - 30;
            const range = 150;

            if (player && !player.dead) {
                const dx = (player.x + 20) - tentX;
                const dy = (player.y + 20) - tentY;
                if (dx * dx + dy * dy < range * range && this.team !== 'green') {
                    this.team = 'green';
                    this.conversionTimer = 2.0;
                    if (audio) audio.play('teepee', 0.6, 0.1);
                }
            }
            if (enemyChief && !enemyChief.dead) {
                const dx = (enemyChief.x + 20) - tentX;
                const dy = (enemyChief.y + 20) - tentY;
                if (dx * dx + dy * dy < range * range && this.team !== 'blue') {
                    this.team = 'blue';
                    this.conversionTimer = 2.0;
                    if (audio) audio.play('teepee', 0.6, 0.1);
                }
            }
        }
    }

    draw(ctx, camera) {
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h + this.depth);
        if (!rect.onScreen) return;

        const sx = rect.x;
        const sy = rect.y;
        const w = this.w;
        const h = this.h;
        const dep = this.depth;

        // === 2.5D FLOATING ISLAND RENDERING ===

        // 1. Drop shadow (projected below island - massive for big floating rocks)
        ctx.fillStyle = 'rgba(0,0,0,0.10)';
        ctx.beginPath();
        ctx.ellipse(sx + w * 0.5, sy + h + dep + 45, w * 0.48, 18, 0, 0, Math.PI * 2);
        ctx.fill();

        // 2. Rocky underside with gradient
        ctx.beginPath();
        ctx.moveTo(sx + 5, sy + h);
        for (let i = 0; i < this.rockPoints.length; i++) {
            const rp = this.rockPoints[i];
            ctx.lineTo(sx + rp.x, sy + h + rp.y);
        }
        ctx.lineTo(sx + w - 5, sy + h);
        ctx.closePath();

        const underGrad = ctx.createLinearGradient(0, sy + h, 0, sy + h + dep);
        underGrad.addColorStop(0, '#6b4226');
        underGrad.addColorStop(0.3, '#4a2d17');
        underGrad.addColorStop(0.7, '#2d1a0e');
        underGrad.addColorStop(1, '#150a05');
        ctx.fillStyle = underGrad;
        ctx.fill();

        // Underside edge highlight
        ctx.strokeStyle = 'rgba(139,90,43,0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 3. Top surface with earth layers
        // Earth side stripe (visible front face)
        const sideH = Math.min(h, 20);
        const sideGrad = ctx.createLinearGradient(0, sy, 0, sy + sideH);
        sideGrad.addColorStop(0, '#5a8c3a');
        sideGrad.addColorStop(0.3, '#7a5c3a');
        sideGrad.addColorStop(1, '#6b4226');
        ctx.fillStyle = sideGrad;
        ctx.fillRect(sx, sy, w, sideH);

        // Top grass surface
        const topGrad = ctx.createLinearGradient(0, sy - 4, 0, sy + 6);
        if (this.team === 'green') {
            topGrad.addColorStop(0, '#4CAF50');
            topGrad.addColorStop(1, '#2E7D32');
        } else if (this.team === 'blue') {
            topGrad.addColorStop(0, '#42A5F5');
            topGrad.addColorStop(1, '#1565C0');
        } else {
            topGrad.addColorStop(0, '#66BB6A');
            topGrad.addColorStop(1, '#558B2F');
        }
        ctx.fillStyle = topGrad;
        ctx.fillRect(sx, sy - 3, w, 8);

        // Tileset overlay on top surface
        if (imgReady(this.activeTileset)) {
            const sliceW = Math.floor(this.activeTileset.width / 3);
            const sliceH = this.activeTileset.height;
            ctx.globalAlpha = 0.7;
            ctx.drawImage(this.activeTileset, 0, 0, sliceW, sliceH, sx, sy - 2, sliceW, h);
            const rightX = sx + w - sliceW;
            const midW = rightX - (sx + sliceW);
            if (midW > 0) {
                ctx.drawImage(this.activeTileset, sliceW, 0, sliceW, sliceH, sx + sliceW, sy - 2, midW + 2, h);
            }
            ctx.drawImage(this.activeTileset, sliceW * 2, 0, sliceW, sliceH, rightX, sy - 2, sliceW, h);
            ctx.globalAlpha = 1;
        }

        // 4. Grass sprites on top edge (lush, big)
        if (imgReady(Assets.grass)) {
            for (let i = 0; i < this.grassPatches.length; i++) {
                const g = this.grassPatches[i];
                const gw = 56 * g.scale;
                const gh = 56 * g.scale;
                ctx.drawImage(Assets.grass, sx + g.x, sy - (40 * g.scale), gw, gh);
            }
        }

        // 5. Background trees only (foreground trees rendered later via drawForeground)
        if (imgReady(this.activeTree)) {
            for (let i = 0; i < this.trees.length; i++) {
                const tree = this.trees[i];
                if (tree.layer === 'fg') continue;

                const tw = 200 * tree.scale;
                const th = 260 * tree.scale;
                const treeY = sy - (210 * tree.scale);

                if (tree.burnt) {
                    ctx.globalAlpha = 0.4;
                }

                // Tree shadow
                ctx.fillStyle = 'rgba(0,0,0,0.12)';
                ctx.beginPath();
                ctx.ellipse(sx + tree.x + tw * 0.4, sy - 2, tw * 0.3, 8, 0, 0, Math.PI * 2);
                ctx.fill();

                ctx.drawImage(this.activeTree, sx + tree.x, treeY, tw, th);
                ctx.globalAlpha = 1;
            }
        }

        // 6. Teepee (massive structure - people look tiny next to it)
        const teepeeImg = (this.team === 'green') ? Assets.teepeeGreen : Assets.teepeeBlue;
        if (imgReady(teepeeImg)) {
            const tpW = 200;
            const tpH = 200;
            const tpX = sx + w * 0.3 - tpW * 0.5;
            const tpY = sy - tpH + 20;
            // Teepee shadow
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.beginPath();
            ctx.ellipse(tpX + tpW * 0.5, sy - 2, tpW * 0.38, 9, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.drawImage(teepeeImg, tpX, tpY, tpW, tpH);
        }

        // 7. Fire with glow (large campfire)
        if (this.hasFireplace && imgReady(Assets.fire)) {
            const fireW = 150;
            const fireH = 150;
            const fx = sx + w * 0.55 - fireW * 0.5;
            const fy = sy - fireH + 36;

            // Fire glow
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = 'rgba(255,120,20,0.10)';
            ctx.beginPath();
            ctx.arc(fx + fireW * 0.5, fy + fireH * 0.4, 100, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';

            ctx.drawImage(Assets.fire, fx, fy, fireW, fireH);
        }

        // Territory border glow
        if (this.team === 'green' || this.team === 'blue') {
            const glowColor = this.team === 'green' ? 'rgba(0,255,0,0.08)' : 'rgba(0,150,255,0.08)';
            ctx.fillStyle = glowColor;
            ctx.fillRect(sx - 2, sy - 5, w + 4, 10);
        }
    }

    // Silksong-style foreground layer: trees & grass rendered OVER entities
    // FG trees are bigger (closer to camera = larger), with a dark tint
    // to create that silhouette depth effect. Smart transparency near player.
    drawForeground(ctx, camera, playerSX, playerSY) {
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h + this.depth);
        if (!rect.onScreen) return;

        const sx = rect.x;
        const sy = rect.y;

        // Helper: compute alpha based on distance to player
        const fadeRadius = 160; // px from player center where fg fades
        const minAlpha = 0.08;  // nearly invisible right on player
        const maxAlpha = 0.85;  // very visible when away from player

        function getFgAlpha(elScreenX, elScreenY) {
            const dx = elScreenX - playerSX;
            const dy = elScreenY - playerSY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < fadeRadius) {
                const t = dist / fadeRadius;
                return minAlpha + (maxAlpha - minAlpha) * (t * t);
            }
            return maxAlpha;
        }

        // Foreground trees (bigger scale, dark tinted for depth silhouette)
        if (imgReady(this.activeTree)) {
            for (let i = 0; i < this.trees.length; i++) {
                const tree = this.trees[i];
                if (tree.layer !== 'fg') continue;

                // FG trees use same base dimensions as bg but scale is already 30% bigger
                const tw = 200 * tree.scale;
                const th = 260 * tree.scale;
                const treeX = sx + tree.x;
                const treeY = sy - (210 * tree.scale);
                const treeCX = treeX + tw * 0.4;
                const treeCY = treeY + th * 0.5;

                const alpha = getFgAlpha(treeCX, treeCY);
                if (alpha < 0.02) continue; // Skip if practically invisible

                // Lower alpha for fg trees to create depth silhouette effect
                // (no fillRect overlay — that causes dark box artifacts on transparent pixels)
                ctx.globalAlpha = tree.burnt ? alpha * 0.2 : alpha * 0.7;

                // Draw tree sprite
                ctx.drawImage(this.activeTree, treeX, treeY, tw, th);

                ctx.globalAlpha = 1;
            }
        }

        // Foreground tall grass tufts (big, lush)
        if (imgReady(Assets.grass)) {
            for (let i = 0; i < this.fgGrass.length; i++) {
                const g = this.fgGrass[i];
                const gw = 70 * g.scale;
                const gh = 70 * g.scale;
                const gx = sx + g.x;
                const gy = sy - (48 * g.scale);
                const gcx = gx + gw * 0.5;
                const gcy = gy + gh * 0.5;

                const alpha = getFgAlpha(gcx, gcy) * 0.9;
                if (alpha < 0.02) continue;

                ctx.globalAlpha = alpha;
                if (g.flip) {
                    ctx.save();
                    ctx.translate(gx + gw, gy);
                    ctx.scale(-1, 1);
                    ctx.drawImage(Assets.grass, 0, 0, gw, gh);
                    ctx.restore();
                } else {
                    ctx.drawImage(Assets.grass, gx, gy, gw, gh);
                }
                ctx.globalAlpha = 1;
            }
        }
    }
}

// --- PLAYER / CHIEF ---
export class Player extends Entity {
    constructor(x, y, team) {
        super(x, y, 40, 40);
        this.team = team;
        this.vx = 0; this.vy = 0;
        this.hp = 100; this.maxHp = 100;

        this.speed = 450;
        this.acceleration = 3000;
        this.friction = 0.85;
        this.gravity = 800;
        this.maxFallSpeed = 1000;
        this.jumpForce = -600;
        this.flyForce = -500;

        this.isGrounded = false;
        this.hpRegenTimer = 0;
        this.fireCooldown = 0;
        this.visitedIslands = new Set();
        this.respawnTimer = 8.0;

        // AI (enemy chief)
        this.mana = 100; this.maxMana = 100;
        this.aiTargetIsland = null;
        this.aiStateTimer = 0;
    }

    update(dt, input, resources, worldWidth, worldHeight, islands, audio, enemy, walls) {
        if (this.dead || dt <= 0) return false;

        // HP regen
        if (this.hp < this.maxHp) {
            this.hpRegenTimer += dt;
            if (this.hpRegenTimer > 2.0) { this.hp++; this.hpRegenTimer = 0; }
        }

        this.fireCooldown -= dt;

        let moving = false;
        let wantJump = false;

        if (this.team === 'green' && input) {
            if (input.keys.a) { this.vx -= this.acceleration * dt; moving = true; }
            if (input.keys.d) { this.vx += this.acceleration * dt; moving = true; }
            if (input.keys.space || input.keys.w) wantJump = true;
            if (input.keys.s) this.vy += 2000 * dt;
        } else if (this.team === 'blue') {
            moving = true;
            this.aiStateTimer -= dt;
            if (!this.aiTargetIsland || this.aiStateTimer <= 0) {
                this.aiStateTimer = 5 + Math.random() * 5;
                const targets = islands.filter(i => i.team !== 'blue');
                this.aiTargetIsland = targets.length > 0
                    ? targets[Math.floor(Math.random() * targets.length)]
                    : islands[Math.floor(Math.random() * islands.length)];
            }
            if (this.aiTargetIsland) {
                const tx = this.aiTargetIsland.x + this.aiTargetIsland.w * 0.5;
                if (this.x < tx - 50) this.vx += this.acceleration * dt;
                else if (this.x > tx + 50) this.vx -= this.acceleration * dt;
                if (this.isGrounded && (Math.abs(this.vx) < 50 || Math.random() < 0.015)) wantJump = true;
            }
        }

        if (!moving) {
            this.vx *= this.friction;
            if (Math.abs(this.vx) < 10) this.vx = 0;
        }
        if (this.vx > this.speed) this.vx = this.speed;
        if (this.vx < -this.speed) this.vx = -this.speed;

        // Wall collision
        if (walls) {
            for (let i = 0; i < walls.length; i++) {
                const wall = walls[i];
                if (!wall.dead &&
                    this.x + this.vx * dt < wall.x + wall.w &&
                    this.x + this.w + this.vx * dt > wall.x &&
                    this.y < wall.y + wall.h &&
                    this.y + this.h > wall.y) {
                    this.vx = 0;
                }
            }
        }

        this.x += this.vx * dt;
        this.vy += this.gravity * dt;
        if (this.vy > this.maxFallSpeed) this.vy = this.maxFallSpeed;

        if (wantJump) {
            if (this.isGrounded) {
                this.vy = this.jumpForce;
                this.isGrounded = false;
                if (audio) audio.play('jump', 0.4, 0.1);
            } else if (this.team === 'green') {
                this.vy -= 1500 * dt;
                if (this.vy < this.flyForce) this.vy = this.flyForce;
            } else {
                this.vy -= 100 * dt;
            }
        }

        // Save previous bottom before moving
        const prevBottom = this.y + this.h;

        this.y += this.vy * dt;
        this.isGrounded = false;

        if (this.vy >= 0) {
            const newBottom = this.y + this.h;
            for (let i = 0; i < islands.length; i++) {
                const island = islands[i];
                if (this.x < island.x + island.w && this.x + this.w > island.x) {
                    // Crossed the surface OR within generous fixed threshold
                    if ((prevBottom <= island.y + 5 && newBottom >= island.y - 5) ||
                        (newBottom >= island.y - 5 && newBottom <= island.y + 40)) {
                        this.y = island.y - this.h + 1;
                        this.vy = 0;
                        this.isGrounded = true;
                        this.x += island.vx * dt;
                    }
                }
            }
        }

        // World wrap
        if (this.y > worldHeight + 100) this.y = -100;
        if (this.y < -200) this.y = worldHeight;
        if (this.x > worldWidth) this.x = 0;
        if (this.x < -this.w) this.x = worldWidth;

        return Math.abs(this.vx) > 0.1 || Math.abs(this.vy) > 0.1;
    }

    draw(ctx, camera) {
        if (this.dead) return;
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h);
        if (!rect.onScreen) return;

        const sx = Math.floor(rect.x);
        const sy = Math.floor(rect.y);

        // Shadow
        drawShadow(ctx, sx, sy + this.h, this.w);

        // Chief indicator (player only)
        if (this.team === 'green') {
            ctx.fillStyle = '#00ff00';
            ctx.beginPath();
            ctx.moveTo(sx + this.w * 0.5, sy - 22);
            ctx.lineTo(sx + this.w * 0.5 - 8, sy - 30);
            ctx.lineTo(sx + this.w * 0.5 + 8, sy - 30);
            ctx.fill();
        }

        // Sprite
        const img = this.team === 'green' ? Assets.playerGreen : Assets.playerBlue;
        if (imgReady(img)) {
            ctx.drawImage(img, sx - 4, sy - 4, 48, 48);
        } else {
            ctx.fillStyle = this.team === 'green' ? '#0a0' : '#06f';
            ctx.fillRect(sx, sy, this.w, this.h);
        }

        // Health bar
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(sx, sy - 8, this.w, 4);
        const hpPct = Math.max(0, this.hp / this.maxHp);
        ctx.fillStyle = hpPct > 0.5 ? '#0f0' : hpPct > 0.25 ? '#ff0' : '#f00';
        ctx.fillRect(sx, sy - 8, this.w * hpPct, 4);
    }
}

// --- VILLAGER ---
export class Villager extends Entity {
    constructor(x, y, team) {
        super(x, y, 24, 24);
        this.team = team;
        this.hp = 10;
        this.homeIsland = null;
        this.vx = 0; this.vy = 0;
        this.stateTimer = 0;
        this.onGround = false;
        this.maxFallSpeed = 800;
        this.variantIndex = Math.floor(Math.random() * 4);
        this.attractorX = null;
        this.conversionTimer = 0;
        this.isBeingConverted = false;
    }

    update(dt, islands, worldWidth, worldHeight, pigs, walls, warState) {
        this.vy += 500 * dt;
        if (this.vy > this.maxFallSpeed) this.vy = this.maxFallSpeed;

        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
            this.stateTimer = 2 + Math.random() * 3;
            let interestX = null;

            if (this.homeIsland) {
                if (warState === 'ATTACK' && this.homeIsland.hasTeepee && Math.random() < 0.7) {
                    interestX = this.homeIsland.x + 80;
                } else if (Math.random() < 0.5 && pigs) {
                    const localPigs = pigs.filter(p => p.homeIsland === this.homeIsland);
                    if (localPigs.length > 0) interestX = localPigs[Math.floor(Math.random() * localPigs.length)].x;
                }
                if (interestX === null && this.homeIsland.hasTeepee && this.homeIsland.team === this.team) {
                    interestX = this.homeIsland.x + 80;
                }
                if (interestX === null) interestX = this.homeIsland.x + Math.random() * this.homeIsland.w;
            }

            this.attractorX = interestX;
            if (this.attractorX !== null) {
                this.vx = Math.abs(this.x - this.attractorX) > 40
                    ? (this.attractorX > this.x ? 60 : -60)
                    : (Math.random() - 0.5) * 40;
            } else {
                this.vx = (Math.random() - 0.5) * 60;
            }
        }

        // Wall bounce
        if (walls) {
            for (let i = 0; i < walls.length; i++) {
                const wall = walls[i];
                if (!wall.dead &&
                    this.x + this.vx * dt < wall.x + wall.w &&
                    this.x + this.w + this.vx * dt > wall.x &&
                    this.y < wall.y + wall.h && this.y + this.h > wall.y) {
                    this.vx *= -1;
                }
            }
        }

        // Random jump
        if (Math.abs(this.vx) > 10 && this.onGround && Math.random() < 0.008) {
            this.vy = -300; this.onGround = false;
        }

        // Stick to island
        if (this.onGround && this.homeIsland) {
            this.x += this.homeIsland.vx * dt;
            const nextX = this.x + this.w * 0.5 + (this.vx > 0 ? 10 : -10);
            if (nextX < this.homeIsland.x || nextX > this.homeIsland.x + this.homeIsland.w) this.vx *= -1;
        }

        // Save previous bottom
        const prevBottom = this.y + this.h;

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        this.onGround = false;
        if (this.vy >= 0) {
            const newBottom = this.y + this.h;
            for (let i = 0; i < islands.length; i++) {
                const island = islands[i];
                if (this.x + this.w > island.x && this.x < island.x + island.w) {
                    if ((prevBottom <= island.y + 5 && newBottom >= island.y - 5) ||
                        (newBottom >= island.y - 5 && newBottom <= island.y + 40)) {
                        this.y = island.y - this.h;
                        this.vy = 0;
                        this.onGround = true;
                        this.homeIsland = island;
                    }
                }
            }
        }

        if (this.y > worldHeight) this.dead = true;
        if (this.x > worldWidth) this.x = 0;
        if (this.x < 0) this.x = worldWidth;
    }

    draw(ctx, camera) {
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h);
        if (!rect.onScreen) return;
        const sx = Math.floor(rect.x);
        const sy = Math.floor(rect.y);

        // Shadow
        drawShadow(ctx, sx, sy + this.h, this.w);

        // Conversion glow
        if (this.isBeingConverted) {
            ctx.fillStyle = 'rgba(255,255,0,0.15)';
            ctx.beginPath();
            ctx.arc(sx + this.w * 0.5, sy + this.h * 0.5, 16, 0, Math.PI * 2);
            ctx.fill();
        }

        const variants = this.team === 'green' ? Assets.villagerGreen : Assets.villagerBlue;
        const img = variants[this.variantIndex];
        if (imgReady(img)) {
            ctx.drawImage(img, sx, sy, this.w, this.h);
        } else {
            ctx.fillStyle = this.team === 'green' ? '#0a0' : '#06f';
            ctx.fillRect(sx, sy, this.w, this.h);
        }
    }
}

// --- WARRIOR ---
export class Warrior extends Villager {
    constructor(x, y, team) {
        super(x, y, team);
        this.w = 32; this.h = 32;
        this.hp = 10;
        this.attackCooldown = 0;
        // Bodyguard/Homebody/Raider role system
        const r = Math.random();
        this.role = r < 0.3 ? 'bodyguard' : r < 0.65 ? 'homebody' : 'raider';
        this.maxFallSpeed = 1000;
        this.patrolTargetX = null;
        this.patrolTimer = 0;
        this.roleTimer = 5 + Math.random() * 10;
    }

    draw(ctx, camera) {
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h);
        if (!rect.onScreen) return;
        const sx = Math.floor(rect.x);
        const sy = Math.floor(rect.y);

        drawShadow(ctx, sx, sy + this.h, this.w);

        const img = this.team === 'green' ? Assets.warriorGreen : Assets.warriorBlue;
        if (imgReady(img)) {
            ctx.drawImage(img, sx, sy, this.w, this.h);
        } else {
            ctx.fillStyle = this.team === 'green' ? '#0a0' : '#06f';
            ctx.fillRect(sx, sy, this.w, this.h);
        }
    }

    updateLogic(dt, islands, enemies, spawnProjectile, worldWidth, worldHeight, audio, friendlyLeader, allVillagers, walls, warState) {
        this.vy += 500 * dt;
        if (this.vy > this.maxFallSpeed) this.vy = this.maxFallSpeed;
        this.attackCooldown -= dt;

        // Separation
        if (allVillagers) {
            for (let i = 0; i < allVillagers.length; i++) {
                const v = allVillagers[i];
                if (v === this || v.dead) continue;
                const dx = this.x - v.x;
                const dy = this.y - v.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < 400 && distSq > 0) {
                    const dist = Math.sqrt(distSq);
                    const push = (20 - dist) * 10;
                    this.vx += (dx / dist) * push * 5;
                    this.x += (dx / dist) * 2;
                }
            }
        }

        let moveTargetX = null;
        let moveTargetY = null;
        let targetEnemy = null;
        let forcedAggro = false;

        // War state behavior
        if (warState === 'GATHER' && friendlyLeader && !friendlyLeader.dead) {
            moveTargetX = friendlyLeader.x + (Math.random() * 200 - 100);
            moveTargetY = friendlyLeader.y;
        } else if (warState === 'ATTACK') {
            const enemyChief = enemies.find(e => e instanceof Player && e.team !== this.team);
            if (enemyChief && !enemyChief.dead) {
                moveTargetX = enemyChief.x;
                moveTargetY = enemyChief.y;
                forcedAggro = true;
            }
        }

        // Target selection
        let bestScore = -Infinity;
        const detectionRange = forcedAggro ? 800 : (enemies.length < 5 ? 10000 : 600);

        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (e.team === this.team || e.dead) continue;
            const dx = e.x - this.x;
            const dy = e.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < detectionRange) {
                let score = 10000 - dist;
                if (e instanceof Warrior) score += 500;
                else if (e instanceof Player) score += 1000;
                if (score > bestScore) { bestScore = score; targetEnemy = e; }
            }
        }

        // Attack
        if (targetEnemy && (forcedAggro || enemies.length < 5 || Math.abs(targetEnemy.x - this.x) < 600)) {
            if (Math.abs(targetEnemy.x - this.x) < 400) this.vx *= 0.8;

            if (this.attackCooldown <= 0) {
                this.attackCooldown = 1.5 + Math.random();
                const dx = targetEnemy.x - this.x;
                const dy = (targetEnemy.y - 20) - this.y;
                const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.25;
                spawnProjectile(this.x, this.y, angle, this.team, 10);
            }

            if (warState === 'BUILD') {
                this.vx += Math.sign(targetEnemy.x - this.x) * 50;
            }
        }

        // Movement - Bodyguard/Homebody/Raider state tree
        if (warState === 'BUILD' && moveTargetX === null) {
            this.roleTimer -= dt;
            if (this.roleTimer <= 0) {
                this.roleTimer = 10 + Math.random() * 10;
                // Role transitions with weighted probabilities
                const r = Math.random();
                if (this.role === 'bodyguard') {
                    this.role = r < 0.3 ? 'homebody' : r < 0.6 ? 'raider' : 'bodyguard';
                } else if (this.role === 'homebody') {
                    this.role = r < 0.25 ? 'bodyguard' : r < 0.5 ? 'raider' : 'homebody';
                } else { // raider
                    this.role = r < 0.2 ? 'bodyguard' : r < 0.45 ? 'homebody' : 'raider';
                }
            }

            if (this.role === 'bodyguard' && friendlyLeader && !friendlyLeader.dead) {
                // Stay near chief
                moveTargetX = friendlyLeader.x + (Math.random() - 0.5) * 150;
                moveTargetY = friendlyLeader.y;
            } else if (this.role === 'homebody' && this.homeIsland) {
                // Defend home island - stay on it, patrol back and forth
                moveTargetX = this.homeIsland.x + Math.random() * this.homeIsland.w;
                moveTargetY = this.homeIsland.y - 30;
            } else {
                // Raider - seek enemy territory
                this.patrolTimer -= dt;
                if (this.patrolTimer <= 0 || this.patrolTargetX === null || Math.abs(this.x - this.patrolTargetX) < 100) {
                    this.patrolTimer = 8 + Math.random() * 12;
                    if (islands.length > 0) {
                        // Prefer enemy islands
                        const enemyIslands = islands.filter(i => i.team !== this.team && i.team !== 'neutral');
                        const targetIslands = enemyIslands.length > 0 ? enemyIslands : islands;
                        const ri = targetIslands[Math.floor(Math.random() * targetIslands.length)];
                        this.patrolTargetX = ri.x + ri.w * 0.5;
                        this.patrolTargetY = ri.y - 50;
                    }
                }
                moveTargetX = this.patrolTargetX;
                moveTargetY = this.patrolTargetY;
            }
        }

        // Apply movement
        if (moveTargetX !== null) {
            const dx = moveTargetX - this.x;
            if (Math.abs(dx) > 10) this.vx += Math.sign(dx) * 1500 * dt;
            else this.vx *= 0.9;
        } else {
            this.vx *= 0.9;
        }

        // Fly towards target Y
        if (moveTargetY !== null) {
            const dy = moveTargetY - this.y;
            if (Math.abs(dy) > 50) this.vy += Math.sign(dy) * 1500 * dt;
        }

        // Speed cap
        const maxSpeed = 350;
        if (this.vx > maxSpeed) this.vx = maxSpeed;
        if (this.vx < -maxSpeed) this.vx = -maxSpeed;
        if (this.vy > maxSpeed) this.vy = maxSpeed;
        if (this.vy < -maxSpeed) this.vy = -maxSpeed;

        // Save previous bottom
        const prevBottom = this.y + this.h;

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Landing
        this.onGround = false;
        if (this.vy >= 0) {
            const newBottom = this.y + this.h;
            for (let i = 0; i < islands.length; i++) {
                const island = islands[i];
                if (this.x + this.w > island.x && this.x < island.x + island.w) {
                    if ((prevBottom <= island.y + 5 && newBottom >= island.y - 5) ||
                        (newBottom >= island.y - 5 && newBottom <= island.y + 40)) {
                        this.y = island.y - this.h;
                        this.vy = 0;
                        this.onGround = true;
                        this.homeIsland = island;
                        this.x += island.vx * dt;
                    }
                }
            }
        }

        // AI jump
        if (this.onGround) {
            if (Math.random() < 0.005) { this.vy = -500; this.onGround = false; }
            if (moveTargetX !== null && Math.abs(moveTargetX - this.x) > 100 && Math.random() < 0.02) {
                this.vy = -500; this.onGround = false;
            }
        }

        // World wrap
        if (this.y > worldHeight) this.dead = true;
        if (this.x > worldWidth) this.x = 0;
        if (this.x < 0) this.x = worldWidth;
    }
}

// --- PIG ---
export class Pig extends Entity {
    constructor(x, y) {
        super(x, y, 32, 24);
        this.hp = 10;
        this.vx = 0; this.vy = 0;
        this.stateTimer = 0;
        this.onGround = false;
        this.maxFallSpeed = 800;
        this.homeIsland = null;
    }

    update(dt, islands, worldWidth, worldHeight) {
        this.vy += 800 * dt;
        if (this.vy > this.maxFallSpeed) this.vy = this.maxFallSpeed;

        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
            this.stateTimer = 2 + Math.random() * 3;
            this.vx = (Math.random() - 0.5) * 40;
        }

        if (this.onGround && this.homeIsland) {
            if (this.x < this.homeIsland.x) this.vx = Math.abs(this.vx);
            if (this.x > this.homeIsland.x + this.homeIsland.w) this.vx = -Math.abs(this.vx);
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        this.onGround = false;
        if (this.vy >= 0) {
            for (let i = 0; i < islands.length; i++) {
                const island = islands[i];
                if (this.x < island.x + island.w && this.x + this.w > island.x) {
                    const threshold = island.y + 30 + this.vy * dt;
                    if (this.y + this.h >= island.y && this.y + this.h <= threshold) {
                        this.y = island.y - this.h;
                        this.vy = 0;
                        this.onGround = true;
                        this.homeIsland = island;
                    }
                }
            }
        }

        if (this.y > worldHeight) this.y = -50;
        if (this.x > worldWidth) this.x = 0;
        if (this.x < 0) this.x = worldWidth;
    }

    draw(ctx, camera) {
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h);
        if (!rect.onScreen) return;
        const sx = Math.floor(rect.x);
        const sy = Math.floor(rect.y);

        drawShadow(ctx, sx, sy + this.h, this.w);

        if (imgReady(Assets.pig)) {
            ctx.drawImage(Assets.pig, sx, sy, this.w, this.h);
        } else {
            ctx.fillStyle = '#FFC0CB';
            ctx.fillRect(sx, sy, this.w, this.h);
        }
    }
}

// --- PROJECTILE ---
export class Projectile extends Entity {
    constructor(x, y, angle, team, damage) {
        super(x, y, 32, 10);
        this.team = team;
        this.damage = damage;
        const speed = 600;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.angle = angle;
        this.life = 3.0;
        this.trailTimer = 0;
    }

    update(dt, walls) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        if (this.life <= 0) this.dead = true;

        // Spawn trail particle
        this.trailTimer -= dt;
        if (this.trailTimer <= 0) {
            this.trailTimer = 0.04;
            spawnParticle(this.x, this.y, this.team === 'green' ? '#90EE90' : '#ADD8E6', 5, 0.3, 3, 'trail');
        }

        // Wall collision
        if (walls) {
            for (let i = 0; i < walls.length; i++) {
                const wall = walls[i];
                if (!wall.dead &&
                    this.x < wall.x + wall.w && this.x + this.w > wall.x &&
                    this.y < wall.y + wall.h && this.y + this.h > wall.y) {
                    this.dead = true;
                    wall.hp -= 20;
                    spawnParticle(this.x, this.y, '#888', 30, 0.3, 3, 'normal');
                }
            }
        }
    }

    draw(ctx, camera) {
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h);
        if (!rect.onScreen) return;

        ctx.save();
        ctx.translate(rect.x, rect.y);
        ctx.rotate(this.angle);

        if (imgReady(Assets.projectile)) {
            ctx.drawImage(Assets.projectile, 0, 0, this.w, this.h);
        } else {
            ctx.fillStyle = this.team === 'green' ? '#0f0' : '#0af';
            ctx.fillRect(0, 0, this.w, this.h);
        }
        ctx.restore();
    }
}

// --- FIREBALL ---
export class Fireball extends Entity {
    constructor(x, y, angle, team) {
        super(x, y, 60, 60);
        this.team = team;
        const speed = 400;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.angle = angle;
        this.life = 4.0;
        this.damage = 100;
        this._particleTimer = 0;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        if (this.life <= 0) this.dead = true;

        // Spawn fire particles (pooled)
        this._particleTimer -= dt;
        if (this._particleTimer <= 0) {
            this._particleTimer = 0.03;
            const color = this.team === 'green' ? '#FF4500' : '#8A2BE2';
            spawnParticle(
                this.x + (Math.random() - 0.5) * 30,
                this.y + (Math.random() - 0.5) * 30,
                color, 30, 0.3 + Math.random() * 0.3, 8 + Math.random() * 12, 'glow'
            );
        }
    }

    draw(ctx, camera) {
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h);
        if (!rect.onScreen) return;

        const cx = rect.x + this.w * 0.5;
        const cy = rect.y + this.h * 0.5;

        // Core glow
        ctx.globalCompositeOperation = 'lighter';
        const coreColor = this.team === 'green' ? 'rgba(255,100,0,' : 'rgba(138,43,226,';

        // Outer glow
        ctx.fillStyle = coreColor + '0.15)';
        ctx.beginPath();
        ctx.arc(cx, cy, 40, 0, Math.PI * 2);
        ctx.fill();

        // Inner glow
        ctx.fillStyle = coreColor + '0.4)';
        ctx.beginPath();
        ctx.arc(cx, cy, 22, 0, Math.PI * 2);
        ctx.fill();

        // Bright core
        ctx.fillStyle = 'rgba(255,255,200,0.7)';
        ctx.beginPath();
        ctx.arc(cx, cy, 10, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalCompositeOperation = 'source-over';
    }
}

// --- STONE WALL ---
export class StoneWall extends Entity {
    constructor(x, y) {
        super(x, y, 40, 120);
        this.hp = 250; this.maxHp = 250;
        this.vx = 0; this.vy = 0;
        this.onGround = false;
    }

    update(dt, islands, worldHeight) {
        this.vy += 1000 * dt;
        this.y += this.vy * dt;
        this.onGround = false;

        if (this.vy >= 0) {
            for (let i = 0; i < islands.length; i++) {
                const island = islands[i];
                if (this.x + this.w > island.x && this.x < island.x + island.w) {
                    const threshold = 10 + this.vy * dt * 2;
                    if (this.y + this.h >= island.y && this.y + this.h <= island.y + threshold) {
                        this.y = island.y - this.h;
                        this.vy = 0;
                        this.onGround = true;
                        this.x += island.vx * dt;
                        this.y += island.vy * dt;
                    }
                }
            }
        }

        if (this.y > worldHeight) this.dead = true;
        if (this.hp <= 0) this.dead = true;
    }

    draw(ctx, camera) {
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h);
        if (!rect.onScreen) return;
        const sx = Math.floor(rect.x);
        const sy = Math.floor(rect.y);

        // 2.5D wall with depth
        const wallDepth = 8;
        ctx.fillStyle = '#555';
        ctx.fillRect(sx + wallDepth, sy + wallDepth, this.w, this.h);
        ctx.fillStyle = '#696969';
        ctx.fillRect(sx, sy, this.w, this.h);
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx, sy, this.w, this.h);

        // Damage cracks
        const dmg = 1 - this.hp / this.maxHp;
        if (dmg > 0.2) {
            ctx.strokeStyle = '#333';
            ctx.beginPath();
            ctx.moveTo(sx + 5, sy + 10);
            ctx.lineTo(sx + 20, sy + 40);
            ctx.stroke();
        }
        if (dmg > 0.5) {
            ctx.beginPath();
            ctx.moveTo(sx + 35, sy + 80);
            ctx.lineTo(sx + 10, sy + 100);
            ctx.stroke();
        }
    }
}

// --- RAIN CLOUD ---
export class RainCloud extends Entity {
    constructor(x, y, team) {
        super(x, y, 100, 50);
        this.team = team;
        this.life = 2.0;
        this._dropTimer = 0;
    }

    update(dt) {
        this.life -= dt;
        if (this.life <= 0) this.dead = true;

        this._dropTimer -= dt;
        if (this._dropTimer <= 0) {
            this._dropTimer = 0.05;
            spawnParticle(
                this.x + (Math.random() - 0.5) * 120,
                this.y + Math.random() * 15,
                '#87CEEB', 200, 0.5, 2, 'normal'
            );
        }
    }

    draw(ctx, camera) {
        const rect = camera.getScreenRect(this.x, this.y, this.w, this.h);
        if (!rect.onScreen) return;

        const color = this.team === 'green' ? 'rgba(200,200,255,0.35)' : 'rgba(100,0,100,0.35)';
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(rect.x, rect.y, 40, 0, Math.PI * 2);
        ctx.arc(rect.x + 30, rect.y - 10, 50, 0, Math.PI * 2);
        ctx.arc(rect.x - 30, rect.y - 10, 50, 0, Math.PI * 2);
        ctx.fill();
    }
}

// --- VISUAL EFFECT ---
export class VisualEffect extends Entity {
    constructor(x, y, type) {
        super(x, y, 0, 0);
        this.type = type;
        this.life = type === 'impact' ? 0.15 : 0.4;
    }

    update(dt) {
        this.life -= dt;
        if (this.life <= 0) this.dead = true;
    }

    draw(ctx, camera) {
        if (this.type === 'lightning') {
            const rect = camera.getScreenRect(this.x, this.y, 0, 0);
            if (!rect.onScreen) return;

            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            let cx = rect.x;
            ctx.moveTo(cx, 0);
            for (let cy = 0; cy < camera.effectiveH; cy += 20) {
                cx += (Math.random() - 0.5) * 60;
                ctx.lineTo(cx, cy);
            }
            ctx.stroke();

            if (Math.random() > 0.5) {
                ctx.fillStyle = 'rgba(255,255,255,0.08)';
                ctx.fillRect(0, 0, camera.effectiveW, camera.effectiveH);
            }
        }
    }
}

// --- TOTEM ---
export class Totem {
    constructor(x, y, team) {
        this.x = x; this.y = y;
        this.team = team;
        this.w = 60; this.h = 120;
        this.range = 300;
        this.conversionRate = 5.0;
        this.active = true;
        this._pulseTime = Math.random() * 6.28;
    }

    update(dt, villagers) {
        if (!this.active) return;
        this._pulseTime += dt * 2;

        for (let i = 0; i < villagers.length; i++) {
            const v = villagers[i];
            if (v.team === this.team || v.dead) continue;
            const dx = v.x - this.x;
            const dy = v.y - this.y;
            if (dx * dx + dy * dy < this.range * this.range) {
                if (!v.conversionTimer) v.conversionTimer = 0;
                v.conversionTimer += dt;
                v.isBeingConverted = true;

                if (v.conversionTimer > this.conversionRate) {
                    v.team = this.team;
                    v.conversionTimer = 0;
                    v.isBeingConverted = false;
                }
            } else {
                if (v.conversionTimer > 0) {
                    v.conversionTimer = 0;
                    v.isBeingConverted = false;
                }
            }
        }
    }

    draw(ctx, cam) {
        if (!this.active) return;
        const rect = cam.getScreenRect(this.x, this.y, this.w, this.h);
        if (!rect.onScreen) return;

        const sx = rect.x;
        const sy = rect.y;
        const pulse = 0.5 + Math.sin(this._pulseTime) * 0.2;

        // Aura ring
        const auraColor = this.team === 'green' ? `rgba(0,255,0,${pulse * 0.06})` : `rgba(0,150,255,${pulse * 0.06})`;
        ctx.fillStyle = auraColor;
        ctx.beginPath();
        ctx.arc(sx, sy - 60, this.range * 0.3, 0, Math.PI * 2);
        ctx.fill();

        // Totem sprite
        if (imgReady(Assets.totem)) {
            ctx.drawImage(Assets.totem, sx - 30, sy - 120, 60, 120);
        } else {
            ctx.fillStyle = this.team === 'green' ? '#AAFF00' : '#00AAFF';
            ctx.fillRect(sx - 15, sy - 120, 30, 120);
        }

        // Top glow
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = this.team === 'green' ? `rgba(0,255,0,${pulse * 0.3})` : `rgba(0,150,255,${pulse * 0.3})`;
        ctx.beginPath();
        ctx.arc(sx, sy - 115, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
    }
}

// --- WEATHER: LEAF ---
export class Leaf {
    constructor(x, y, layer) {
        this.x = x; this.y = y;
        this.layer = layer || 'fg';
        this.dead = false;

        if (this.layer === 'fg') {
            this.scale = 1.0 + Math.random() * 0.5;
            this.vx = 200 + Math.random() * 300;
            this.vy = 50 + Math.random() * 100;
            this.rotationSpeed = (Math.random() - 0.5) * 6;
        } else {
            this.scale = 0.4 + Math.random() * 0.4;
            this.vx = 50 + Math.random() * 100;
            this.vy = 10 + Math.random() * 30;
            this.rotationSpeed = (Math.random() - 0.5) * 2;
        }
        this.angle = Math.random() * Math.PI * 2;
        this.life = 5 + Math.random() * 5;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.angle += this.rotationSpeed * dt;
        this.life -= dt;
        if (this.life <= 0) this.dead = true;
    }

    draw(ctx, camera) {
        const sx = this.x - camera.x;
        const sy = this.y - camera.y;
        if (sx < -50 || sx > camera.effectiveW + 50) return;

        if (imgReady(Assets.leaf)) {
            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(this.angle);
            ctx.globalAlpha = Math.min(1, this.life * 0.5);
            const s = 32 * this.scale;
            ctx.drawImage(Assets.leaf, -s * 0.5, -s * 0.5, s, s);
            ctx.globalAlpha = 1;
            ctx.restore();
        } else {
            // Fallback: colored rectangle
            ctx.globalAlpha = Math.min(1, this.life * 0.5);
            ctx.fillStyle = '#c44';
            const s = 8 * this.scale;
            ctx.fillRect(sx - s * 0.5, sy - s * 0.5, s, s);
            ctx.globalAlpha = 1;
        }
    }
}

// --- WEATHER: SNOWFLAKE ---
export class Snowflake {
    constructor(x, y, layer) {
        this.x = x; this.y = y;
        this.layer = layer || 'fg';
        this.dead = false;
        this.sway = Math.random() * Math.PI;
        this.life = 8;

        if (this.layer === 'fg') {
            this.size = 6 + Math.random() * 6;
            this.vx = -100 + Math.random() * 200;
            this.vy = 200 + Math.random() * 200;
            this.swaySpeed = 3 + Math.random() * 4;
        } else {
            this.size = 2 + Math.random() * 3;
            this.vx = -20 + Math.random() * 40;
            this.vy = 80 + Math.random() * 50;
            this.swaySpeed = 1 + Math.random() * 2;
        }
    }

    update(dt) {
        this.sway += dt * this.swaySpeed;
        const swayAmp = this.layer === 'fg' ? 80 : 20;
        this.x += (this.vx + Math.sin(this.sway) * swayAmp) * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        if (this.life <= 0) this.dead = true;
    }

    draw(ctx, camera) {
        const sx = this.x - camera.x;
        const sy = this.y - camera.y;
        if (sx < -20 || sx > camera.effectiveW + 20) return;

        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(sx, sy, this.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
    }
}
