/* RESOURCE MANAGER - REMASTERED
   Populous-inspired power system. Mana scales with territory.
   Throttled UI updates for performance.
*/

export class ResourceManager {
    constructor() {
        this.greenTents = 1;
        this.greenPop = 0;
        this.blueTents = 1;
        this.bluePop = 0;

        this.currentSpell = 0;
        this.spellNames = ["FIREBALL", "AEROKINESIS", "QUAKE", "TIDE OF LIFE"];
        this.spellColors = ["#FF4500", "#87CEEB", "#8B4513", "#00BFFF"];

        this.mana = 100;
        this.maxMana = 100;

        // Throttle UI updates
        this._uiTimer = 0;
        this._uiInterval = 0.05; // 20 updates/sec max

        // UI elements (cached)
        this.ui = {
            pPop: document.getElementById('p-pop'),
            pTents: document.getElementById('p-tents'),
            pHealth: document.getElementById('p-health'),
            ePop: document.getElementById('e-pop'),
            eTents: document.getElementById('e-tents'),
            eHealth: document.getElementById('e-health'),
            barMana: document.getElementById('bar-mana'),
            msgArea: document.getElementById('message-area'),
            spells: [
                document.getElementById('spell-0'),
                document.getElementById('spell-1'),
                document.getElementById('spell-2'),
                document.getElementById('spell-3')
            ]
        };
    }

    cycleSpell(direction) {
        this.currentSpell = ((this.currentSpell + direction) % 4 + 4) % 4;
        this._updateSpellUI();
    }

    setSpell(index) {
        if (index >= 0 && index <= 3) {
            this.currentSpell = index;
            this._updateSpellUI();
        }
    }

    _updateSpellUI() {
        if (!this.ui.spells[0]) return;
        for (let i = 0; i < 4; i++) {
            const el = this.ui.spells[i];
            if (el) {
                if (i === this.currentSpell) el.classList.add('active');
                else el.classList.remove('active');
            }
        }
    }

    replenishAll() {
        this.mana = this.maxMana;
        this.showMessage("ENEMY CHIEF SLAIN!", "#FFD700");
    }

    addMana(amount) {
        this.mana = this.maxMana;
    }

    addSouls(amount) {
        this.addMana(amount);
    }

    spendMana(amount) {
        // Unlimited spells - always succeed, keep mana full
        this.mana = this.maxMana;
        return true;
    }

    spendAir(dt) { return true; }

    updateStats(gTents, gPop, bTents, bPop) {
        this.greenTents = gTents;
        this.greenPop = gPop;
        this.blueTents = bTents;
        this.bluePop = bPop;
    }

    updateUI(playerHp, playerMaxHp, enemyHp, enemyMaxHp, dt) {
        this._uiTimer += dt || 0;
        if (this._uiTimer < this._uiInterval) return;
        this._uiTimer = 0;

        if (!this.ui.pPop) return;

        this.ui.pPop.textContent = this.greenPop;
        this.ui.pTents.textContent = `Tents: ${this.greenTents}`;
        this.ui.ePop.textContent = this.bluePop;
        this.ui.eTents.textContent = `Tents: ${this.blueTents}`;

        const pPct = Math.max(0, (playerHp / playerMaxHp) * 100);
        this.ui.pHealth.style.width = `${pPct}%`;

        const ePct = Math.max(0, (enemyHp / enemyMaxHp) * 100);
        this.ui.eHealth.style.width = `${ePct}%`;

        if (this.ui.barMana) {
            this.ui.barMana.style.width = `${(this.mana / this.maxMana) * 100}%`;
        }
    }

    showMessage(text, color) {
        const msg = this.ui.msgArea;
        if (!msg) return;
        msg.textContent = text;
        msg.style.color = color;
        msg.style.opacity = '1';
        msg.style.transform = 'scale(1.2)';
        clearTimeout(this._msgTimeout);
        this._msgTimeout = setTimeout(() => {
            msg.style.opacity = '0';
            msg.style.transform = 'scale(1)';
        }, 2000);
    }
}
