"use strict";

// All gameplay tuning lives here so the prototype can be adjusted quickly.
const CONFIG = {
  initialFallSpeed: 130,         // actual opening speed, with the early boost below
  lateCurveInitialFallSpeed: 90, // keeps the verified score-30+ speed curve unchanged
  maxFallSpeed: 320,             // speed cap: remains readable at high pressure
  fallSpeedScoreScale: 34,       // larger = slower/smoother speed ramp
  initialSpawnInterval: 1700,    // actual opening interval: quickly establishes a flow
  lateCurveInitialSpawnInterval: 3500, // keeps the verified score-30+ spawn curve unchanged
  minSpawnInterval: 520,         // high-pressure cap; spacing guard still prevents overlap
  spawnIntervalScoreScale: 21,   // ramps density notably from the mid game onward
  earlyPaceTransitionScore: 30,
  earlyPaceExponent: 2,
  firstItemStartYRatio: .28,
  firstItemSpeedMultiplier: 1.55,
  minItemGap: 32,                // extra vertical clearance between two centre-track items
  maxConcurrentItems: 5,
  maxSameDirectionRun: 4,
  openingMaxSameDirectionRun: 2,
  directionRunWeights: [
    { length: 1, weight: 25 },
    { length: 2, weight: 40 },
    { length: 3, weight: 25 },
    { length: 4, weight: 10 }
  ],
  correctBranchSpeedMultiplier: 1.32,
  wrongPauseDuration: 105,
  maxRevives: 2,
  junctionY: 0.65,             // Y branch start, as a fraction of game height
  exitY: 0.90,                 // result zone, as a fraction of game height
  branchExitX: 0.34,           // left/right branch endpoint, as a fraction of game width
  itemStartY: -52,
  pawReadyDistance: 135,        // pixels before the junction to show a subtle ready cue
  prepareDuration: 1000,
  feedbackDuration: 550,
  tutorialIntroDuration: 2000,
  catSwipeImage: "assets/cat_swipe.png",    // LEFT in left half, RIGHT in right half
  middleItemUnlockScore: 11,  // score 0–10: the clearest starter items
  fullItemUnlockScore: 26,    // score 26+: all 18 item illustrations are available
  audio: {
    enabled: true,              // master sound switch; can be changed at runtime with setSoundEnabled().
    masterVolume: 1,
    sfxVolume: 0.70,
    bgmVolume: 0.30,
    stopBgmOnGameOver: true,
    files: {
      switch: "assets/audio/switch.mp3",
      wrong: "assets/audio/wrong.mp3",
      bgm: "assets/audio/bgm.mp3"
    }
  },
  storageKey: "cat-eat-or-not-best-score-v01",
  tutorialStorageKey: "cat-eat-or-not-tutorial-v02"
};

// Add or replace item illustrations here. `answer` is either "eat" or "no".
// tier: 0 is available at the start, 1 at 11 points, and 2 at 26 points.
const ITEMS = [
  { image: "assets/items/fish.png", name: "小鱼", answer: "eat", tier: 0, size: 70 },
  { image: "assets/items/chicken.png", name: "鸡肉", answer: "eat", tier: 0, size: 63 },
  { image: "assets/items/beef.png", name: "牛肉", answer: "eat", tier: 0, size: 65 },
  { image: "assets/items/shrimp.png", name: "熟虾", answer: "eat", tier: 0, size: 68 },
  { image: "assets/items/salmon.png", name: "三文鱼", answer: "eat", tier: 0, size: 66 },
  { image: "assets/items/egg.png", name: "熟鸡蛋", answer: "eat", tier: 0, size: 63 },
  { image: "assets/items/dried-fish.png", name: "小鱼干", answer: "eat", tier: 0, size: 71 },
  { image: "assets/items/cat-can.png", name: "猫罐头", answer: "eat", tier: 0, size: 59 },
  { image: "assets/items/duck-meat.png", name: "鸭肉", answer: "eat", tier: 1, size: 64 },
  { image: "assets/items/cod.png", name: "鳕鱼块", answer: "eat", tier: 1, size: 65 },
  { image: "assets/items/cat-puree.png", name: "猫用肉泥", answer: "eat", tier: 1, size: 63 },
  { image: "assets/items/chocolate.png", name: "巧克力", answer: "no", tier: 0, size: 64 },
  { image: "assets/items/onion.png", name: "洋葱", answer: "no", tier: 0, size: 63 },
  { image: "assets/items/garlic.png", name: "大蒜", answer: "no", tier: 0, size: 63 },
  { image: "assets/items/grapes.png", name: "葡萄", answer: "no", tier: 1, size: 59 },
  { image: "assets/items/coffee.png", name: "咖啡", answer: "no", tier: 1, size: 64 },
  { image: "assets/items/chili.png", name: "辣椒", answer: "no", tier: 1, size: 71 },
  { image: "assets/items/yarn.png", name: "毛线球", answer: "no", tier: 0, size: 66 },
  { image: "assets/items/rubber-duck.png", name: "橡皮鸭", answer: "no", tier: 1, size: 65 },
  { image: "assets/items/feather.png", name: "羽毛", answer: "no", tier: 1, size: 66 },
  { image: "assets/items/bell.png", name: "铃铛", answer: "no", tier: 1, size: 64 },
  { image: "assets/items/shuttlecock.png", name: "羽毛球", answer: "no", tier: 2, size: 77 },
  { image: "assets/items/playing-cards.png", name: "扑克牌", answer: "no", tier: 2, size: 75 }
];

// These two illustrations are onboarding-only. They never join the random item pool.
const TUTORIAL_ITEMS = [
  { image: "assets/items/cat_food.png", name: "猫粮", answer: "eat", size: 122 },
  { image: "assets/items/plastic_bag.png", name: "垃圾", answer: "no", size: 122 }
];

// Every sound effect gets its own Audio instance so rapid consecutive actions never
// cut off a previous effect. Missing files only fail silently and never block gameplay.
class AudioManager {
  constructor(config) {
    this.config = config;
    this.enabled = config.enabled;
    this.unlocked = false;
    this.bgm = null;
    this.bgmWanted = false;
    this.activeEffects = new Set();
    this.replaceOnReplay = new Map();
  }

  getVolume(type) {
    const typeVolume = type === "bgm" ? this.config.bgmVolume : this.config.sfxVolume;
    return Math.max(0, Math.min(1, this.config.masterVolume * typeVolume));
  }

  unlock() {
    this.unlocked = true;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this.pauseBgm();
      return;
    }
    if (this.bgmWanted) this.startBgm();
  }

  playEffect(name) {
    const source = this.config.files[name];
    if (!this.enabled || !this.unlocked || !source) return;
    // Fast back-and-forth paw taps should sound crisp, not stack into a long whoosh.
    this.stopReplacedEffect(name);
    const effect = new Audio(source);
    effect.preload = "auto";
    effect.volume = this.getVolume("sfx");
    this.activeEffects.add(effect);
    if (name === "switch") this.replaceOnReplay.set(name, effect);
    const dispose = () => {
      this.activeEffects.delete(effect);
      if (this.replaceOnReplay.get(name) === effect) this.replaceOnReplay.delete(name);
    };
    effect.addEventListener("ended", dispose, { once: true });
    effect.addEventListener("error", dispose, { once: true });
    const playback = effect.play();
    if (playback) playback.catch(dispose);
  }

  stopReplacedEffect(name) {
    const previous = this.replaceOnReplay.get(name);
    if (!previous) return;
    previous.pause();
    try {
      previous.currentTime = 0;
    } catch {
      // It is safe if a browser rejects seeking an unfinished or missing file.
    }
    this.activeEffects.delete(previous);
    this.replaceOnReplay.delete(name);
  }

  startBgm() {
    this.bgmWanted = true;
    if (!this.enabled || !this.unlocked) return;
    if (!this.bgm) {
      this.bgm = new Audio(this.config.files.bgm);
      this.bgm.loop = true;
      this.bgm.preload = "auto";
    }
    this.bgm.volume = this.getVolume("bgm");
    const playback = this.bgm.play();
    if (playback) playback.catch(() => {});
  }

  pauseBgm() {
    if (this.bgm) this.bgm.pause();
  }

  resumeBgm() {
    if (this.bgmWanted) this.startBgm();
  }

  stopBgm() {
    this.bgmWanted = false;
    if (!this.bgm) return;
    this.bgm.pause();
    try {
      this.bgm.currentTime = 0;
    } catch {
      // Some browsers reject seeking an unavailable source; it is safe to ignore.
    }
  }
}

const audio = new AudioManager(CONFIG.audio);

function playSound(soundName) {
  audio.playEffect(soundName);
}

// Reserved for a future settings UI. This intentionally changes no gameplay state.
function setSoundEnabled(enabled) {
  audio.setEnabled(enabled);
}

const el = {
  shell: document.querySelector("#gameShell"),
  area: document.querySelector("#gameArea"),
  layer: document.querySelector("#itemsLayer"),
  score: document.querySelector("#score"),
  bestScore: document.querySelector("#bestScore"),
  finalScore: document.querySelector("#finalScore"),
  finalBestScore: document.querySelector("#finalBestScore"),
  junctionFeedback: document.querySelector("#junctionFeedback"),
  catSwipe: document.querySelector("#catSwipe"),
  foodBowl: document.querySelector(".food-bowl"),
  trashBin: document.querySelector(".trash-bin"),
  tip: document.querySelector("#tip"),
  pauseButton: document.querySelector("#pauseButton"),
  pauseOverlay: document.querySelector("#pauseOverlay"),
  resumeButton: document.querySelector("#resumeButton"),
  startOverlay: document.querySelector("#startOverlay"),
  gameOverOverlay: document.querySelector("#gameOverOverlay"),
  startButton: document.querySelector("#startButton"),
  reviveButton: document.querySelector("#reviveButton"),
  restartButton: document.querySelector("#restartButton"),
  feedback: document.querySelector("#feedback"),
  prepareMessage: document.querySelector("#prepareMessage")
};

const state = {
  status: "start", // start | tutorial-intro | tutorial | playing | preparing | paused | gameover
  score: 0,
  bestScore: Number(localStorage.getItem(CONFIG.storageKey)) || 0,
  direction: "left",
  revives: 0,
  items: [],
  tutorialCompleted: localStorage.getItem(CONFIG.tutorialStorageKey) === "1",
  tutorialStep: -1,
  failedTutorialStep: null,
  tutorialTimer: 0,
  catSwipeTimer: 0,
  catSwipeCleanupTimer: 0,
  spawnTimer: 0,
  currentRunAnswer: null,
  runItemsRemaining: 0,
  pendingItemData: null,
  lastTime: 0,
  rafId: 0
};

function getFallSpeed() {
  const span = CONFIG.maxFallSpeed - CONFIG.lateCurveInitialFallSpeed;
  const establishedCurve = CONFIG.lateCurveInitialFallSpeed + span * (1 - Math.exp(-state.score / CONFIG.fallSpeedScoreScale));
  const earlyProgress = Math.max(0, 1 - state.score / CONFIG.earlyPaceTransitionScore);
  const openingBoost = (CONFIG.initialFallSpeed - CONFIG.lateCurveInitialFallSpeed) * earlyProgress ** CONFIG.earlyPaceExponent;
  return Math.min(CONFIG.maxFallSpeed, establishedCurve + openingBoost);
}

function getSpawnInterval() {
  const span = CONFIG.lateCurveInitialSpawnInterval - CONFIG.minSpawnInterval;
  const establishedCurve = CONFIG.minSpawnInterval + span * Math.exp(-state.score / CONFIG.spawnIntervalScoreScale);
  const earlyProgress = Math.max(0, 1 - state.score / CONFIG.earlyPaceTransitionScore);
  const openingReduction = (CONFIG.lateCurveInitialSpawnInterval - CONFIG.initialSpawnInterval) * earlyProgress ** CONFIG.earlyPaceExponent;
  return Math.max(CONFIG.minSpawnInterval, establishedCurve - openingReduction);
}

function updateHud() {
  el.score.textContent = state.score;
  el.bestScore.textContent = state.bestScore;
}

function setupCatSwipeArt() {
  el.catSwipe.style.setProperty("--cat-swipe-image", `url("${CONFIG.catSwipeImage}")`);
}

function updateDirection() {
  const isLeft = state.direction === "left";
  el.catSwipe.classList.toggle("at-left", isLeft);
  el.catSwipe.classList.toggle("at-right", !isLeft);
}

function syncTrackGeometry() {
  const rect = el.area.getBoundingClientRect();
  const horizontal = rect.width * CONFIG.branchExitX;
  const vertical = rect.height * (CONFIG.exitY - CONFIG.junctionY);
  const angle = Math.atan2(vertical, horizontal) * (180 / Math.PI);
  const length = Math.hypot(horizontal, vertical);
  el.area.style.setProperty("--branch-length", `${length}px`);
  el.area.style.setProperty("--right-branch-angle", `${angle}deg`);
  el.area.style.setProperty("--left-branch-angle", `${180 - angle}deg`);
}

function switchDirection() {
  if (state.status !== "playing" && state.status !== "tutorial") return;
  state.direction = state.direction === "left" ? "right" : "left";
  window.clearTimeout(state.catSwipeTimer);
  window.clearTimeout(state.catSwipeCleanupTimer);
  el.catSwipe.classList.remove("swipe", "motion-left", "motion-right");
  el.catSwipe.classList.add("compress");
  state.catSwipeTimer = window.setTimeout(() => {
    updateDirection();
    el.catSwipe.classList.remove("compress", "swipe");
    el.catSwipe.classList.add(state.direction === "left" ? "motion-left" : "motion-right");
    void el.catSwipe.offsetWidth;
    el.catSwipe.classList.add("swipe");
    state.catSwipeCleanupTimer = window.setTimeout(() => {
      el.catSwipe.classList.remove("swipe", "motion-left", "motion-right");
    }, 120);
  }, 34);
  playSound("switch");
}

function getItemPool() {
  const availableTier = state.score >= CONFIG.fullItemUnlockScore
    ? 2
    : state.score >= CONFIG.middleItemUnlockScore ? 1 : 0;
  return ITEMS.filter((item) => item.enabled !== false && item.tier <= availableTier);
}

function pickRunLength() {
  const totalWeight = CONFIG.directionRunWeights.reduce((total, entry) => total + entry.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const entry of CONFIG.directionRunWeights) {
    roll -= entry.weight;
    if (roll < 0) return Math.min(entry.length, CONFIG.maxSameDirectionRun);
  }
  const finalEntry = CONFIG.directionRunWeights[CONFIG.directionRunWeights.length - 1];
  return Math.min(finalEntry.length, CONFIG.maxSameDirectionRun);
}

function getNextRunAnswer() {
  if (state.runItemsRemaining === 0) {
    const isOpeningRun = state.currentRunAnswer === null;
    state.currentRunAnswer = state.currentRunAnswer === "eat" ? "no" : state.currentRunAnswer === "no" ? "eat" : (Math.random() < .5 ? "eat" : "no");
    state.runItemsRemaining = Math.min(
      pickRunLength(),
      isOpeningRun ? CONFIG.openingMaxSameDirectionRun : CONFIG.maxSameDirectionRun
    );
  }
  state.runItemsRemaining -= 1;
  return state.currentRunAnswer;
}

function getPendingItemData() {
  if (state.pendingItemData) return state.pendingItemData;
  const answer = getNextRunAnswer();
  const candidates = getItemPool().filter((item) => item.answer === answer);
  state.pendingItemData = candidates[Math.floor(Math.random() * candidates.length)];
  return state.pendingItemData;
}

function hasSpawnClearance(data) {
  if (state.items.length >= CONFIG.maxConcurrentItems) return false;
  return !state.items.some((item) => {
    if (item.branch || item.node.classList.contains("correct")) return false;
    const requiredDistance = (item.data.size + data.size) / 2 + CONFIG.minItemGap;
    return item.y - CONFIG.itemStartY < requiredDistance;
  });
}

function createItem(data = getPendingItemData(), startY = CONFIG.itemStartY, fallSpeedMultiplier = 1, tutorialStep = null) {
  if (data === state.pendingItemData) state.pendingItemData = null;
  const node = document.createElement("div");
  node.className = "item";
  node.style.setProperty("--item-size", `${data.size}px`);
  node.innerHTML = `<img class="item-image" src="${data.image}" alt="" draggable="false" />`;
  el.layer.append(node);
  state.items.push({
    data,
    node,
    y: startY,
    branch: null,
    branchProgress: 0,
    routeCorrect: false,
    branchSpeedMultiplier: 1,
    fallSpeedMultiplier,
    tutorialStep
  });
}

function createTutorialItem(step) {
  createItem(TUTORIAL_ITEMS[step], CONFIG.itemStartY, 1, step);
}

function startTutorial() {
  state.status = "tutorial-intro";
  state.tutorialStep = 0;
  el.tip.classList.remove("hidden");
  window.clearTimeout(state.tutorialTimer);
  state.tutorialTimer = window.setTimeout(() => {
    if (state.status !== "tutorial-intro") return;
    state.status = "tutorial";
    createTutorialItem(state.tutorialStep);
  }, CONFIG.tutorialIntroDuration);
}

function advanceTutorial(item) {
  const nextStep = item.tutorialStep + 1;
  if (nextStep < TUTORIAL_ITEMS.length) {
    state.tutorialStep = nextStep;
    createTutorialItem(nextStep);
    return;
  }
  state.tutorialCompleted = true;
  state.tutorialStep = -1;
  localStorage.setItem(CONFIG.tutorialStorageKey, "1");
  el.tip.classList.add("hidden");
  state.status = "playing";
  state.spawnTimer = 0;
}

function positionItem(item, width, height) {
  const centerX = width / 2;
  let x = centerX;
  let y = item.y;
  if (item.branch) {
    const side = item.branch === "left" ? -1 : 1;
    const junctionY = height * CONFIG.junctionY;
    const exitY = height * CONFIG.exitY;
    const exitX = centerX + side * width * CONFIG.branchExitX;
    const t = Math.min(1, item.branchProgress);
    x = centerX + (exitX - centerX) * t;
    y = junctionY + (exitY - junctionY) * t;
  }
  item.node.style.left = `${x}px`;
  item.node.style.top = `${y}px`;
}

function removeItem(item) {
  item.node.remove();
  const index = state.items.indexOf(item);
  if (index >= 0) state.items.splice(index, 1);
}

function restartClass(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

function showJunctionFeedback(type) {
  el.junctionFeedback.className = `junction-feedback ${type}`;
  void el.junctionFeedback.offsetWidth;
  el.junctionFeedback.classList.add("show");
}

function triggerExitFeedback(destination) {
  if (destination === "eat") restartClass(el.foodBowl, "hit");
  else restartClass(el.trashBin, "hit");
  restartClass(el.score, "score-hit");
}

function showCorrect(item, destination) {
  item.node.classList.add("correct", destination === "eat" ? "eat-result" : "trash-result");
  if (destination === "eat") {
    el.catSwipe.classList.remove("happy");
    void el.catSwipe.offsetWidth;
    el.catSwipe.classList.add("happy");
    window.setTimeout(() => el.catSwipe.classList.remove("happy"), 350);
  }
  window.setTimeout(() => removeItem(item), 330);
}

function scorePoint(item, destination) {
  state.score += 1;
  if (state.score > state.bestScore) {
    state.bestScore = state.score;
    localStorage.setItem(CONFIG.storageKey, String(state.bestScore));
  }
  updateHud();
  triggerExitFeedback(destination);
  showCorrect(item, destination);
}

function endGame(item) {
  if (state.status !== "playing" && state.status !== "wrong-pause") return;
  state.status = "gameover";
  state.failedTutorialStep = Number.isInteger(item.tutorialStep) ? item.tutorialStep : null;
  item.node.classList.add("wrong");
  el.shell.classList.remove("shake");
  void el.shell.offsetWidth;
  el.shell.classList.add("shake");
  window.setTimeout(() => el.shell.classList.remove("shake"), 310);
  el.finalScore.textContent = state.score;
  el.finalBestScore.textContent = state.bestScore;
  const canRevive = state.revives < CONFIG.maxRevives;
  el.reviveButton.hidden = !canRevive;
  el.gameOverOverlay.classList.add("visible");
  el.gameOverOverlay.setAttribute("aria-hidden", "false");
}

function resolveItem(item) {
  const chosenAnswer = item.branch === "left" ? "eat" : "no";
  if (item.routeCorrect && chosenAnswer === item.data.answer) {
    scorePoint(item, chosenAnswer);
    if (Number.isInteger(item.tutorialStep)) advanceTutorial(item);
  }
  else endGame(item);
}

function chooseBranch(item) {
  item.branch = state.direction;
  item.branchProgress = 0;
  const chosenAnswer = item.branch === "left" ? "eat" : "no";
  item.routeCorrect = chosenAnswer === item.data.answer;
  if (item.routeCorrect) {
    item.branchSpeedMultiplier = CONFIG.correctBranchSpeedMultiplier;
    showJunctionFeedback("correct");
    return true;
  }

  item.node.classList.add("wrong");
  showJunctionFeedback("wrong");
  if (CONFIG.audio.stopBgmOnGameOver) audio.stopBgm();
  playSound("wrong");
  state.status = "wrong-pause";
  window.setTimeout(() => endGame(item), CONFIG.wrongPauseDuration);
  return false;
}

function updateItems(delta) {
  const rect = el.area.getBoundingClientRect();
  const junctionY = rect.height * CONFIG.junctionY;
  const exitDistance = rect.height * (CONFIG.exitY - CONFIG.junctionY);
  const speed = getFallSpeed();
  for (const item of [...state.items]) {
    // Items that just scored stay in the array briefly for their pop animation.
    if (item.node.classList.contains("correct")) continue;
    if (!item.branch) {
      item.y += speed * item.fallSpeedMultiplier * delta;
      if (item.y >= junctionY) {
        if (!chooseBranch(item)) return;
      }
    } else {
      item.branchProgress += (speed * item.branchSpeedMultiplier * delta) / exitDistance;
      if (item.branchProgress >= 1) {
        positionItem(item, rect.width, rect.height);
        resolveItem(item);
        continue;
      }
    }
    positionItem(item, rect.width, rect.height);
  }
  const hasApproachingItem = state.items.some((item) =>
    !item.branch && !item.node.classList.contains("correct") && item.y >= junctionY - CONFIG.pawReadyDistance
  );
  el.catSwipe.classList.toggle("ready", hasApproachingItem);
}

function gameLoop(now) {
  const delta = Math.min((now - state.lastTime) / 1000, 0.05);
  state.lastTime = now;
  if (state.status === "playing") {
    state.spawnTimer += delta * 1000;
    const nextItem = getPendingItemData();
    if (state.spawnTimer >= getSpawnInterval() && hasSpawnClearance(nextItem)) {
      state.spawnTimer = 0;
      createItem(nextItem);
    }
    updateItems(delta);
  } else if (state.status === "tutorial") {
    updateItems(delta);
  }
  state.rafId = requestAnimationFrame(gameLoop);
}

function clearAllItems() {
  state.items.forEach((item) => item.node.remove());
  state.items = [];
}

function beginNewGame() {
  audio.unlock();
  audio.startBgm();
  clearAllItems();
  window.clearTimeout(state.tutorialTimer);
  window.clearTimeout(state.catSwipeTimer);
  window.clearTimeout(state.catSwipeCleanupTimer);
  state.score = 0;
  state.revives = 0;
  state.direction = "left";
  state.spawnTimer = 0;
  state.currentRunAnswer = null;
  state.runItemsRemaining = 0;
  state.pendingItemData = null;
  state.failedTutorialStep = null;
  updateHud();
  el.catSwipe.classList.remove("compress", "swipe", "motion-left", "motion-right");
  updateDirection();
  el.startOverlay.classList.remove("visible");
  el.gameOverOverlay.classList.remove("visible");
  el.gameOverOverlay.setAttribute("aria-hidden", "true");
  el.pauseOverlay.classList.remove("visible");
  el.pauseOverlay.setAttribute("aria-hidden", "true");
  if (!state.tutorialCompleted) {
    startTutorial();
    return;
  }
  state.status = "playing";
  el.tip.classList.add("hidden");
  const firstItem = getPendingItemData();
  createItem(
    firstItem,
    el.area.getBoundingClientRect().height * CONFIG.firstItemStartYRatio,
    CONFIG.firstItemSpeedMultiplier
  );
}

function pauseGame() {
  if (state.status !== "playing") return;
  state.status = "paused";
  audio.pauseBgm();
  el.pauseOverlay.classList.add("visible");
  el.pauseOverlay.setAttribute("aria-hidden", "false");
}

function resumeGame() {
  if (state.status !== "paused") return;
  state.status = "playing";
  state.lastTime = performance.now();
  audio.resumeBgm();
  el.pauseOverlay.classList.remove("visible");
  el.pauseOverlay.setAttribute("aria-hidden", "true");
}

function revive() {
  if (state.status !== "gameover" || state.revives >= CONFIG.maxRevives) return;
  audio.unlock();
  state.revives += 1;
  const retryTutorialStep = state.failedTutorialStep;
  // Remove only the item that caused the game over; the rest remain frozen for the preparation beat.
  const wrongItem = state.items.find((item) => item.node.classList.contains("wrong"));
  if (wrongItem) removeItem(wrongItem);
  el.gameOverOverlay.classList.remove("visible");
  el.gameOverOverlay.setAttribute("aria-hidden", "true");
  state.status = "preparing";
  el.prepareMessage.classList.remove("show");
  void el.prepareMessage.offsetWidth;
  el.prepareMessage.classList.add("show");
  window.setTimeout(() => {
    if (state.status === "preparing") {
      audio.startBgm();
      if (Number.isInteger(retryTutorialStep)) {
        state.status = "tutorial";
        state.tutorialStep = retryTutorialStep;
        state.failedTutorialStep = null;
        createTutorialItem(retryTutorialStep);
        return;
      }
      state.status = "playing";
      state.spawnTimer = 0;
      const nextItem = getPendingItemData();
      if (hasSpawnClearance(nextItem)) createItem(nextItem);
      else state.spawnTimer = getSpawnInterval();
    }
  }, CONFIG.prepareDuration);
}

el.startButton.addEventListener("click", beginNewGame);
el.restartButton.addEventListener("click", beginNewGame);
el.reviveButton.addEventListener("click", revive);
el.pauseButton.addEventListener("click", pauseGame);
el.resumeButton.addEventListener("click", resumeGame);
el.shell.addEventListener("click", (event) => {
  if (event.target.closest("button") || event.target.closest(".overlay")) return;
  switchDirection();
});

updateHud();
setupCatSwipeArt();
updateDirection();
syncTrackGeometry();
window.addEventListener("resize", syncTrackGeometry);
state.lastTime = performance.now();
state.rafId = requestAnimationFrame(gameLoop);
