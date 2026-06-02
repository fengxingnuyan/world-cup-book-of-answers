const FALLBACK_QUESTION = "你没说出口的问题，比赛也听见了。";
const DAILY_LIMIT = 5;
const STORAGE_KEY = "world-cup-book-usage";
const QUESTION_PLACEHOLDERS = [
  "把问题写下来，剩下的交给比赛。",
  "比如：我该不该现在主动一点？",
  "比如：这次换队，是不是更好的时机？",
  "比如：我要不要继续等这一个答案？",
  "比如：现在出手，会不会太早？",
  "比如：这场关系，我还该不该加时？",
  "比如：今天适合冒险，还是先稳住阵型？",
];
const LIMIT_REACHED_ANSWERS = [
  "今夜的签位已经抽满了。命运示意你收脚，明天再来开球。",
  "今天的五次哨声已经吹完。再问下去，连月光都会判你越位。",
  "更衣室的灯已经暗了。命运不再加时，这一页明天再翻。",
  "今晚的判词到此为止。再踢下去，答案也只会在门线上沉默。",
  "今日的签运已经封盘。球场还在，但门不会为第六脚打开。",
];

const ANSWER_BREAK_PATTERN = /[，。！？；、]/;
const ANSWER_MULTILINE_THRESHOLD = 14;

const questionInput = document.querySelector("#questionInput");
const drawButton = document.querySelector("#drawButton");
const againButton = document.querySelector("#againButton");
const saveButton = document.querySelector("#saveButton");
const saveHint = document.querySelector("#saveHint");
const githubStarLink = document.querySelector("#githubStarLink");
const pageTitle = document.querySelector("h1");
const pageLead = document.querySelector(".lead");
const stageMessage = document.querySelector("#stageMessage");
const resultCard = document.querySelector("#resultCard");
const resultActions = document.querySelector("#resultActions");
const cardQuestion = document.querySelector("#cardQuestion");
const cardAnswer = document.querySelector("#cardAnswer");
const inputView = document.querySelector("#inputView");
const answerView = document.querySelector("#answerView");

let answerBook = null;
let lastAnswerId = null;
let currentQuestion = "";
let currentAnswer = "";
let currentMode = "normal";

bootstrap();

function bootstrap() {
  try {
    answerBook = normalizeAnswerBook(window.WORLD_CUP_ANSWER_BOOK);

    if (!answerBook.general.length || !answerBook.empty.length) {
      throw new Error("Missing answers");
    }
  } catch (error) {
    console.error("Failed to load answers", error);
    stageMessage.textContent = "语料加载失败了，先去更衣室调整一下。";
    drawButton.disabled = true;
    return;
  }

  applyFreshPlaceholder();
  bindEvents();
  queueTypographyFit();
}

function bindEvents() {
  drawButton.addEventListener("click", drawAnswer);
  againButton.addEventListener("click", returnToQuestionView);
  saveButton.addEventListener("click", saveCardImage);
}

async function drawAnswer() {
  if (!answerBook) {
    return;
  }

  const rawQuestion = questionInput.value.trim();
  const usage = getUsageState();

  currentQuestion = rawQuestion || FALLBACK_QUESTION;
  currentMode = "normal";

  if (usage.count >= DAILY_LIMIT) {
    currentAnswer = pickLimitReachedAnswer();
    currentMode = "limit";
    currentQuestion = "今天的签数已经踢满。";
  } else if (!rawQuestion) {
    currentAnswer = pickFromPool(answerBook.empty);
    incrementUsage(usage);
    currentMode = "empty";
  } else {
    currentAnswer = pickAnswerForQuestion(rawQuestion);
    incrementUsage(usage);
  }

  showAnswerView();
  setSaveHint("");
  stageMessage.textContent =
    currentMode === "limit" ? "今夜的签位已经封盘……" : "命运正在翻开这一页……";
  stageMessage.classList.remove("hidden");
  resultCard.classList.add("hidden");
  resultCard.classList.remove("is-revealed");
  resultActions.classList.add("hidden");
  githubStarLink.classList.add("hidden");
  drawButton.disabled = true;
  againButton.disabled = true;

  await wait(randomDelay());

  cardQuestion.textContent = currentQuestion;
  renderAnswerText(currentAnswer);

  stageMessage.classList.add("hidden");
  resultCard.classList.remove("hidden");
  resultCard.classList.add("is-revealed");
  resultActions.classList.remove("hidden");
  saveButton.classList.toggle("hidden", currentMode === "limit");
  drawButton.disabled = false;
  againButton.disabled = false;
  queueTypographyFit();
  window.requestAnimationFrame(() => {
    githubStarLink.classList.remove("hidden");
  });
}

function pickAnswerForQuestion(question) {
  const normalizedQuestion = question.toLowerCase();
  const matchedKeywordItems = answerBook.keywordPools
    .filter((pool) =>
      pool.keywords.some((keyword) => normalizedQuestion.includes(keyword.toLowerCase()))
    )
    .flatMap((pool) => pool.items);

  if (matchedKeywordItems.length) {
    const topicalItems = hasCurrentTournamentCue(normalizedQuestion)
      ? mergePools(matchedKeywordItems, answerBook.currentTournament)
      : matchedKeywordItems;
    return pickFromPool(topicalItems);
  }

  if (hasCurrentTournamentCue(normalizedQuestion)) {
    return pickFromPool(answerBook.currentTournament);
  }

  return pickFromPool(answerBook.general);
}

function pickFromPool(pool) {
  const candidates = Array.isArray(pool) ? pool : [];
  if (!candidates.length) {
    return "这回先别急着开球。";
  }

  if (candidates.length === 1) {
    lastAnswerId = candidates[0].id;
    return candidates[0].answer;
  }

  let candidate = candidates[Math.floor(Math.random() * candidates.length)];
  while (candidate.id === lastAnswerId) {
    candidate = candidates[Math.floor(Math.random() * candidates.length)];
  }

  lastAnswerId = candidate.id;
  return candidate.answer;
}

function getBeijingDateKey() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

function getUsageState() {
  const today = getBeijingDateKey();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { date: today, count: 0 };
    }

    const parsed = JSON.parse(raw);
    if (parsed?.date === today && typeof parsed.count === "number") {
      return parsed;
    }
  } catch (error) {
    console.warn("Failed to read usage state", error);
  }

  return { date: today, count: 0 };
}

function incrementUsage(usage) {
  const next = {
    date: usage.date,
    count: usage.count + 1,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn("Failed to persist usage state", error);
  }
}

function applyFreshPlaceholder() {
  const candidate =
    QUESTION_PLACEHOLDERS[Math.floor(Math.random() * QUESTION_PLACEHOLDERS.length)];
  questionInput.setAttribute("placeholder", candidate);
}

function pickLimitReachedAnswer() {
  return LIMIT_REACHED_ANSWERS[
    Math.floor(Math.random() * LIMIT_REACHED_ANSWERS.length)
  ];
}

function hasCurrentTournamentCue(question) {
  return /今年|本届|这一届|2026|决赛圈|出线|晋级|小组赛|夺冠|世界杯/.test(question);
}

function mergePools(...pools) {
  const seen = new Set();
  const merged = [];

  for (const pool of pools) {
    for (const item of pool) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }
  }

  return merged;
}

function normalizeAnswerBook(source) {
  const safe = source && typeof source === "object" ? source : {};
  return {
    general: Array.isArray(safe.general) ? safe.general : [],
    empty: Array.isArray(safe.empty) ? safe.empty : [],
    currentTournament: Array.isArray(safe.currentTournament)
      ? safe.currentTournament
      : [],
    keywordPools: Array.isArray(safe.keywordPools) ? safe.keywordPools : [],
  };
}

function randomDelay() {
  return 950 + Math.floor(Math.random() * 900);
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function showAnswerView() {
  inputView.classList.add("hidden");
  answerView.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function returnToQuestionView() {
  answerView.classList.add("hidden");
  inputView.classList.remove("hidden");
  questionInput.value = "";
  applyFreshPlaceholder();
  setSaveHint("");
  githubStarLink.classList.add("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
  queueTypographyFit();
}

async function saveCardImage() {
  if (!currentAnswer || currentMode === "limit") {
    return;
  }

  const blob = await buildCardBlob(currentQuestion, currentAnswer);
  triggerDownload(blob);
  setSaveHint("答案卡已保存。");
}

function triggerDownload(blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document
    .querySelector("#shareFallbackTemplate")
    .content.firstElementChild.cloneNode(true);
  anchor.href = url;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function buildCardBlob(question, answer) {
  const canvas = document.createElement("canvas");
  const width = 1080;
  const height = 1440;
  const ctx = canvas.getContext("2d");
  const answerDisplay = formatAnswerDisplay(answer);

  canvas.width = width;
  canvas.height = height;

  drawBackground(ctx, width, height);

  const cardX = 90;
  const cardY = 150;
  const cardWidth = width - 180;
  const cardHeight = height - 300;

  roundRect(ctx, cardX, cardY, cardWidth, cardHeight, 44);
  const cardGradient = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardHeight);
  cardGradient.addColorStop(0, "rgba(6, 18, 13, 0.84)");
  cardGradient.addColorStop(1, "rgba(8, 28, 19, 0.8)");
  ctx.fillStyle = cardGradient;
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.save();
  roundRectPath(ctx, cardX + 14, cardY + 14, cardWidth - 28, cardHeight - 28, 24);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(244, 246, 238, 0.8)";
  ctx.font = '500 30px "Microsoft YaHei", sans-serif';
  ctx.fillText("世界杯答案之书", width / 2, 250);

  ctx.beginPath();
  ctx.moveTo(width / 2 - 70, 286);
  ctx.lineTo(width / 2 + 70, 286);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.stroke();

  ctx.fillStyle = "rgba(244, 246, 238, 0.66)";
  ctx.font = '400 34px "Microsoft YaHei", sans-serif';
  wrapText(ctx, question, width / 2, 390, 670, 56);

  ctx.fillStyle = "#f4f6ee";
  ctx.font = answerDisplay.multiline
    ? '700 58px "Microsoft YaHei", sans-serif'
    : '700 54px "Microsoft YaHei", sans-serif';
  wrapText(
    ctx,
    answerDisplay.text,
    width / 2,
    700,
    answerDisplay.multiline ? 560 : 760,
    answerDisplay.multiline ? 90 : 78
  );

  ctx.fillStyle = "rgba(244, 246, 238, 0.36)";
  ctx.font = '400 22px "Microsoft YaHei", sans-serif';
  ctx.fillText("把问题交给命运，把答案交给比赛。", width / 2, 1180);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png", 1);
  });
}

function drawBackground(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#11291b");
  gradient.addColorStop(0.45, "#08130e");
  gradient.addColorStop(1, "#030806");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(width / 2, 120, 40, width / 2, 120, 460);
  glow.addColorStop(0, "rgba(255, 239, 173, 0.24)");
  glow.addColorStop(1, "rgba(196, 255, 144, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  const tunnel = ctx.createLinearGradient(width / 2, 260, width / 2, height);
  tunnel.addColorStop(0, "rgba(255,255,255,0.04)");
  tunnel.addColorStop(1, "rgba(255,255,255,0)");
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(width * 0.34, 260);
  ctx.lineTo(width * 0.66, 260);
  ctx.lineTo(width * 0.86, height);
  ctx.lineTo(width * 0.14, height);
  ctx.closePath();
  ctx.fillStyle = tunnel;
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
  ctx.lineWidth = 1;
  for (let y = 80; y < height; y += 120) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  for (let x = 80; x < width; x += 120) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
}

function drawTrophySilhouette(ctx, alpha) {
  ctx.save();
  ctx.scale(1.55, 1.55);
  ctx.fillStyle = `rgba(243, 210, 122, ${alpha})`;
  ctx.beginPath();
  ctx.moveTo(-10, -58);
  ctx.bezierCurveTo(-34, -56, -48, -38, -46, -12);
  ctx.bezierCurveTo(-44, 6, -32, 18, -19, 24);
  ctx.bezierCurveTo(-10, 28, -6, 36, -3, 46);
  ctx.lineTo(-16, 75);
  ctx.bezierCurveTo(-18, 81, -18, 88, -15, 95);
  ctx.lineTo(-3, 121);
  ctx.lineTo(-3, 137);
  ctx.lineTo(-22, 137);
  ctx.bezierCurveTo(-31, 137, -38, 144, -38, 153);
  ctx.lineTo(38, 153);
  ctx.bezierCurveTo(38, 144, 31, 137, 22, 137);
  ctx.lineTo(3, 137);
  ctx.lineTo(3, 121);
  ctx.lineTo(15, 95);
  ctx.bezierCurveTo(18, 88, 18, 81, 16, 75);
  ctx.lineTo(3, 46);
  ctx.bezierCurveTo(6, 36, 10, 28, 19, 24);
  ctx.bezierCurveTo(32, 18, 44, 6, 46, -12);
  ctx.bezierCurveTo(48, -38, 34, -56, 10, -58);
  ctx.bezierCurveTo(3, -58, -3, -54, 0, -48);
  ctx.bezierCurveTo(3, -54, -3, -58, -10, -58);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-47, -36);
  ctx.bezierCurveTo(-63, -34, -76, -24, -78, -8);
  ctx.bezierCurveTo(-80, 11, -68, 28, -50, 36);
  ctx.lineTo(-43, 22);
  ctx.bezierCurveTo(-54, 16, -62, 6, -60, -6);
  ctx.bezierCurveTo(-58, -16, -51, -22, -41, -24);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(47, -36);
  ctx.bezierCurveTo(63, -34, 76, -24, 78, -8);
  ctx.bezierCurveTo(80, 11, 68, 28, 50, 36);
  ctx.lineTo(43, 22);
  ctx.bezierCurveTo(54, 16, 62, 6, 60, -6);
  ctx.bezierCurveTo(58, -16, 51, -22, 41, -24);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function roundRectPath(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function wrapText(ctx, text, centerX, startY, maxWidth, lineHeight) {
  let y = startY;

  for (const paragraph of String(text).split("\n")) {
    const chars = Array.from(paragraph);
    let line = "";

    for (const char of chars) {
      const testLine = line + char;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && line) {
        ctx.fillText(line, centerX, y);
        line = char;
        y += lineHeight;
      } else {
        line = testLine;
      }
    }

    if (line) {
      ctx.fillText(line, centerX, y);
      y += lineHeight;
    }
  }
}

function roundRect(ctx, x, y, width, height, radius) {
  roundRectPath(ctx, x, y, width, height, radius);
}

function setSaveHint(message) {
  if (!message) {
    saveHint.textContent = "";
    saveHint.classList.add("hidden");
    return;
  }

  saveHint.textContent = message;
  saveHint.classList.remove("hidden");
}

function queueTypographyFit() {
  window.requestAnimationFrame(() => {
    fitHeroTitle(pageTitle, 64, 30);
    fitHeroLead(pageLead, 22, 16);
    fitTextBlock(cardQuestion, 24, 14);
    fitAnswerText(cardAnswer, 36, 18);
  });
}

function isCompactViewport() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function fitHeroTitle(element, maxSize, minSize) {
  if (!element || !element.textContent?.trim() || element.closest(".hidden")) {
    return;
  }

  if (isCompactViewport()) {
    element.style.removeProperty("font-size");
    element.style.whiteSpace = "normal";
    return;
  }

  fitTextSingleLine(element, maxSize, minSize);
}

function fitHeroLead(element, maxSize, minSize) {
  if (!element || !element.textContent?.trim() || element.closest(".hidden")) {
    return;
  }

  if (isCompactViewport()) {
    element.style.removeProperty("font-size");
    element.style.whiteSpace = "normal";
    return;
  }

  fitTextSingleLine(element, maxSize, minSize);
}

function fitTextSingleLine(element, maxSize, minSize) {
  if (!element || !element.textContent?.trim() || element.closest(".hidden")) {
    return;
  }

  element.style.fontSize = `${maxSize}px`;
  element.style.whiteSpace = "nowrap";

  let nextSize = maxSize;
  while (element.scrollWidth > element.clientWidth && nextSize > minSize) {
    nextSize -= 1;
    element.style.fontSize = `${nextSize}px`;
  }
}

function resetWrappedText(element) {
  if (!element) {
    return;
  }

  element.style.removeProperty("font-size");
  element.style.removeProperty("white-space");
}

function fitTextBlock(element, maxSize, minSize) {
  if (!element || !element.textContent?.trim() || element.closest(".hidden")) {
    return;
  }

  element.style.removeProperty("white-space");
  element.style.fontSize = `${maxSize}px`;

  let nextSize = maxSize;
  const maxHeight = element.clientHeight || element.parentElement?.clientHeight || 0;

  while (
    (element.scrollWidth > element.clientWidth || (maxHeight && element.scrollHeight > maxHeight)) &&
    nextSize > minSize
  ) {
    nextSize -= 1;
    element.style.fontSize = `${nextSize}px`;
  }
}

function renderAnswerText(answer) {
  const display = formatAnswerDisplay(answer);
  cardAnswer.replaceChildren();

  if (display.multiline) {
    for (const line of display.lines) {
      const lineElement = document.createElement("span");
      lineElement.className = "answer-line";
      lineElement.textContent = line;
      cardAnswer.append(lineElement);
    }
  } else {
    cardAnswer.textContent = display.text;
  }

  cardAnswer.classList.toggle("is-single-line", !display.multiline);
  cardAnswer.classList.toggle("is-multiline", display.multiline);
}

function formatAnswerDisplay(answer) {
  const normalizedAnswer = String(answer || "").trim();
  const compactAnswer = normalizedAnswer.replace(/\s+/g, "");

  if (!normalizedAnswer) {
    return { text: "", multiline: false };
  }

  const segments = normalizedAnswer
    .split(ANSWER_BREAK_PATTERN)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (
    segments.length > 1 &&
    compactAnswer.length >= ANSWER_MULTILINE_THRESHOLD
  ) {
    return {
      lines: segments,
      text: segments.join("\n"),
      multiline: true,
    };
  }

  return {
    lines: [normalizedAnswer],
    text: normalizedAnswer,
    multiline: false,
  };
}

function fitAnswerText(element, maxSize, minSize) {
  if (!element || !element.textContent?.trim() || element.closest(".hidden")) {
    return;
  }

  if (isCompactViewport()) {
    element.style.whiteSpace = "normal";
    element.style.fontSize = `${Math.min(maxSize, 26)}px`;

    let nextSize = Math.min(maxSize, 26);
    const maxHeight = element.clientHeight || element.parentElement?.clientHeight || 0;

    while (
      (element.scrollWidth > element.clientWidth || (maxHeight && element.scrollHeight > maxHeight)) &&
      nextSize > minSize
    ) {
      nextSize -= 1;
      element.style.fontSize = `${nextSize}px`;
    }

    return;
  }

  if (element.classList.contains("is-single-line")) {
    fitTextSingleLine(element, maxSize, minSize);

    if (element.scrollWidth > element.clientWidth) {
      element.style.whiteSpace = "normal";
      fitTextBlock(element, maxSize, minSize);
    }

    return;
  }

  element.style.whiteSpace = "pre-line";
  element.style.fontSize = `${maxSize}px`;

  let nextSize = maxSize;
  const maxHeight = element.clientHeight || element.parentElement?.clientHeight || 0;

  while (
    (element.scrollWidth > element.clientWidth || (maxHeight && element.scrollHeight > maxHeight)) &&
    nextSize > minSize
  ) {
    nextSize -= 1;
    element.style.fontSize = `${nextSize}px`;
  }
}
