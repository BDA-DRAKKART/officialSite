/** * LOGIQUE DRAKK'ART - MENU, OPTIONS & JEU */

// --- 1. SÉCURITÉ : BLOCAGE DU ZOOM ---
window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && (e.key === '+' || e.key === '-' || e.key === '0')) e.preventDefault();
});

// --- SYSTÈME AUDIO (BGM avec fade-in/fade-out) ---
const _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const _masterGain = _audioCtx.createGain();
_masterGain.connect(_audioCtx.destination);
const BGM_FADE = 2.5; // secondes de fade
const _bgmBuffers = {};
let _bgmSource = null, _bgmGain = null, _currentBgmUrl = null;

async function _loadBgmBuffer(url) {
    if (_bgmBuffers[url]) return _bgmBuffers[url];
    try {
        const resp = await fetch(url);
        const data = await resp.arrayBuffer();
        _bgmBuffers[url] = await _audioCtx.decodeAudioData(data);
    } catch(e) { console.warn('[AUDIO] Impossible de charger :', url); }
    return _bgmBuffers[url];
}

function _startBgmNow(buffer) {
    if (!buffer) return;
    if (_bgmGain) { _bgmGain.disconnect(); }
    _bgmGain = _audioCtx.createGain();
    _bgmGain.connect(_masterGain);
    _bgmGain.gain.value = 0;
    _bgmSource = _audioCtx.createBufferSource();
    _bgmSource.buffer = buffer;
    _bgmSource.loop = false;
    _bgmSource.connect(_bgmGain);
    _bgmSource.start();
    const now = _audioCtx.currentTime;
    const dur = buffer.duration;
    // Fade in
    _bgmGain.gain.setValueAtTime(0, now);
    _bgmGain.gain.linearRampToValueAtTime(1, now + BGM_FADE);
    // Fade out avant la fin
    const foStart = now + Math.max(dur - BGM_FADE, BGM_FADE);
    _bgmGain.gain.setValueAtTime(1, foStart);
    _bgmGain.gain.linearRampToValueAtTime(0, now + dur);
    // Boucle
    _bgmSource.onended = () => {
        if (_currentBgmUrl && _bgmBuffers[_currentBgmUrl]) {
            _startBgmNow(_bgmBuffers[_currentBgmUrl]);
        }
    };
}

async function playBGM(url) {
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    if (_currentBgmUrl === url) return;
    // Fade out l'actuel
    if (_bgmGain && _bgmSource) {
        const g = _bgmGain, s = _bgmSource;
        g.gain.cancelScheduledValues(_audioCtx.currentTime);
        g.gain.setValueAtTime(g.gain.value, _audioCtx.currentTime);
        g.gain.linearRampToValueAtTime(0, _audioCtx.currentTime + BGM_FADE);
        setTimeout(() => { try { s.stop(); } catch(e){} }, BGM_FADE * 1000);
    }
    _currentBgmUrl = url;
    const buffer = await _loadBgmBuffer(url);
    if (_currentBgmUrl !== url) return; // changé entre-temps
    setTimeout(() => {
        if (_currentBgmUrl === url) _startBgmNow(buffer);
    }, _bgmGain ? BGM_FADE * 1000 : 0);
}

function stopBGM() {
    if (!_bgmGain || !_bgmSource) return;
    _currentBgmUrl = null;
    const g = _bgmGain, s = _bgmSource;
    g.gain.cancelScheduledValues(_audioCtx.currentTime);
    g.gain.setValueAtTime(g.gain.value, _audioCtx.currentTime);
    g.gain.linearRampToValueAtTime(0, _audioCtx.currentTime + BGM_FADE);
    setTimeout(() => { try { s.stop(); } catch(e){} }, BGM_FADE * 1000);
    _bgmSource = null;
}

// --- 2. VARIABLES ET ÉTATS ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const startBtn = document.getElementById('startBtn');
const sliderContent = document.getElementById('sliderContent');
const gameFrame = document.getElementById('gameFrame');

let gameRunning = false; 
let frameCount = 0;
let lastTime = 0; 
let dt = 1;       

let pauseStartTime = 0;
let totalPausedTime = 0;

const BASE_HEIGHT = 1080;
let scaleF = window.innerHeight / BASE_HEIGHT; 

// --- GESTION DES PHASES ---
let currentPhase = 1; 
let isTransitioning = false;
let transitionAlpha = 0; // Opacité de l'écran noir (0 = transparent, 1 = noir)
let nextPhaseToLoad = 0; 

// --- VARIABLES DU CHRONOMÈTRE ---
let gameStartTime = 0;
let finalGameTime = 0;
let isTimerRunning = false;

// Formater le temps 
function formatTime(ms) {
    let totalSeconds = Math.floor(ms / 1000);
    let minutes = Math.floor(totalSeconds / 60);
    let seconds = totalSeconds % 60;
    let centis = Math.floor((ms % 1000) / 10); 
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${centis.toString().padStart(2, '0')}`;
}

let gameState = 'MENU'; 
let selectedChar = "Cédrick"; 

let imagesToLoad = 0;
let imagesLoaded = 0;

// --- SYSTÈME DE PRÉCHARGEMENT ---
const assetsToLoad = {
    plateGlace : 'images/jv/phase2/map/plate_glace.png',
    ciel: 'images/jv/phase3/ciel_plan_7.png',
    montagne: 'images/jv/phase3/montagne_plan_6.png',
    falaise: 'images/jv/phase3/falaise_plan_5.png',
    plage: 'images/jv/phase3/plage_plan_2.png',
    plateforme: 'images/jv/phase3/plateforme_plan_1.png',
    plateforme_2 : 'images/jv/phase2/map/plateforme.png',
    vague1: 'images/jv/phase3/vague_1.png',
    vague2: 'images/jv/phase3/vague_2.png',
    vague3: 'images/jv/phase3/vague_3.png',
    vague4: 'images/jv/phase3/vague_4.png',
    vague5: 'images/jv/phase3/vague_5.png',
    vague6: 'images/jv/phase3/vague_6.png',
    vague7: 'images/jv/phase3/vague_7.png',
    vague8: 'images/jv/phase3/vague_8.png', 
    vagueFond1: 'images/jv/phase3/vague_fond_1.png',
    vagueFond2: 'images/jv/phase3/vague_fond_2.png',
    vagueFond3: 'images/jv/phase3/vague_fond_3.png',
    cedrickacclame0: `images/jv/persoAcclame/cedrickacclame_0000.png`,
    quentinacclame0: `images/jv/persoAcclame/quentinacclame_0000.png`,
    coeurplein : "images/jv/coeurplein.png",
    coeurvide : "images/jv/coeurvide.png",
    fondlac : "images/jv/phase2/map/fond_avec_lac.png",
    imgCiel : 'images/jv/phase2/map/ciel.png',
    imgPlan5 : 'images/jv/phase2/map/5_plan.png',
    imgPlan4 : 'images/jv/phase2/map/4_plan.png',
    imgPlan3 : 'images/jv/phase2/map/3_plan.png',
    imgPlan2 : 'images/jv/phase2/map/2_plan.png',
    imgPlan1 : 'images/jv/phase2/map/1plan.png',
    imgPlan1Sol : 'images/jv/phase2/map/1plan sol.png',
    endBgImage : "images/jv/phase3/DecorPlage.png",
    imgCrachat : "images/jv/phase2/mouette/crachat.jpeg",
};

const loadedImages = {};

function preloadAssets(onComplete) {
    let loaded = 0;
    const total = Object.keys(assetsToLoad).length;
    const failed = [];

    for (let key in assetsToLoad) {
        let img = new Image();
        img.src = assetsToLoad[key];

        img.onload = () => {
            loadedImages[key] = img;
            loaded++;
            if (loaded === total) onComplete(failed);
        };

        img.onerror = () => {
            failed.push(key + ' (' + assetsToLoad[key] + ')');
            console.warn('[ASSET MANQUANT] ' + key + ' → ' + assetsToLoad[key]);
            loaded++;
            if (loaded === total) onComplete(failed);
        };
    }
}

startBtn.disabled = true;
startBtn.innerText = "Chargement...";

const playerImages = [];
const playerImagesJumping = [];
const playerImagesRunning = [];
const playerImagesHache = [];
const playerImagesCrouch = [];
const mouetteImages = [];
const espadonImages = [];
const poneyImages = [];

const charAcclame1 = [];
const charAcclame2 = [];

const crachatImages = [];

// --- ANIMATIONS DU KRAKEN (BOSS) ---
const krakenPrepVerticaleImages = [];    // prepVerticale_00{i}   phase 1
const krakenPrepHorizontaleImages = [];  // prepAttaqueHorizontale_00{i}  phase 2
const tentaculeVerticalImages = [];      // tentaculeVertical_00{i}
const tentaculeHorizontalImages = [];    // tentaculeHorizontal_00{i}

const charSelectButtons = {
    cedrick: { x: 0, y: 0, w: 200, h: 60, text: "CÉDRICK" },
    quentin: { x: 0, y: 0, w: 200, h: 60, text: "QUENTIN" }
};

// Création du tableau Parallax
let imgHeartFull, imgHeartEmpty, bgImage, imgCiel, imgPlan5, imgPlan4, imgPlan3, imgPlan2, imgPlan1, imgPlan1Sol, endBgImage, imgCrachat;
let parallaxLayers = [];

// Chargement unique de tous les assets 
preloadAssets((failed) => {
    if (failed.length > 0) {
        console.error('[CHARGEMENT INCOMPLET] ' + failed.length + ' image(s) manquante(s) :');
        failed.forEach(f => console.error('  ✗ ' + f));
    } else {
        console.log('[CHARGEMENT OK] Toutes les images sont chargées.');
    }

    const critiques = ['fondlac', 'imgCiel', 'imgPlan5', 'imgPlan4', 'imgPlan3', 'imgPlan2', 'imgPlan1', 'imgPlan1Sol', 'ciel', 'montagne', 'falaise', 'plage', 'plateforme'];
    const manquants = critiques.filter(k => !loadedImages[k]);
    if (manquants.length > 0) {
        startBtn.disabled = true;
        startBtn.innerText = '⚠ Images manquantes !';
        console.error('[BLOQUÉ] Backgrounds introuvables : ' + manquants.join(', '));
        return;
    }

    startBtn.disabled = false;
    startBtn.innerText = "Jouer !";

    imgHeartFull = loadedImages.coeurplein;
    imgHeartEmpty = loadedImages.coeurvide;
    bgImage = loadedImages.fondlac;
    
    imgCiel = loadedImages.imgCiel;
    imgPlan5 = loadedImages.imgPlan5;
    imgPlan4 = loadedImages.imgPlan4;
    imgPlan3 = loadedImages.imgPlan3;
    imgPlan2 = loadedImages.imgPlan2;
    imgPlan1 = loadedImages.imgPlan1;
    imgPlan1Sol = loadedImages.imgPlan1Sol;
    
    imgCrachat = loadedImages.imgCrachat;

    for (let i = 0; i <= 0; i++) {
        charAcclame1.push(loadedImages[`cedrickacclame${i}`]);
        charAcclame2.push(loadedImages[`quentinacclame${i}`]);
    }

    parallaxLayers = [
        { img: imgCiel,     speed: 0.7, x: 0 },
        { img: imgPlan5,    speed: 0.9, x: 0 },
        { img: imgPlan4,    speed: 0.9, x: 0 },
        { img: imgPlan3,    speed: 1.5, x: 0 },
        { img: imgPlan2,    speed: 1.5, x: 0 },
        { img: imgPlan1,    speed: 1.5, x: 0 },
        { img: imgPlan1Sol, speed: 2.0, x: 0 }
    ];
});


// --- PARAMÈTRES RÉGLABLES POUR LA PHASE 3 ---
const waveAnimSpeed = 400; 
let parallaxConfig = [
    { key: 'ciel', speed: 0.5, x: 0 },
    { key: 'montagne', speed: 1.0, x: 0 },
    { key: 'falaise', speed: 2.0, x: 0 },
    { key: 'plage', speed: 3.0, x: 0 },
    { key: 'plateforme', speed: 5.0, x: 0 }
];

let mapWidth = 0;
let mapHeight = 0;
let cameraX = 0;

class Espadon {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 600 * scaleF;
        this.h = 700 * scaleF;
        this.hp = 3;
        
        this.frameIndex = 0;
        this.tickCount = 0;
        this.ticksPerFrame = 12; // ×1.5 (était 8) car 2 images sur 3 chargées → durée d'animation identique
        this.hitboxDefinitions = [
            [460, 460, 120, 200], [440, 430, 120, 200], [360, 290, 160, 200],
            [210, 140, 350, 220],  [150,140, 250, 260],  [20, 220, 120, 370],
            [60, 350, 120, 300],  [60, 520, 120, 140],  [60, 520, 120, 140],
            [60, 520, 120, 140],[60, 520, 120, 140],[60, 520, 120, 140]  
        ];

        
        this.fixedDamageHitboxes = [
            { offsetX: 0, offsetY: 640, w: 200, h: 60 },   // Hitbox de gauche
            { offsetX: 400, offsetY: 640, w: 200, h: 60 }  // Hitbox de droite
        ];

        
        this.solidHitbox = { offsetX: 180, offsetY: 485, w: 230, h: 600 };
    }

    update() {
        this.tickCount++;
        if (this.tickCount > this.ticksPerFrame) {
            this.tickCount = 0;
            this.frameIndex++;
            if (this.frameIndex >= espadonImages.length) {
                this.frameIndex = 0;
            }
        }
    }

    // Ancienne méthode (gardée pour compatibilité)
    getCurrentHitbox() {
        const h = this.hitboxDefinitions[this.frameIndex] || [0,0,0,0];
        return {
            x: this.x + h[0] * scaleF,
            y: this.y + h[1] * scaleF,
            w: h[2] * scaleF,
            h: h[3] * scaleF
        };
    }

    
    getDamageHitboxes() {
        let hitboxes = [this.getCurrentHitbox()]; 
        for (let def of this.fixedDamageHitboxes) {
            hitboxes.push({
                x: this.x + def.offsetX * scaleF,
                y: this.y + def.offsetY * scaleF,
                w: def.w * scaleF,
                h: def.h * scaleF
            });
        }
        return hitboxes;
    }

    
    getSolidHitbox() {
        return {
            x: this.x + this.solidHitbox.offsetX * scaleF,
            y: this.y + this.solidHitbox.offsetY * scaleF,
            w: this.solidHitbox.w * scaleF,
            h: this.solidHitbox.h * scaleF
        };
    }

    draw(ctx, cameraX) {
        let currentImg = espadonImages[this.frameIndex];
        if (currentImg && currentImg.complete) {
            ctx.drawImage(currentImg, this.x - cameraX, this.y, this.w, this.h);
        }
    }
}

class DeadEspadonPlatform {
    constructor(espadon) {
        // On récupère la position et la taille exactes de l'Espadon mort
        this.x = espadon.x;
        this.y = espadon.y;
        this.w = espadon.w;
        this.h = espadon.h;
        this.frameIndex = espadon.frameIndex; // Fige l'animation sur l'image où il est mort
        
        // On récupère ses définitions de hitboxes fixes
        this.fixedDamageHitboxes = espadon.fixedDamageHitboxes;
        this.solidHitbox = espadon.solidHitbox;
        
        // Propriétés nécessaires pour ta logique de plateforme
        let solid = this.getSolidHitbox();
        this.collisionX = solid.x;
        this.collisionW = solid.w;
        this.surfaceY = solid.y;
        this.collisionH = solid.h;
    }

    // Recalcule la hitbox plateforme
    getSolidHitbox() {
        return {
            x: this.x + this.solidHitbox.offsetX * scaleF,
            y: this.y + this.solidHitbox.offsetY * scaleF,
            w: this.solidHitbox.w * scaleF,
            h: this.solidHitbox.h * scaleF
        };
    }

    // Recalcule les hitboxes de dégâts
    getDamageHitboxes() {
        return this.fixedDamageHitboxes.map(def => ({
            x: this.x + def.offsetX * scaleF,
            y: this.y + def.offsetY * scaleF,
            w: def.w * scaleF,
            h: def.h * scaleF
        }));
    }
    
    draw(ctx, cameraX) {
    let img = espadonImages[12];
    if (!img || !img.complete) return;

    // On dessine juste l'image, sans le masque coûteux !
    ctx.drawImage(img, this.x - cameraX, this.y, this.w, this.h);
}
}

class Poney {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 400 * scaleF; 
        this.h = 400 * scaleF;
        
        this.hp = 3;
        this.speed = 3 * scaleF; 
        
        this.frameIndex = 0;
        this.tickCount = 0;
        this.ticksPerFrame = 24; // ×2 car 1 image sur 2 chargée → durée identique

        this.facingRight = false; 
    }

    update(player) {
        this.tickCount++;
        if (this.tickCount > this.ticksPerFrame) {
            this.tickCount = 0;
            this.frameIndex++;
            if (this.frameIndex >= poneyImages.length) {
                this.frameIndex = 0;
            }
        }

        // 2. Gestion du Stun 
        if (this.stunTimer > 0) {
            this.stunTimer--;
            return; 
        }

        // 3. Logique de mouvement
        const dist = Math.abs(this.x - player.x);
        const screenWidth = canvas.width; 

        if (dist < screenWidth) {
            this.hasActivated = true;
        }

        if (this.hasActivated) {
            let prevX = this.x; 

            // Si le joueur est à gauche
            if (player.x < this.x) {
                this.x -= this.speed;
                this.facingRight = false; // Il regarde à gauche
            } 
            else {
                this.x += this.speed;
                this.facingRight = true; // Il regarde à droite
            }

            
            let hb = this.getCurrentHitbox();
            let solidBlocks = [];
            
            platforms.forEach(p => {
                if (p instanceof DeadEspadonPlatform) {
                    solidBlocks.push({ x: p.collisionX, y: p.surfaceY, w: p.collisionW, h: p.collisionH });
                }
            });
            enemies.forEach(e => {
                if (e instanceof Espadon) {
                    solidBlocks.push(e.getSolidHitbox());
                }
            });

            for (let block of solidBlocks) {
                if (rectIntersect(hb.x, hb.y, hb.w, hb.h, block.x, block.y, block.w, block.h)) {
                    this.x = prevX; // Bloqué par le mur ! On le remet à sa position précédente.
                    break; 
                }
            }
        }
    }

    stun() {
        this.stunTimer = 120; // 2 secondes de pause
    }

    getCurrentHitbox() {
        return {
            x: this.x + 100 * scaleF, 
            y: this.y + 120 * scaleF, 
            w: this.w - 200 * scaleF, 
            h: this.h - 150 * scaleF  
        };
    }

    draw(ctx, cameraX) {
        let currentImg = poneyImages[this.frameIndex];
        
        if (currentImg && currentImg.complete) {
            
            if (this.facingRight) {
                ctx.drawImage(currentImg, this.x - cameraX, this.y, this.w, this.h);

            } else {
                ctx.save(); 
                
                let centerX = (this.x - cameraX) + this.w / 2;
                let centerY = this.y + this.h / 2;
                
                ctx.translate(centerX, centerY);
                ctx.scale(-1, 1); // Miroir horizontal
                
                ctx.drawImage(currentImg, -this.w / 2, -this.h / 2, this.w, this.h);
                
                ctx.restore(); 
            }
        }

        let hb = this.getCurrentHitbox();
    }
}

class Projectile {
    constructor(x, y, direction) {
        this.x = x;
        this.y = y;
        this.radius = 10 * scaleF;
        this.speed = 15 * scaleF;
        this.direction = direction; 
        this.markedForDeletion = false; 
    }

    update() {
        this.x += this.speed * this.direction;
        
        if (this.x < 0 || this.x > mapWidth) {
            this.markedForDeletion = true;
        }
    }

    draw(ctx, cameraX) {
        ctx.beginPath();
        ctx.arc(this.x - cameraX, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'red';
        ctx.fill();
        ctx.closePath();
    }
}


// --- BOSS PHASE 1 ---
let screenShake = 0; // Intensité du tremblement
let debrisList = []; 

class Debris {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = (Math.random() * 10 + 5) * scaleF; // Taille aléatoire proportionnelle
        this.vx = (Math.random() - 0.5) * 10 * scaleF; 
        this.vy = (-Math.random() * 10 - 5) * scaleF; 
        this.gravity = 0.5 * scaleF;
        this.life = 60; 
        this.color = Math.random() > 0.5 ? "#5c4033" : "#8b5a2b";
    }

    update() {
        this.x += this.vx;
        this.vy += this.gravity;
        this.y += this.vy;
        this.life--;
    }

    draw(ctx) { 
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size); 
    }
}

// --- BOSS FINAL (PHASE 3) ---
let kraken = {
    hp1: 5, maxHp1: 5,
    hp2: 8, maxHp2: 8,
    phase: 1,           
    dead: false,
    spawnTimer: 0,      
    state: 'IDLE',      
    hAttackCount: 0,
    hAttackInterval: 100,
    hAttackTimer: 100,
    fatigueTimer: 0,
    prepFrameIndex: 0,
    prepTickCount: 0,
    prepTicksPerFrame: 18, // ×3 car 1 image sur 2 chargée désormais → durée d'animation identique
    crachatTimer: 200,  // délai avant le premier crachat
    // Effet de blocage de vision (phase 2)
    visionBlockTimer: 360, // délai avant premier jet d'encre (6s)
    // Animation du jet d'encre (remplace temporairement le kraken vertical)
    inkAnimActive: false,
    inkAnimFrame: 0,
    inkAnimTick: 0,
    inkAnimTicksPerFrame: 3,
    // Assombrissement écran après le jet d'encre (phase verticale)
    inkDarkAlpha: 0,  // 0 = transparent, 1 = noir total
    inkDarkTimer: 0,  // frames de maintien avant le fondu de sortie
};

let tentacules = []; // Tentacules verticales
let tentaculesH = []; // Tentacules horizontales

class Tentacule {
    constructor(playerX) {
        this.w = 80 * scaleF;  
        this.h = 300 * scaleF; 
        this.x = playerX - this.w / 2; 
        this.y = -this.h - 100; 
        this.speed = 30 * scaleF; 
        this.state = 'WARNING'; 
        this.warningTimer = 120; 
        this.stuckTimer = 0;    
        this.markedForDeletion = false;
        this.color = "#8b0000";
        // Animation par instance (pas de Date.now() dans draw)
        this.frameIndex = 0;
        this.tickCount = 0;
        this.ticksPerFrame = 3; // Toutes les frames chargées (valeur d'origine)
        this.animDone = false;
    }
    update(player, floorLevel) {
        // Avancer l'animation seulement quand visible et non terminée
        if ((this.state === 'FALLING' || this.state === 'STUCK') && !this.animDone) {
            this.tickCount++;
            if (this.tickCount >= this.ticksPerFrame) {
                this.tickCount = 0;
                const len = tentaculeHorizontalImages.length || 1;
                
                // On s'arrête à la dernière frame
                if (this.frameIndex < len - 1) {
                    this.frameIndex++;
                } else {
                    this.animDone = true; 
                }
            }
        }
        
        let pHitbox = player.getHitbox();
        if (this.state === 'WARNING') {
            this.warningTimer--;
            if (this.warningTimer <= 0) { this.state = 'FALLING'; this.y = -this.h; }
        } else if (this.state === 'FALLING') {
            this.y += this.speed;
            if (rectIntersect(this.x, this.y, this.w, this.h, pHitbox.x, pHitbox.y, pHitbox.w, pHitbox.h)) takeDamage(1); 

            if (this.y + this.h >= floorLevel) {
                this.y = floorLevel - this.h; 
                this.state = 'STUCK';
                
                this.stuckTimer = 90;
                
                screenShake = 20;
                // Max 4 débris par impact, et cap global à 40
                if (debrisList.length < 40) {
                    for(let i = 0; i < 4; i++) debrisList.push(new Debris(this.x + this.w/2, floorLevel));
                }
            }
        } else if (this.state === 'STUCK') {
            this.stuckTimer--;
            this.color = "#ff4444"; 
            if (rectIntersect(this.x, this.y, this.w, this.h, pHitbox.x, pHitbox.y, pHitbox.w, pHitbox.h)) takeDamage(1);
            if (this.stuckTimer <= 0) this.state = 'RETRACT';
        } else if (this.state === 'RETRACT') {
            this.markedForDeletion = true; 
        }
    }
    draw(ctx, floorLevel, cameraX) { 
        if (this.state === 'WARNING') {
            let freq = (this.warningTimer < 40) ? 5 : 15;
            if (Math.floor(this.warningTimer / freq) % 2 === 0) {
                ctx.fillStyle = "rgba(255, 0, 0, 0.4)"; 
                ctx.fillRect(this.x - cameraX, floorLevel - this.h, this.w, this.h);
                ctx.fillStyle = "red"; ctx.font = `bold ${40 * scaleF}px Arial`; ctx.textAlign = "center"; 
                ctx.fillText("!", this.x - cameraX + (this.w / 2), floorLevel - (50 * scaleF)); 
                ctx.textAlign = "left"; 
            }
            return;
        }

        // Image tentaculeHorizontal tournée 90° CCW
        // Après rotation : largeur écran = this.w, hauteur écran = 2*canvas.height
        // Moitié haute hors canvas (y : -canvas.height → 0), moitié basse visible (y : 0 → canvas.height)
        const screenCX = this.x - cameraX + this.w / 2;
        const rotatedH  = 2 * canvas.height; // hauteur visuelle après rotation
        const img = (tentaculeHorizontalImages.length > 0) ? tentaculeHorizontalImages[this.frameIndex] : null;

        if (img && img.complete && img.naturalWidth !== 0) {
            ctx.save();
            ctx.translate(screenCX, 0);  // pivot : centre X, bord haut du canvas
            ctx.rotate(-Math.PI / 2);    // 90° CCW
            // Avant rotation : largeur = rotatedH, hauteur = this.w
            ctx.drawImage(img, -rotatedH / 2, -this.w / 2, rotatedH, this.w);
            ctx.restore();
        } else {
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x - cameraX, -canvas.height, this.w, rotatedH);
        }

        // DEBUG HITBOX désactivé
    }
}

class TentaculeHorizontale {
    constructor() {
        
        this.h = 100 * scaleF; 
        
        
        this.w = mapWidth; 
        
        
        // L'image d'origine était centrée (left = 0 avec la nouvelle taille).
        // On la décale donc de this.w / 6.
        this.x = this.w / 6;
        
        let isHigh = Math.random() < 0.5 ? 0 : 1;
        this.y = isHigh
            ? (canvas.height - 4 * player.height / 5 - this.h)
            : (canvas.height - this.h - player.height / 5);
        
        this.state = 'WARNING';
        this.warningTimer = 60;
        this.attackTimer  = 30;
        this.markedForDeletion = false;

        // Animation one-shot par instance
        this.frameIndex = 0;
        this.tickCount = 0;
        this.ticksPerFrame = 1; // recalculé au début de l'attaque
        this.animDone = false;
    }

    update(player) {
        if (this.state === 'WARNING') {
            this.warningTimer--;
            if (this.warningTimer <= 0) {
                this.state = 'ATTACK';
                const nbFrames = tentaculeHorizontalImages.length || 1;
                this.ticksPerFrame = Math.max(1, Math.floor(this.attackTimer / nbFrames));
            }
        } else if (this.state === 'ATTACK') {
            if (!this.animDone) {
                this.tickCount++;
                if (this.tickCount >= this.ticksPerFrame) {
                    this.tickCount = 0;
                    const nbFrames = tentaculeHorizontalImages.length || 1;
                    if (this.frameIndex < nbFrames - 1) {
                        this.frameIndex++;
                    } else {
                        this.animDone = true;
                    }
                }
            }
            this.attackTimer--;
            let pHitbox = player.getHitbox();
            if (rectIntersect(this.x, this.y, this.w, this.h, pHitbox.x, pHitbox.y, pHitbox.w, pHitbox.h)) takeDamage(1);
            if (this.attackTimer <= 0) { this.state = 'RETRACT'; this.markedForDeletion = true; }
        }
    }

    draw(ctx, cameraX) {
        
        const drawScreenX = this.x - cameraX;

        if (this.state === 'WARNING') {
            if (Math.floor(this.warningTimer / 10) % 2 === 0) {
                ctx.fillStyle = "rgba(255, 0, 0, 0.4)";
                ctx.fillRect(drawScreenX, this.y, this.w, this.h);
            }
        } else if (this.state === 'ATTACK') {
            const img = (tentaculeHorizontalImages.length > 0) ? tentaculeHorizontalImages[this.frameIndex] : null;
            if (img && img.complete && img.naturalWidth !== 0) {
                ctx.drawImage(img, drawScreenX, this.y, this.w, this.h);
            } else {
                ctx.fillStyle = "#8b0000";
                ctx.fillRect(drawScreenX, this.y, this.w, this.h);
            }
        }
    }
}
// Liste pour stocker les balles actives
let projectiles = [];
let enemyProjectiles = [];

class ProjectileEnnemi {
    constructor(x, y, targetX, targetY) {
        this.x = x;
        this.y = y;
        this.radius = 15 * scaleF; // Rayon du crachat pour la collision
        this.speed = 8 * scaleF;   // Vitesse du crachat proportionnelle
        this.markedForDeletion = false;

        // --- MATHS : Calcul du vecteur vers le joueur ---
        const dx = targetX - x;
        const dy = targetY - y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // On normalise (on réduit à 1) et on multiplie par la vitesse
        this.vx = (dx / distance) * this.speed;
        this.vy = (dy / distance) * this.speed;

        // PV du projectile — peut être détruit par la hache du joueur
        this.hp = 1;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;

        // Supprimer si ça sort trop de l'écran (nettoyage)
        if (this.y > window.innerHeight + 100 || this.y < -100 || this.x < 0 || this.x > mapWidth) {
            this.markedForDeletion = true;
            return;
        }

        
        let hb = this.getHitbox();
        let solidBlocks = [];
        
        // On récupère toutes les plateformes et obstacles
        platforms.forEach(p => {
            if (p instanceof DeadEspadonPlatform) {
                solidBlocks.push({ x: p.collisionX, y: p.surfaceY, w: p.collisionW, h: p.collisionH });
            } else if (p instanceof Platform) {
                // Pour les plateformes classiques, on simule l'épaisseur du bloc
                let epaisseur = p.h * (1 - p.surfaceRatio);
                solidBlocks.push({ x: p.x, y: p.surfaceY, w: p.w, h: epaisseur });
            }
        });
        
        // On récupère aussi le dos des Espadons vivants
        enemies.forEach(e => {
            if (e instanceof Espadon) {
                solidBlocks.push(e.getSolidHitbox());
            }
        });

        // Vérification de l'impact
        for (let block of solidBlocks) {
            if (rectIntersect(hb.x, hb.y, hb.w, hb.h, block.x, block.y, block.w, block.h)) {
                this.markedForDeletion = true; // Le crachat s'écrase sur l'obstacle !
                break;
            }
        }
    }

    draw(ctx, cameraX) {
        if (imgCrachat && imgCrachat.complete) {
            ctx.drawImage(imgCrachat, this.x - cameraX - this.radius, this.y - this.radius, this.radius*2, this.radius*2);
        } else {
            ctx.beginPath();
            ctx.arc(this.x - cameraX, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = 'green';
            ctx.fill();
        }
    }
    
    // Pour les collisions
    getHitbox() {
        return { x: this.x - this.radius, y: this.y - this.radius, w: this.radius*2, h: this.radius*2 };
    }
}

// --- CRACHAT DU POULPE (projectile simple, sans animation) ---
class ProjectilePoulpe {
    constructor(x, y, targetX, targetY) {
        this.x = x;
        this.y = y;
        this.radius = 20 * scaleF;
        this.speed = 10 * scaleF;
        this.markedForDeletion = false;
        this.hp = 1;

        const dx = targetX - x;
        const dy = targetY - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        this.vx = (dx / dist) * this.speed;
        this.vy = (dy / dist) * this.speed;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;

        if (this.y > window.innerHeight + 100 || this.y < -100 || this.x < 0 || this.x > mapWidth) {
            this.markedForDeletion = true;
        }
    }

    draw(ctx, cameraX) {
        const sx = this.x - cameraX;
        ctx.beginPath();
        ctx.arc(sx, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#4a1a8a';
        ctx.fill();
        ctx.strokeStyle = '#9b59ff';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    getHitbox() {
        return { x: this.x - this.radius, y: this.y - this.radius, w: this.radius * 2, h: this.radius * 2 };
    }
}

class Mouette {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 300 * scaleF;
        this.h = 300 * scaleF;
        this.hp = 2;

        
        this.frameIndex = 0;
        this.tickCount = 0;
        this.ticksPerFrame = 20; // ×2 car 1 image sur 2 chargée → durée identique

        // Logique de tir
        this.cooldown = 0; 
        this.cooldownMax = 150; // Tire toutes les ~2.5 secondes
    }

    update(player) {
        // 1. ANIMATION
        this.tickCount++;
        if (this.tickCount > this.ticksPerFrame) {
            this.tickCount = 0;
            this.frameIndex++;
            if (this.frameIndex >= mouetteImages.length) {
                this.frameIndex = 0;
            }
        }

        // 2. LOGIQUE DE TIR (Seulement si visible à l'écran)
        // On calcule la position à l'écran (x - camera)
        const screenX = this.x - cameraX;
        
        // Si la mouette est dans l'écran (avec une marge de 100px)
        const isVisible = (screenX > -100 && screenX < canvas.width + 100);

        if (isVisible) {
            if (this.cooldown > 0) {
                this.cooldown--;
            } else {
                this.shoot(player);
                this.cooldown = this.cooldownMax;
            }
        }
    }

    shoot(player) {
        // Viser le centre du joueur
        const targetX = player.x + player.width / 2;
        const targetY = player.y + player.height / 2;
        
        // Le tir part du centre de la mouette (ajuste x+... y+... pour que ça sorte du bec)
        enemyProjectiles.push(new ProjectileEnnemi(
            this.x + this.w / 2, 
            this.y + this.h / 3, 
            targetX, targetY
        ));
    }

    getCurrentHitbox() {
        // Hitbox un peu plus petite que l'image pour être gentil
        return {
            x: this.x + 50 * scaleF,
            y: this.y + 50 * scaleF,
            w: this.w - 100 * scaleF,
            h: this.h - 100 * scaleF
        };
    }

    draw(ctx, cameraX) {
        let currentImg = mouetteImages[this.frameIndex];
        if (currentImg && currentImg.complete) {
            ctx.drawImage(currentImg, this.x - cameraX, this.y, this.w, this.h);
        }
    }
}

// ===================================
// --- CLASSE PLATEFORME (PHASE 2) ---
// ===================================
class Platform {
    constructor(x, surfaceFromBottom) {
        // x              : coordonnée monde fixe (entier)
        // surfaceFromBottom : distance depuis le bas du canvas jusqu'à la surface de pose (px scalés)
        this.x = x;
        this.surfaceFromBottom = surfaceFromBottom;
        this.w = 420 * scaleF;
        this.h = 420 * scaleF;
        // Le sommet de la plateforme est à ~70 % depuis le haut de l'image
        this.surfaceRatio = 0.70;
    }

    // Ces getters recalculent à chaque frame → résistants au resize
    get surfaceY() { return canvas.height - this.surfaceFromBottom; }
    get y()        { return this.surfaceY - this.h * this.surfaceRatio; }

    draw(ctx, cameraX) {
        let img = loadedImages['plateforme_2'];
        if (img && img.complete) {
            ctx.drawImage(img, this.x - cameraX, this.y, this.w, this.h);
        } else {
            // Fallback coloré si l'image n'est pas dispo
            ctx.fillStyle = '#4dd0e1';
            ctx.fillRect(this.x - cameraX, this.surfaceY - 15 * scaleF, this.w, 15 * scaleF);
        }
    }
}

let platforms = [];

// Chargement
function loadAllGameAssets(prenom) {
    gameState = 'LOADING';
    imagesToLoad = 0;
    imagesLoaded = 0;

    function checkLoad() {
        imagesLoaded++;
        if (imagesLoaded >= imagesToLoad && gameState === 'LOADING') {
            gameState = 'PLAYING';
            resetGame();
        }
    }

    // Si le total d'images de l'animation dépasse 6, on ne charge que 2 images sur 3
    // (on saute la 3ème de chaque triplet : 0,1 gardés, 2 sauté, 3,4 gardés, 5 sauté…)
    // Le paramètre `noHalf` désactive ce comportement pour une animation donnée.
    // Le paramètre `delayed` permet de décaler le démarrage du téléchargement de 1 seconde
    // (le slot dans le tableau est réservé immédiatement pour que checkLoad attende bien tout).
    // Le paramètre `step` contrôle le pas de sélection (1 = tout, 2 = 1 sur 2, 4 = 1 sur 4)
    function loadArray(array, pathTemplate, count, startIndex = 0, delayed = false, noHalf = false, step = null) {
        const totalImages = count - startIndex + 1;
        // Si step est fourni, on l'utilise directement
        // Sinon : shouldHalf comme avant (1 sur 3 pour les grandes animations)
        const shouldHalf = !noHalf && step === null && totalImages > 6;
        const effectiveStep = step || 1;

        for (let i = startIndex; i <= count; i++) {
            // Mode step explicite : on ne garde qu'une image sur `effectiveStep`
            if (step !== null && (i - startIndex) % effectiveStep !== 0) continue;
            // Mode shouldHalf : saute 1 image sur 3
            if (shouldHalf && (i - startIndex) % 3 === 2) continue;

            imagesToLoad++;
            const img = new Image();
            img.onload = checkLoad;
            img.onerror = checkLoad;
            array.push(img);

            let num = i.toString().padStart(2, '0');
            const src = pathTemplate
                .replace('{char}', prenom)
                .replace('{num}', num)
                .replace('{i}', i);

            if (delayed) {
                setTimeout(() => { img.src = src; }, 1000);
            } else {
                img.src = src;
            }
        }
    }

    // --- LOT 1 : animations du joueur — TOUTES les frames, chargement immédiat ---
    loadArray(playerImages,        `images/jv/perso/{char}idle_00{num}.png`,           23, 0,  false, true);
    loadArray(playerImagesJumping, `images/jv/persojump/{char}air_00{num}.png`,        12, 0,  false, true);
    loadArray(playerImagesRunning, `images/jv/persorun/{char}run_00{num}.png`,         19, 0,  false, true);
    loadArray(playerImagesHache,   `images/jv/persohache/{char}couphache_00{num}.png`, 19, 5,  false, true);
    loadArray(playerImagesCrouch,  `images/jv/persocrouch/{char}crouch_00{num}.png`,   12, 0,  false, true);

    // --- LOT 2 : ennemis + boss — chargement décalé de 1 seconde ---
    loadArray(mouetteImages,              `images/jv/phase2/mouette/mouette{i}.png`,                                                    6,  1, true, false, 2);
    loadArray(espadonImages,              `images/jv/phase2/espadon+plateforme/{i} 2.png`,                                             13,  1, true, true);
    loadArray(poneyImages,                `images/jv/phase2/poney/poney{i}.png`,                                                        9,  1, true, false, 2);
    loadArray(crachatImages,              `images/jv/phase3/poulpe/Crachat/crachat/crachat_00{num}.png`,                               43,  0, true, false, 4);
    loadArray(krakenPrepVerticaleImages,  `images/jv/phase3/poulpe/AttaqueVerticale/prepVerticale_00{num}.png`,                        20,  0, true, false, 2);
    loadArray(krakenPrepHorizontaleImages,`images/jv/phase3/poulpe/AttaqueHorizontale/prepAttaqueHorizontale_00{num}.png`,             14,  0, true, false, 2);
    // tentaculeHorizontal — TOUTES les frames (utilise aussi pour la tentacule verticale)
    loadArray(tentaculeHorizontalImages,  `images/jv/phase3/poulpe/TentaculeHorizontal/tentaculeHorizontal_00{num}.png`,               9,  0, true, true);
}   
// --- CREATION DES ENNEMIS ---
// Définition des hauteurs pour calcul (doit correspondre au this.h dans les classes)
const H_ESPADON = 400;
const H_PONEY = 400;
const H_MOUETTE = 300; 

// Le niveau du sol (bas de l'écran)
const SOL_Y = window.innerHeight; 

let enemies = []; // On commence vide

// Fonction pour lancer une phase spécifique
function initPhase(phase) {
    currentPhase = phase;
    enemyProjectiles = [];  
    enemies = [];
    platforms = [];
    
    if (phase === 2) {
        playBGM('musique/JVMusiquePlage.mp3');
        if (bgImage && bgImage.complete && bgImage.naturalHeight !== 0) {
            const scale = canvas.height / bgImage.naturalHeight;
            mapWidth = bgImage.naturalWidth * scale;
        } else {
            mapWidth = 5500 * scaleF;
        }
        mapHeight = canvas.height;
        player.x = 50 * scaleF;
        player.y = canvas.height - player.height;

        enemies = [];
        enemies.push(new Espadon(500, canvas.height-710*scaleF));
        enemies.push(new Mouette(1700, 100 * scaleF));
        enemies.push(new Mouette(2000, 100 * scaleF));
        enemies.push(new Poney(2400, canvas.height - 400 * scaleF));
        enemies.push(new Espadon(3000,canvas.height-710*scaleF ));
        enemies.push(new Poney(4200, canvas.height - 400 * scaleF));
        enemies.push(new Poney(4800, canvas.height - 400 * scaleF));
        enemies.push(new Mouette(5500, 100*scaleF));
        enemies.push(new Espadon(5500, canvas.height - 710 * scaleF));
    }
    else if (phase === 3) {
        playBGM('musique/JVMusiquelle.mp3');
        // Calcul de la largeur de la map basée sur le plan le plus large (ciel)
        const cielImg = loadedImages['ciel'];
        if (cielImg && cielImg.complete && cielImg.naturalHeight !== 0) {
            const scale = canvas.height / cielImg.naturalHeight;
            mapWidth = cielImg.naturalWidth * scale;
            mapHeight = canvas.height;
        } else {
            mapWidth = 4000 * scaleF;
            mapHeight = canvas.height;
        }
        
        player.x = 50 * scaleF; 
        player.y = canvas.height - player.height;
        
        // Reset Boss
        kraken.hp1 = kraken.maxHp1; kraken.hp2 = kraken.maxHp2;
        kraken.phase = 1; kraken.dead = false;
        kraken.spawnTimer = 0; kraken.state = 'IDLE';
        kraken.prepFrameIndex = 0; kraken.prepTickCount = 0;
        kraken.crachatTimer = 200;
        kraken.visionBlockTimer = 360;
        kraken.inkAnimActive = false; kraken.inkAnimFrame = 0; kraken.inkAnimTick = 0;
        kraken.inkDarkAlpha = 0; kraken.inkDarkTimer = 0;
        tentacules = []; tentaculesH = []; debrisList = [];
    }
}

// --- PHYSIQUE DU JOUEUR & HITBOX DYNAMIQUE ---
let player = {
    // Les valeurs de base
    baseW: 330, baseH: 290, baseSpeed: 7  , baseJump: -17, baseGravity: 0.6,
    x: 100, y: 0, width: 330, height: 290, speed: 6,
    dy: 0, gravity: 0.4, jumpPower: -10, grounded: false,
    
    maxHealth: 5, health: 5, invincible: false, invtimer: 0, blink: false,

    facingRight: true, dashCooldown: 0, isDashing: false, dashTimer: 0,

    isCrouching: false,
    
    isAttacking: false,
    attackFrameIndex: 0,
    attackTickCount: 0,
    attackTicksPerFrame: 1, 
    enemiesHitThisAttack: [], // Pour ne toucher un ennemi qu'UNE seule fois par coup de hache

    // Tes 20 hitboxes pour les 20 images de l'attaque.
    // Format : [offsetX, offsetY, largeur, hauteur]
    
    hacheHitboxes: [
     
        [0,0,0,0], [0,0,0,0], [0,0,0,0], [0,0,0,0], [0,0,0,0], // Images 5 à 9
        // Mettons que l'impact commence à l'image 10 :
        [200, 50, 150, 170], [200, 50, 150, 170], [200, 50, 150, 170], [0,0,0,0], [0,0,0,0], // Images 10 à 14
        [0,0,0,0], [0,0,0,0], [0,0,0,0], [0,0,0,0], [0,0,0,0]  // Images 15 à 19
    ],

    getHitbox: function() {
        // Ratios basés sur l'image native (330x290)
        if (this.isCrouching) {
            
            let marginLeft = this.width * (100 / 330); 
            let marginTop = this.height * (150 / 290); // Plus bas
            let w = this.width * (110 / 330);
            let h = this.height * (140 / 290);         // Moins haut
            return { x: this.x + marginLeft, y: this.y + marginTop, w: w, h: h };
        } else {
            // HITBOX DEBOUT NORMALE
            let marginLeft = this.width * (100 / 330);
            let marginTop = this.height * (60 / 290);
            let w = this.width * (110 / 330);
            let h = this.height * (230 / 290);
            return { x: this.x + marginLeft, y: this.y + marginTop, w: w, h: h };
        }
    },

    getHacheHitbox: function() {
        let h = this.hacheHitboxes[this.attackFrameIndex] || [0,0,0,0];
        if (h[2] === 0 && h[3] === 0) return null;

        // Ratios pour la hache
        let relX = this.width * (h[0] / 330);
        let relY = this.height * (h[1] / 290);
        let relW = this.width * (h[2] / 330);
        let relH = this.height * (h[3] / 290);

        let hx = this.facingRight ? 
                (this.x + relX) : 
                (this.x + this.width - relX - relW);

        return { x: hx, y: this.y + relY, w: relW, h: relH };
    }
};

// --- SYSTÈME DE TOUCHES  ---
let keys = {};
let keyMap = {
    up: ' ', left: 'q', right: 'd', down: 's', dash: 'e', menu: 'tab', attack: 'click' // <- 'down' ajouté
};
let actionToBind = null; 

const menuButtons = {
    play: { x: 0, y: 0, w: 300, h: 60, text: "COMMENCER LE RAID" },
    settings: { x: 0, y: 0, w: 300, h: 60, text: "OPTIONS (TOUCHES)" },
    exit: { x: 0, y: 0, w: 300, h: 60, text: "RETOUR AU VILLAGE" }
};

const gameOverButtons = {
    backToMenu: { x: 0, y: 0, w: 320, h: 60, text: "MENU PRINCIPAL" },
    exitGame:   { x: 0, y: 0, w: 320, h: 60, text: "RETOUR AU VILLAGE" } 
};

const backButton = { x: 20, y: 20, w: 150, h: 40, text: "RETOUR" };

const victoryButtons = {
    exit: { x: 0, y: 0, w: 300, h: 60, text: "RETOUR AU VILLAGE" }
};

// --- 3. GESTION DU PLEIN ÉCRAN ET LANCEMENT  ---
if (startBtn) {
    startBtn.addEventListener('click', () => {
        if (gameFrame.requestFullscreen) {
            gameFrame.requestFullscreen();
        }
        sliderContent.style.display = 'none';
        canvas.style.display = 'block';
        startBtn.style.visibility = 'hidden';
        
        gameRunning = true; 
        gameStartTime = Date.now();
        isTimerRunning = true;
        gameState = 'MENU'; 
        if (_audioCtx.state === 'suspended') _audioCtx.resume();
        resize();
        initPhase(3);
        requestAnimationFrame(gameLoop);
    });
}

function resize() {
    if (!canvas) return;
    canvas.width = gameFrame.clientWidth;
    canvas.height = gameFrame.clientHeight;
    scaleF = canvas.height / BASE_HEIGHT;

    if (currentPhase === 2 && bgImage && bgImage.complete && bgImage.naturalHeight !== 0) {
        const scale = canvas.height / bgImage.naturalHeight;
        mapWidth = bgImage.naturalWidth * scale;
        mapHeight = canvas.height;
    } else if (currentPhase === 3) {
        const cielImg = loadedImages['ciel'];
        if (cielImg && cielImg.complete && cielImg.naturalHeight !== 0) {
            const scale = canvas.height / cielImg.naturalHeight;
            mapWidth = cielImg.naturalWidth * scale;
            mapHeight = canvas.height;
        } else {
            mapWidth = 4000 * scaleF;
            mapHeight = canvas.height;
        }
    } else {
            mapWidth = canvas.width;
    }

    // Le perso fait 1/5ème de la largeur de l'écran
    player.height = canvas.width / 5;
    let imageRatio = 330 / 290; // Largeur / Hauteur d'origine de ton sprite
    player.width = player.height * imageRatio;
    player.speed = player.baseSpeed * scaleF;
    player.jumpPower = player.baseJump * scaleF;
    player.gravity = player.baseGravity * scaleF;

    // Le reste ne change pas (centrage des boutons)
    const centerX = canvas.width / 2 - 150; 
    menuButtons.play.x = centerX; menuButtons.play.y = canvas.height / 2 - 100;
    menuButtons.settings.x = centerX; menuButtons.settings.y = canvas.height / 2 - 20;
    menuButtons.exit.x = centerX; menuButtons.exit.y = canvas.height / 2 + 60;
    
    const goCenterX = canvas.width / 2 - 160; 
    gameOverButtons.backToMenu.x = goCenterX; 
    gameOverButtons.backToMenu.y = canvas.height / 2 + 20;
    gameOverButtons.exitGame.x = goCenterX; 
    gameOverButtons.exitGame.y = canvas.height / 2 + 100;

    // Centrage du bouton de victoire
    victoryButtons.exit.x = canvas.width / 2 - 160;
    victoryButtons.exit.y = canvas.height / 2 + 100;
    victoryButtons.exit.text = "RETOUR AU VILLAGE"; // Uniformisation du texte

}

window.addEventListener('resize', resize);

// --- 4. ENTRÉES CLAVIER  ---
window.addEventListener('keydown', (e) => {
    if (gameState === 'OPTIONS' && actionToBind) {
        e.preventDefault();
        if (e.key === "Escape") { actionToBind = null; return; }
        keyMap[actionToBind] = e.key.toLowerCase();
        actionToBind = null;
        return;
    }

    const key = e.key.toLowerCase();
    keys[key] = true;

    if (key === keyMap.menu) {
        e.preventDefault(); 
        if (gameRunning) {
            if (gameState === 'PLAYING') {
                gameState = 'MENU';
                menuButtons.play.text = "REPRENDRE LE RAID";
                pauseStartTime = Date.now(); // Lancement du chrono de pause
            } else if (gameState === 'MENU' || gameState === 'OPTIONS') {
                gameState = 'PLAYING';
                actionToBind = null;
                // Ajout du temps passé en pause
                if (pauseStartTime > 0) {
                    totalPausedTime += Date.now() - pauseStartTime;
                    pauseStartTime = 0;
                }
            }
        }
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
});

// --- 5. CLICS SOURIS  ---
canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (gameState === 'PLAYING' && player.grounded && !player.isCrouching) {
        
        
        if (!player.isAttacking) {
            player.isAttacking = true;
            player.attackFrameIndex = 0;
            player.attackTickCount = 0;
            player.enemiesHitThisAttack = []; // On vide la liste des ennemis frappés
        }
        return;
    }

    if (gameState === 'MENU') {
        if (isInside(mouseX, mouseY, menuButtons.play)) {
            
            if (gameRunning && menuButtons.play.text === "REPRENDRE LE RAID") {
                gameState = 'PLAYING';
                if (pauseStartTime > 0) {
                    totalPausedTime += (Date.now() - pauseStartTime);
                    pauseStartTime = 0;
                }
            } else {
                gameState = 'CHAR_SELECT';
                charSelectButtons.cedrick.x = canvas.width / 4 - 100;
                charSelectButtons.cedrick.y = canvas.height - 150;
                charSelectButtons.quentin.x = (canvas.width / 4) * 3 - 100;
                charSelectButtons.quentin.y = canvas.height - 150;
            }
        }
        if (isInside(mouseX, mouseY, menuButtons.settings)) gameState = 'OPTIONS';
        if (isInside(mouseX, mouseY, menuButtons.exit)) location.reload(); 
    }
    else if (gameState === 'OPTIONS') {
        if (isInside(mouseX, mouseY, backButton)) {
            gameState = 'MENU';
            actionToBind = null;
        }
        const startY = 150;
        const actions = [
            { id: 'up', label: 'SAUTER' }, { id: 'left', label: 'GAUCHE' },
            { id: 'right', label: 'DROITE' },
            { id: 'dash', label: 'DASH' }, { id: 'menu', label: 'MENU / QUITTER' }
        ];
        actions.forEach((act, index) => {
            let visualIndex = index;
            if (act.id === 'menu') visualIndex = 6; 
            let yPos = startY + visualIndex * 50;
            if (mouseX > canvas.width/2 - 200 && mouseX < canvas.width/2 + 200 && 
                mouseY > yPos - 25 && mouseY < yPos + 15) {
                    actionToBind = act.id;
            }
        });
    }
    else if (gameState === 'GAMEOVER') {
        if (isInside(mouseX, mouseY, gameOverButtons.backToMenu)) {
            resetGame();
            gameState = 'MENU';
        }
        if (isInside(mouseX, mouseY, gameOverButtons.exitGame)) {
            location.reload(); 
        }
    } else if (gameState === 'VICTORY') {
        if (isInside(mouseX, mouseY, victoryButtons.exit)) {
            location.reload(); // Recharge la page pour retourner au menu / village
        }
    } else if (gameState === 'CHAR_SELECT') {
        if (isInside(mouseX, mouseY, charSelectButtons.cedrick)) {
            selectedChar = "Cédrick";
            loadAllGameAssets("cedrick");
        }
        if (isInside(mouseX, mouseY, charSelectButtons.quentin)) {
            selectedChar = "Quentin";
            loadAllGameAssets("quentin");
        }
    }
});

function isInside(x, y, btn) {
    return x > btn.x && x < btn.x + btn.w && y > btn.y && y < btn.y + btn.h;
}

// --- 5.5 GESTION DÉGÂTS  ---
function takeDamage(amount) {
    // Si on est invincible OU EN TRAIN DE DASHER, on ne prend pas de dégâts
    if (player.invincible || player.isDashing) return; 

    player.health -= amount;
    
    // ... le reste de la fonction ne change pas ...
    if (player.health <= 0) {
        player.health = 0;
        gameState = 'GAMEOVER'; 
    } else {
        player.invincible = true;
        player.invtimer = 120; 
        player.dy = -4 * scaleF; 
        player.x -= 20 * scaleF; 
    }
}

function resetGame() {
    player.health = player.maxHealth;
    player.x = 50 * scaleF;
    player.invincible = false;
    player.blink = false;
    player.isAttacking = false;
    
    // Indispensable pour éviter l'écran noir
    isTransitioning = false;
    transitionAlpha = 0;
    
    // Redémarre en phase 2
    initPhase(2); 
    gameState = 'PLAYING';
    
    
    gameStartTime = Date.now();
    isTimerRunning = true;
    pauseStartTime = 0;
    totalPausedTime = 0;

}

// --- 6. LOGIQUE DE JEU (UPDATE) ---
function triggerTransition(nextPhase) {
    if (isTransitioning) return;
    isTransitioning = true;
    nextPhaseToLoad = nextPhase;
}

function updateTransition() {
    // Si on est en transition, on augmente l'opacité
    if (isTransitioning) {
        transitionAlpha += 0.02; // Vitesse du fondu
        if (transitionAlpha >= 1) {
            transitionAlpha = 1;
            
            // L'écran est totalement noir, on change la phase !
            initPhase(nextPhaseToLoad);
            
            
            isTransitioning = false; 
        }
    } else {
        // Si on n'est plus en transition mais que l'écran est encore un peu noir
        if (transitionAlpha > 0) {
            transitionAlpha -= 0.02;
            if (transitionAlpha < 0) transitionAlpha = 0;
        }
    }
}

function update() {
    updateTransition();
    if (transitionAlpha > 0.5) return; 

    if (gameState === 'PLAYING') {
        
        // ==========================================
        // --- LOGIQUE SPÉCIALE PHASE 1 : KRAKEN ---
        // ==========================================

        if (screenShake > 0) {
            screenShake *= 0.9; // Diminue progressivement (90% de la frame précédente)
            if (screenShake < 0.5) screenShake = 0;
        }

        // --- MISE À JOUR DES DÉBRIS ---
        debrisList.forEach(d => d.update());
        debrisList = debrisList.filter(d => d.life > 0);

        if (currentPhase === 3) {
            // 1. GESTION CAMÉRA (Défilement comme bgImages)
            cameraX = player.x - canvas.width / 3; 
            if (cameraX < 0) cameraX = 0;
            if (cameraX > mapWidth - canvas.width) cameraX = mapWidth - canvas.width;

            // 2. LIMITE : Le joueur ne peut pas dépasser la moitié de la map
            if (player.x + player.width > mapWidth / 2) {
                player.x = (mapWidth / 2) - player.width;
            }

            if (!kraken.dead) {
                // Animation de la pose du kraken (cycled indépendamment des attaques)
                kraken.prepTickCount++;
                if (kraken.prepTickCount > kraken.prepTicksPerFrame) {
                    kraken.prepTickCount = 0;
                    let animLen = (kraken.phase === 1 ? krakenPrepHorizontaleImages.length : krakenPrepVerticaleImages.length) || 1;
                    kraken.prepFrameIndex = (kraken.prepFrameIndex + 1) % animLen;
                }

                // --- PHASE 1 : Attaques horizontales (pas de tache noire) ---
                if (kraken.phase === 1) {
                    if (kraken.state !== 'FATIGUE') {
                        kraken.hAttackTimer--;
                        if (kraken.hAttackTimer <= 0) {
                            tentaculesH.push(new TentaculeHorizontale());
                            kraken.hAttackCount++;
                            kraken.hAttackTimer = 110;
                            if (kraken.hAttackCount >= 3) {
                                kraken.state = 'FATIGUE';
                                kraken.fatigueTimer = 180;
                                kraken.hAttackCount = 0;
                            }
                        }
                    } else {
                        kraken.fatigueTimer--;
                        if (kraken.fatigueTimer <= 0) {
                            kraken.state = 'IDLE';
                            kraken.hAttackTimer = 60;
                        }
                    }
                }
                // --- PHASE 2 : Tentacules verticales + tache d'encre ---
                else if (kraken.phase === 2) {
                    kraken.spawnTimer++;
                    if (kraken.spawnTimer >= 180) { 
                        tentacules.push(new Tentacule(player.x + player.width/2)); 
                        kraken.spawnTimer = 0;
                    }
                    // Effet de blocage de vision toutes les 6 secondes
                    if (kraken.inkAnimActive) {
                        // Animation du jet d'encre : joue UNE FOIS, puis reprend le kraken
                        kraken.inkAnimTick++;
                        if (kraken.inkAnimTick >= kraken.inkAnimTicksPerFrame) {
                            kraken.inkAnimTick = 0;
                            if (crachatImages.length > 0 && kraken.inkAnimFrame < crachatImages.length - 1) {
                                kraken.inkAnimFrame++;
                            } else {
                                // Animation terminée → assombrissement écran + reset timer
                                kraken.inkAnimActive = false;
                                kraken.inkAnimFrame = 0;
                                kraken.visionBlockTimer = 360;
                                kraken.inkDarkAlpha = 0.88;  // encre quasi-opaque
                                kraken.inkDarkTimer = 180;   // 3 secondes de maintien (60fps)
                            }
                        }
                    } else {
                        kraken.visionBlockTimer--;
                        if (kraken.visionBlockTimer <= 0) {
                            // Déclenche l'animation d'encre (remplace temporairement le kraken vertical)
                            kraken.inkAnimActive = true;
                            kraken.inkAnimFrame = 0;
                            kraken.inkAnimTick = 0;
                        }
                    }

                    // Gestion du fondu de sortie de l'assombrissement
                    if (kraken.inkDarkAlpha > 0) {
                        if (kraken.inkDarkTimer > 0) {
                            kraken.inkDarkTimer--;
                        } else {
                            // Fondu progressif jusqu'à 0 (~2 secondes à 0.007/frame)
                            kraken.inkDarkAlpha -= 0.007;
                            if (kraken.inkDarkAlpha < 0) kraken.inkDarkAlpha = 0;
                        }
                    }
                }

                // --- CRACHAT DU POULPE (phase 2 uniquement) ---
                if (kraken.phase === 2) {
                    kraken.crachatTimer--;
                    if (kraken.crachatTimer <= 0) {
                        const krakenCenterX = mapWidth / 2 - 250 * scaleF;
                        const krakenCenterY = canvas.height / 2;
                        if (crachatImages.length > 0) {
                            enemyProjectiles.push(new ProjectilePoulpe(
                                krakenCenterX,
                                krakenCenterY,
                                player.x + player.width / 2,
                                player.y + player.height / 2
                            ));
                        } else {
                            enemyProjectiles.push(new ProjectileEnnemi(
                                krakenCenterX,
                                krakenCenterY,
                                player.x + player.width / 2,
                                player.y + player.height / 2
                            ));
                        }
                        kraken.crachatTimer = 120;
                    }
                }

                tentacules.forEach(t => t.update(player, canvas.height));
                tentaculesH.forEach(t => t.update(player));
                tentacules = tentacules.filter(t => !t.markedForDeletion);
                tentaculesH = tentaculesH.filter(t => !t.markedForDeletion);
            }
        }


        // --- LOGIQUE PHASE 2 ---
        if (currentPhase === 2) {
            if (player.x + player.width >= mapWidth) {
                triggerTransition(3);
                return;
            }
        }


        // --- DÉPLACEMENTS & DASH ---
        let prevX = player.x;   

        // 1. Mise à jour de la direction (pour savoir où dasher)
        if (keys[keyMap.left]) {
            player.x -= player.speed * dt; // On multiplie par dt
            player.facingRight = false; 
        }
        if (keys[keyMap.right]) {
            player.x += player.speed * dt; // On multiplie par dt
            player.facingRight = true;  
        }

        // 2. Gestion du Cooldown (On décrémente chaque frame)
        if (player.dashCooldown > 0) {
            player.dashCooldown--;
        }
        
        // 3. Gestion de la durée d'invincibilité du Dash
        if (player.dashTimer > 0) {
            player.dashTimer--;
            if (player.dashTimer <= 0) {
                player.isDashing = false; // Fin de l'invincibilité du dash
            }
        }

        // 4. ACTION : DASH (Téléportation)
        // Si on appuie sur Dash (E) ET que le cooldown est fini
        if (keys[keyMap.dash] && player.dashCooldown <= 0) {
            const dashDistance = 250 * scaleF; // Distance du TP proportionnelle
            
            // On calcule la direction (1 pour droite, -1 pour gauche)
            const dir = player.facingRight ? 1 : -1;
            
            // TP !
            player.x += dashDistance * dir;
            
            // Activation de l'invincibilité courte
            player.isDashing = true;
            player.dashTimer = 15; // On reste invincible 1/4 de seconde après le TP
            
            // Reset du Cooldown : 3 secondes * 60 images/sec = 180 frames
            player.dashCooldown = 180; 
        }
        // Le joueur s'accroupit s'il touche le sol et appuie sur Bas
        player.isCrouching = keys[keyMap.down] && player.grounded && !player.isAttacking;
        
        if (currentPhase === 2) {
            let phb = player.getHitbox();
            let solidBlocks = [];
            
            // On récupère les blocs de glace morts
            platforms.forEach(p => {
                if (p instanceof DeadEspadonPlatform) {
                    solidBlocks.push({ x: p.collisionX, y: p.surfaceY, w: p.collisionW, h: p.collisionH });
                }
            });
            // On récupère aussi le dos des Espadons vivants
            enemies.forEach(e => {
                if (e instanceof Espadon) {
                    solidBlocks.push(e.getSolidHitbox());
                }
            });

            // On vérifie si le joueur rentre dans un des blocs
            for (let block of solidBlocks) {
                if (rectIntersect(phb.x, phb.y, phb.w, phb.h, block.x, block.y, block.w, block.h)) {
                    player.x = prevX; // Bloqué ! On le remet où il était avant
                    
                    if (player.isDashing) {
                        player.isDashing = false; // Stoppe le dash direct contre le mur
                        player.dashTimer = 0;
                    }
                    break;
                }
            }
        }

        // Saut 
        if (keys[keyMap.up] && player.grounded) {
            player.dy = player.jumpPower;
            player.grounded = false;
        }

        // --- INVINCIBILITÉ ---
        if (player.invincible) {
            player.invtimer--;
            if (player.invtimer % 10 === 0) player.blink = !player.blink;
            if (player.invtimer <= 0) {
                player.invincible = false;
                player.blink = false;
            }
        }

        // ==========================================
        // --- LOGIQUE D'ATTAQUE (HACHE) ET DÉGÂTS ---
        // ==========================================
        if (player.isAttacking) {
            player.attackTickCount++;
            
            // Fait avancer l'animation
            if (player.attackTickCount > player.attackTicksPerFrame) {
                player.attackTickCount = 0;
                player.attackFrameIndex++;

                // Si on a fini les 20 images, l'attaque est terminée
                if (player.attackFrameIndex >= playerImagesHache.length) {
                    player.isAttacking = false;
                }
            }

            // GESTION DES COUPS PORTÉS
            let hHitbox = player.getHacheHitbox();
            
            if (hHitbox && player.isAttacking) {
                
                // 1. Dégâts aux ennemis classiques (Phase 2)
                enemies.forEach(enemy => {
                    // Si on a déjà blessé cet ennemi pendant ce coup, on l'ignore
                    if (player.enemiesHitThisAttack.includes(enemy)) return;

                    let eHitbox = enemy.getCurrentHitbox();
                    if (rectIntersect(hHitbox.x, hHitbox.y, hHitbox.w, hHitbox.h, eHitbox.x, eHitbox.y, eHitbox.w, eHitbox.h)) {
                        enemy.hp -= 1; // On lui enlève 1 PV
                        
                        
                        if (!(enemy instanceof Espadon)) {
                            enemy.x += (player.facingRight ? 15 * scaleF : -15 * scaleF);
                        }
                        
                        player.enemiesHitThisAttack.push(enemy); // On le note comme frappé
                    }
                });

                // 2. Dégâts aux projectiles ennemis — on peut les détruire à la hache !
                enemyProjectiles.forEach(proj => {
                    if (player.enemiesHitThisAttack.includes(proj)) return;
                    let pHitbox = proj.getHitbox();
                    if (rectIntersect(hHitbox.x, hHitbox.y, hHitbox.w, hHitbox.h,
                                      pHitbox.x, pHitbox.y, pHitbox.w, pHitbox.h)) {
                        proj.hp -= 1;
                        if (proj.hp <= 0) proj.markedForDeletion = true;
                        player.enemiesHitThisAttack.push(proj);
                    }
                });

                if (currentPhase === 3 && !kraken.dead) {
                let hHitbox = player.getHacheHitbox();
                if (hHitbox) {
                    // Phase 1 (horizontal) : on frappe le kraken quand il est fatigué
                    if (!player.enemiesHitThisAttack.includes(kraken)) {
                        let bossHitbox = { 
                            x: mapWidth / 2 - 120 * scaleF, 
                            y: canvas.height - 400 * scaleF, 
                            w: mapWidth / 2,
                            h: 400 * scaleF 
                        };
                        if (rectIntersect(hHitbox.x, hHitbox.y, hHitbox.w, hHitbox.h, bossHitbox.x, bossHitbox.y, bossHitbox.w, bossHitbox.h)) {
                            if (kraken.phase === 1) {
                                kraken.hp1--;
                                player.enemiesHitThisAttack.push(kraken);
                                if (kraken.hp1 <= 0) { kraken.phase = 2; kraken.prepFrameIndex = 0; }
                            }
                        }
                    }
                    // Phase 2 (verticale) : on frappe les tentacules coincées
                    if (kraken.phase === 2) {
                        tentacules.forEach(t => {
                            if (t.state === 'STUCK' && !player.enemiesHitThisAttack.includes(t)) {
                                if (rectIntersect(hHitbox.x, hHitbox.y, hHitbox.w, hHitbox.h, t.x, t.y, t.w, t.h)) {
                                    kraken.hp2--;
                                    player.enemiesHitThisAttack.push(t);
                                    if (kraken.hp2 <= 0) { 
                                        kraken.dead = true;
                                        kraken.inkAnimActive = false;
                                        stopBGM();
                                        gameState = 'VICTORY';
                                        isTimerRunning = false; 
                                        finalGameTime = Date.now() - gameStartTime;
                                    }
                                }
                            }
                        });
                    }
                }
            }
            }
        }

        // --- GESTION DES ENNEMIS & COLLISIONS ---
        let playerHitbox = player.getHitbox();

        enemies.forEach(enemy => {
            // Animation et IA
            enemy.update(player); 

            
            let hitboxesToCheck = [];
            if (typeof enemy.getDamageHitboxes === 'function') {
                hitboxesToCheck = enemy.getDamageHitboxes(); // Pour l'Espadon
            } else {
                hitboxesToCheck = [enemy.getCurrentHitbox()]; // Pour Poney, Mouette...
            }

            
            let isHit = false;
            for (let hb of hitboxesToCheck) {
                if (rectIntersect(playerHitbox.x, playerHitbox.y, playerHitbox.w, playerHitbox.h, hb.x, hb.y, hb.w, hb.h)) {
                    isHit = true;
                    break;
                }
            }

            if (isHit) {
                // On inflige les dégâts
                takeDamage(1);

                // Si l'ennemi est un Poney, on le fige !
                if (typeof enemy.stun === 'function') {
                    enemy.stun();
                }
            }
        });

        // --- GESTION DES PROJECTILES ENNEMIS ---
        enemyProjectiles.forEach(proj => {
            proj.update();
            
            // Vérification collision avec le joueur
            // On utilise la hitbox du joueur
            let phb = player.getHitbox(); 
            // On utilise la hitbox du projectile
            let khb = proj.getHitbox();   
            
            if (rectIntersect(phb.x, phb.y, phb.w, phb.h, khb.x, khb.y, khb.w, khb.h)) {
                // Le joueur est touché !
                takeDamage(1); 
                proj.markedForDeletion = true; // Le crachat disparaît
            }
        });

        // --- DÉGÂTS DES CADAVRES D'ESPADONS ---
        platforms.forEach(plat => {
            if (plat instanceof DeadEspadonPlatform) {
                let dmgHitboxes = plat.getDamageHitboxes();
                for (let hb of dmgHitboxes) {
                    if (rectIntersect(playerHitbox.x, playerHitbox.y, playerHitbox.w, playerHitbox.h, hb.x, hb.y, hb.w, hb.h)) {
                        takeDamage(1);
                        break; // Le joueur prend 1 dégât, pas besoin de vérifier les autres hitboxes
                    }
                }
            }
        });
        // Nettoyage des projectiles disparus
        enemyProjectiles = enemyProjectiles.filter(p => !p.markedForDeletion);

        // Nettoyage des ennemis et transformation en plateforme
        enemies = enemies.filter(e => {
            if (e.hp <= 0) {
                // Si l'ennemi mort est un Espadon, il devient une plateforme !
                if (e instanceof Espadon) {
                    // Si le joueur n'a pas tous ses cœurs, on lui en redonne un
                    if (player.health < player.maxHealth) {
                        player.health++;
                    }
                    platforms.push(new DeadEspadonPlatform(e)); 
                } else if (e instanceof Poney) {
                    // Si le joueur n'a pas tous ses cœurs, on lui en redonne un
                    if (player.health < player.maxHealth) {
                        player.health++;
                    }
                }
                return false; // L'ennemi disparaît
            }
            return true; // L'ennemi reste en vie
        });


        // ==========================================
        // --- PHYSIQUE MODIFIÉE (POUR LE BATEAU) ---
        // ==========================================
        
        // En phase 2, reset grounded avant la physique
        if (currentPhase === 2) player.grounded = false;

        player.dy += player.gravity;
        player.y += player.dy;

        // GESTION DU SOL (Différent selon la phase !)
        // Décalage du sol (50 pixels au-dessus du bas de l'écran)
        const groundOffset = 50 * scaleF; 
        let groundLevel = canvas.height - groundOffset; 

        if (currentPhase === 1) {
            groundLevel = canvas.height - (canvas.height / 3);
        }

        if (player.y + player.height > groundLevel) {
            player.y = groundLevel - player.height;
            player.dy = 0;
            player.grounded = true;
        }

        // --- COLLISION PLATEFORMES (Phase 2) ---
        if (currentPhase === 2) {
            let walkableSurfaces = [...platforms];
            
            enemies.forEach(e => {
                if (typeof e.getSolidHitbox === 'function') {
                    let solid = e.getSolidHitbox();
                    walkableSurfaces.push({
                        collisionX: solid.x,
                        collisionW: solid.w,
                        surfaceY: solid.y, 
                        collisionH: solid.h // <-- Ajout de la hauteur ici aussi
                    });
                }
            });

            walkableSurfaces.forEach(plat => {
                const phb = player.getHitbox();
                const pX = plat.collisionX !== undefined ? plat.collisionX : plat.x;
                const pW = plat.collisionW !== undefined ? plat.collisionW : plat.w;
                
                const hOverlap = phb.x + phb.w > pX && phb.x < pX + pW;
                if (!hOverlap) return;

                const sFace = plat.surfaceY;
                const sBottom = plat.surfaceY + (plat.collisionH || 20 * scaleF); // Le dessous du bloc

                
                if (player.dy < 0) {
                    if (plat.collisionH) { // Uniquement les gros blocs (Glace/Espadon)
                        let phbTop = phb.y;
                        let prevPhbTop = phb.y - player.dy;
                        if (phbTop <= sBottom && prevPhbTop > sBottom) {
                            player.y = sBottom - (phb.y - player.y); // Repousse vers le bas
                            player.dy = 0; // Annule l'ascension
                        }
                    }
                    return; // On arrête le check ici car on monte
                }

                const currBottom = player.y + player.height;
                const prevBottom = currBottom - player.dy; 

                // Atterrissage
                if (currBottom >= sFace && prevBottom < sFace + 10 * scaleF) {
                    player.y = sFace - player.height;
                    player.dy = 0;
                    player.grounded = true;
                }
            });
        }
        
        // Limites Gauche
        if (player.x < 0) player.x = 0;
        // Limite Droite
        if (currentPhase !== 1 && player.x + player.width > mapWidth) {
             player.x = mapWidth - player.width; 
        }

        if (currentPhase !== 3) {
            cameraX = player.x - canvas.width / 2 + player.width / 2;
            if (cameraX < 0) cameraX = 0;
            if (cameraX > mapWidth - canvas.width) cameraX = mapWidth - canvas.width;
        }
        
        frameCount++;
    }
}

function rectIntersect(x1, y1, w1, h1, x2, y2, w2, h2) {
    return x2 < x1 + w1 && x2 + w2 > x1 && y2 < y1 + h1 && y2 + h2 > y1;
}

// --- 7. DESSIN (DRAW) ---
function drawMenu() {
    ctx.fillStyle = "#ffd700";
    ctx.font = "bold 45px Cinzel";
    ctx.textAlign = "center";
    ctx.fillText("DRAKK'ART : LE JEU", canvas.width / 2, canvas.height / 4);

    Object.values(menuButtons).forEach(btn => {
        drawBtnStyle(btn);
    });

    ctx.fillStyle = "#ff4444"; 
    ctx.font = "bold 40px Arial";
    ctx.textAlign = "center";
    ctx.fillText("⚠️ ATTENTION : NE PAS APPUYER SUR ECHAP", canvas.width / 2, canvas.height - 60);
}

function drawOptions() {
    ctx.fillStyle = "#ffd700";
    ctx.font = "bold 40px Cinzel";
    ctx.textAlign = "center";
    ctx.fillText("CONFIGURATION DES TOUCHES", canvas.width / 2, 80);

    drawBtnStyle(backButton);

    const startY = 150;
    const actions = [
        { id: 'up', label: 'SAUTER' }, { id: 'left', label: 'GAUCHE' },
        { id: 'right', label: 'DROITE' },
        { id: 'dash', label: 'DASH' }, { id: 'attack', label: 'ATTAQUER' },
        { id: 'menu', label: 'MENU / PAUSE' }
    ];

    ctx.font = "20px Cinzel";

    actions.forEach((act, index) => {
        let yPos = startY + index * 50;
        let keyName = keyMap[act.id].toUpperCase();

        if (keyName === ' ') keyName = "ESPACE";
        if (act.id === 'attack') keyName = "CLIC GAUCHE SOURIS";

        if (actionToBind === act.id) {
            ctx.fillStyle = "#00ff00"; 
            keyName = "> APPUYEZ SUR UNE TOUCHE <";
        } else {
            ctx.fillStyle = "#ffffff";
        }

        ctx.textAlign = "right";
        ctx.fillText(act.label + " : ", canvas.width / 2 - 20, yPos);
        ctx.textAlign = "left";
        ctx.fillStyle = (actionToBind === act.id) ? "#00ff00" : "#ffd700";
        ctx.fillText(keyName, canvas.width / 2 + 20, yPos);
    });
}

function drawBtnStyle(btn) {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(btn.x + 4, btn.y + 4, btn.w, btn.h);
    
    ctx.fillStyle = "#5e3b18";
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 3;
    ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
    ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px Cinzel";
    ctx.textAlign = "center";      
    ctx.textBaseline = "middle";   
    ctx.fillText(btn.text, btn.x + btn.w / 2, btn.y + btn.h / 2);
}

function draw() {
    ctx.save();

    // Désactive le lissage bilinéaire — gain de perfs significatif
    ctx.imageSmoothingEnabled = false;

    if (screenShake > 0) {
        let dx = (Math.random() - 0.5) * screenShake;
        let dy = (Math.random() - 0.5) * screenShake;
        ctx.translate(dx, dy);
    }
    // Fond de base
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (gameState === 'PLAYING') {
        
        // 1. DESSINER LE DÉCOR
        
        if (currentPhase === 2) {
            // Parallax : chaque couche bouge selon la caméra et sa propre vitesse
            parallaxLayers.forEach(layer => {
                if (!layer.img || !layer.img.complete) return;
                let layerX = -(cameraX * layer.speed) % canvas.width;
                ctx.drawImage(layer.img, layerX, 0, canvas.width, canvas.height);
                ctx.drawImage(layer.img, layerX + canvas.width, 0, canvas.width, canvas.height);
            });

            // Dessin des plateformes (après le fond, avant le joueur)
            platforms.forEach(plat => plat.draw(ctx, cameraX));
        } else if (currentPhase === 3) {
            // FOND PARALLAX PHASE 3 — chaque couche est scalée à la hauteur du canvas
            // FOND PARALLAX PHASE 3
            parallaxConfig.forEach(layer => {
                let img = loadedImages[layer.key];
                if (!img || !img.complete) return;

                const scale = canvas.height / (img.naturalHeight || img.height || 1);
                const drawW = (img.naturalWidth || img.width || canvas.width) * scale;
                const drawH = canvas.height;

                let layerX = -(cameraX * layer.speed) % drawW;
                if (layerX > 0) layerX -= drawW; 

                // OPTIMISATION : Math.round force des entiers, empêchant le recalcul de lissage
                ctx.drawImage(img, Math.round(layerX), 0, Math.round(drawW), Math.round(drawH));
                ctx.drawImage(img, Math.round(layerX + drawW), 0, Math.round(drawW), Math.round(drawH));
            });

            // VAGUES — bord droit collé au bord droit du fond
            // Dimensions natives : vague 7006×4823, vagueFond 11835×4823
            const bgRightX = mapWidth - cameraX;

            // vagueFond : hauteur = canvas.height (comme les autres fonds), largeur proportionnelle
            const vagueFondH = canvas.height;
            const vagueFondW = vagueFondH * (11835 / 4823);

            // vagueMain : largeur = canvas.width, hauteur proportionnelle
            const vagueMainW = canvas.width;
            const vagueMainH = vagueMainW * (4823 / 7006);

            let frameVagueMain = (Math.floor(Date.now() / waveAnimSpeed) % 8) + 1;
            let frameVagueFond = (Math.floor(Date.now() / waveAnimSpeed) % 3) + 1;
            let imgVagueFond = loadedImages[`vagueFond${frameVagueFond}`];
            let imgVagueMain = loadedImages[`vague${frameVagueMain}`];

            if (imgVagueFond && imgVagueFond.complete) {
                ctx.drawImage(imgVagueFond, Math.round(bgRightX - vagueFondW), Math.round(canvas.height - vagueFondH), Math.round(vagueFondW), Math.round(vagueFondH));
            }
            if (imgVagueMain && imgVagueMain.complete) {
                ctx.drawImage(imgVagueMain, Math.round(bgRightX - vagueMainW), Math.round(canvas.height - vagueMainH), Math.round(vagueMainW), Math.round(vagueMainH));
            }

            // LE BOSS
            if (!kraken.dead) {
                // --- DIMENSIONS ET POSITION DU KRAKEN ---
                const frontiere = mapWidth / 2;
                const krakenCenterX = frontiere - 250 * scaleF;

                // En phase 2, si l'animation d'encre est active, on masque le kraken vertical
                const hideKraken = (kraken.phase === 2 && kraken.inkAnimActive);

                if (!hideKraken) {
                    let krakenImgs = (kraken.phase === 1) ? krakenPrepHorizontaleImages : krakenPrepVerticaleImages;
                    let krakenImg  = (krakenImgs.length > 0) ? krakenImgs[kraken.prepFrameIndex] : null;

                    let krakenDrawH = canvas.height;
                    let krakenDrawW = krakenDrawH;
                    if (krakenImg && krakenImg.complete && krakenImg.naturalWidth !== 0) {
                        krakenDrawW = krakenDrawH * (krakenImg.naturalWidth / krakenImg.naturalHeight);
                    }

                    let krakenScreenX = (krakenCenterX - cameraX) - krakenDrawW / 2;

                    if (krakenImg && krakenImg.complete && krakenImg.naturalWidth !== 0) {
                        ctx.drawImage(krakenImg, krakenScreenX, 0, krakenDrawW, krakenDrawH);
                    }
                }

                // --- ANIMATION JET D'ENCRE (remplace le kraken vertical pendant 1 cycle) ---
                if (kraken.phase === 2 && kraken.inkAnimActive && crachatImages.length > 0) {
                    const inkImg = crachatImages[kraken.inkAnimFrame];
                    if (inkImg && inkImg.complete && inkImg.naturalWidth !== 0) {
                        const inkDrawH = canvas.height;
                        const inkDrawW = inkDrawH * (inkImg.naturalWidth / inkImg.naturalHeight);
                        const inkScreenX = (krakenCenterX - cameraX) - inkDrawW / 2;
                        ctx.drawImage(inkImg, inkScreenX, 0, inkDrawW, inkDrawH);
                    }
                }

                // BARRES DE VIE
                let barW = 600 * scaleF; let barH = 40 * scaleF; let barX = (canvas.width - barW) / 2; let barY = 50 * scaleF;
                ctx.fillStyle = "black"; ctx.fillRect(barX - 4, barY - 4, barW + 8, barH + 8);
                
                let currentHp, maxHp, label, color;
                if (kraken.phase === 1) { currentHp = kraken.hp1; maxHp = kraken.maxHp1; label = "KRAKEN : CORPS A CORPS"; color = "purple"; }
                else { currentHp = kraken.hp2; maxHp = kraken.maxHp2; label = "KRAKEN : TENTACULES"; color = "red"; }

                ctx.fillStyle = color;
                ctx.fillRect(barX, barY, barW * (currentHp / maxHp), barH);
                ctx.fillStyle = "white"; ctx.font = `bold ${20 * scaleF}px Arial`; ctx.textAlign = "center";
                ctx.fillText(label, canvas.width/2, barY + (28 * scaleF));

                tentacules.forEach(t => t.draw(ctx, canvas.height, cameraX));
                tentaculesH.forEach(t => t.draw(ctx, cameraX));
            }
            debrisList.forEach(d => d.draw(ctx));

        } // fin else if (currentPhase === 3)

        drawPlayer();
        projectiles.forEach(proj => proj.draw(ctx, cameraX));
        enemies.forEach(enemy => enemy.draw(ctx, cameraX));
        enemyProjectiles.forEach(proj => proj.draw(ctx, cameraX));

        // --- VOILE D'ENCRE POST-JET (phase kraken verticale) ---
        if (currentPhase === 3 && !kraken.dead && kraken.phase === 2 && kraken.inkDarkAlpha > 0) {
            ctx.save();
            ctx.globalAlpha = kraken.inkDarkAlpha;
            ctx.fillStyle = '#04000a'; // noir-violet encre de sèche
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.restore();
        }

        drawHUD();
    } 
    else if (gameState === 'MENU') {
        if (frameCount > 0) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        drawMenu();
    }
    else if (gameState === 'GAMEOVER') {
        drawGameOver();
    }
    else if (gameState === 'VICTORY') {
        drawVictory();
    }
    else if (gameState === 'OPTIONS') {
        drawOptions();
    }
    else if (gameState === 'CHAR_SELECT') {
        ctx.fillStyle = "#1a1a1a"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ffd700"; ctx.font = "bold 40px Cinzel"; ctx.textAlign = "center";
        ctx.fillText("CHOISISSEZ VOTRE HÉROS", canvas.width / 2, 80);

        // Animation Acclamation Cédrick (Gauche)
        let frame1 = Math.floor(frameCount / 4) % charAcclame1.length;
        if (charAcclame1[frame1] && charAcclame1[frame1].complete) {
            ctx.drawImage(charAcclame1[frame1], canvas.width / 4 - 150, canvas.height / 2 - 150, 300, 300);
        }
        drawBtnStyle(charSelectButtons.cedrick);

        // Animation Acclamation Quentin (Droite)
        let frame2 = Math.floor(frameCount / 4) % charAcclame2.length;
        if (charAcclame2[frame2] && charAcclame2[frame2].complete) {
            ctx.drawImage(charAcclame2[frame2], (canvas.width / 4) * 3 - 150, canvas.height / 2 - 150, 300, 300);
        }
        drawBtnStyle(charSelectButtons.quentin);

    } else if (gameState === 'LOADING') {
        ctx.fillStyle = "black"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "white"; ctx.font = "30px Arial"; ctx.textAlign = "center";
        
        // Barre de progression
        let progress = imagesToLoad === 0 ? 0 : (imagesLoaded / imagesToLoad);
        ctx.fillText(`CHARGEMENT... ${Math.floor(progress * 100)}%`, canvas.width / 2, canvas.height / 2);
        
        ctx.strokeStyle = "white"; ctx.strokeRect(canvas.width/4, canvas.height/2 + 30, canvas.width/2, 30);
        ctx.fillStyle = "#ffd700"; ctx.fillRect(canvas.width/4, canvas.height/2 + 30, (canvas.width/2) * progress, 30);
    }

    // --- EFFET DE TRANSITION (DESSINÉ PAR DESSUS TOUT LE RESTE) ---
    if (transitionAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = transitionAlpha;
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
    }
    ctx.restore();
}   
    
function drawPlayer() {
    if (player.blink && Math.floor(Date.now() / 100) % 2 === 0) return;

    // Toutes les frames sont chargées → animationSpeed = 4 (valeur d'origine)
    let animationSpeed = 4;
    let currentImg;

    // --- SYSTÈME DE PRIORITÉ D'ANIMATION ---
    if (player.isAttacking) {
        currentImg = playerImagesHache[player.attackFrameIndex];
    } else if (player.isCrouching) {
        // PRIORITÉ AU CROUCH
        if (playerImagesCrouch.length > 0) {
            let frameIndex = Math.floor(frameCount / animationSpeed) % playerImagesCrouch.length;
            currentImg = playerImagesCrouch[frameIndex];
        }
    } else if (!player.grounded) {
        // 2. Priorité haute : Le saut
        if (playerImagesJumping.length > 0) {
            let frameIndex = Math.floor(frameCount / animationSpeed) % playerImagesJumping.length;
            currentImg = playerImagesJumping[frameIndex];
        }
    } else if (keys[keyMap.left] || keys[keyMap.right]) {
        // 3. Priorité moyenne : La course
        if (playerImagesRunning.length > 0) {
            let frameIndex = Math.floor(frameCount / (animationSpeed - 1)) % playerImagesRunning.length; 
            currentImg = playerImagesRunning[frameIndex];
        }
    } else {
        // 4. Priorité basse : Immobile (Idle)
        if (playerImages.length > 0) {
            let frameIndex = Math.floor(frameCount / animationSpeed) % playerImages.length;
            currentImg = playerImages[frameIndex];
        }
    }

    let h = player.height;
    let y = player.y; 
    let screenX = player.x - cameraX;

    if (currentImg && currentImg.complete) {
        if (player.facingRight) {
            ctx.drawImage(currentImg, screenX, y, player.width, h);
        } else {
            ctx.save();
            ctx.translate(screenX + player.width / 2, y + h / 2);
            ctx.scale(-1, 1);
            ctx.drawImage(currentImg, -player.width / 2, -h / 2, player.width, h);
            ctx.restore();
        }
    } 
}

function drawHUD() {
    const startX = 30 * scaleF;  
    const startY = 30 * scaleF; 
    const size = 80 * scaleF;   // TAILLE X2 (était à 40)
    const spacing = 20 * scaleF; // Espacement ajusté

    for (let i = 0; i < player.maxHealth; i++) {
        let x = startX + (size + spacing) * i;
        let y = startY;

        if (i < player.health) {
            if (imgHeartFull.complete && imgHeartFull.naturalWidth !== 0) {
                ctx.drawImage(imgHeartFull, x, y, size, size);
            }
        } else {
            if (imgHeartEmpty.complete && imgHeartEmpty.naturalWidth !== 0) {
                ctx.drawImage(imgHeartEmpty, x, y, size, size);
            }
        }
    }

    // --- AFFICHAGE DU CHRONOMÈTRE (avec gestion de la pause) ---
    let currentTimeDisplay = isTimerRunning ? (Date.now() - gameStartTime - totalPausedTime) : finalGameTime;
    
    ctx.fillStyle = "black";
    ctx.font = `bold ${60 * scaleF}px Cinzel, Arial`; // TAILLE X2 (était à 30)
    ctx.textAlign = "right"; 
    
    // Position Y augmentée à 100 pour compenser la police plus grande
    ctx.fillText(formatTime(currentTimeDisplay), canvas.width - (50 * scaleF), 100 * scaleF);
    ctx.textAlign = "left"; 
}

function drawGameOver() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#cc0000"; 
    ctx.font = "bold 60px Cinzel"; 
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("VOUS ÊTES MORT", canvas.width / 2, canvas.height / 3);

    drawBtnStyle(gameOverButtons.backToMenu);
    drawBtnStyle(gameOverButtons.exitGame);
}

function drawVictory() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.9)"; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = "#ffd700"; 
    ctx.font = "bold 60px Cinzel"; 
    ctx.textAlign = "center";
    ctx.fillText("VICTOIRE !", canvas.width / 2, canvas.height / 3);
    
    ctx.font = "30px Arial"; 
    ctx.fillStyle = "white";
    ctx.fillText("Le Kraken est vaincu.", canvas.width / 2, canvas.height / 2 - 40);
    
    
    ctx.fillStyle = "#00ff00"; // Vert pétant pour le chrono final
    ctx.font = "bold 45px Arial";
    ctx.fillText(`Temps de complétion : ${formatTime(finalGameTime)}`, canvas.width / 2, canvas.height / 2 + 20);
    
    // Dessin du bouton
    drawBtnStyle(victoryButtons.exit);
}

let accumulator = 0;
const FIXED_STEP = 1000 / 60; // 16.67ms par tick logique

function gameLoop(timestamp) {
    if (!gameRunning) return;

    if (!lastTime) lastTime = timestamp;
    let elapsed = timestamp - lastTime;
    lastTime = timestamp;

    // Sécurité : si on a été absent plus de 200ms (changement d'onglet etc.)
    if (elapsed > 200) elapsed = FIXED_STEP;

    accumulator += elapsed;

    // On avance la logique par pas fixes de 16.67ms
    // Maximum 3 passes pour éviter la spirale de la mort
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 3) {
        dt = 1; // 1 tick = 1 frame logique 60fps
        update();
        accumulator -= FIXED_STEP;
        steps++;
    }

    // On dessine une seule fois par frame navigateur
    draw();
    requestAnimationFrame(gameLoop);
}