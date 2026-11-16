/**
 * Deterministic sample data for unit tests (never loaded by the app). Pure (no IO): returns entity arrays relative to `now`, so tests can assert on it
 * and the dashboard always shows realistic "due today / overdue / mastered" mixes.
 */
import { slugify } from "@/lib/constants";
import type { CardState, RatingName } from "@/lib/fsrs";
import type { CardAttemptLog, MistakeCard, Subject, Topic, User } from "@/lib/repo/types";

const DAY = 86_400_000;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SeedBundle {
  users: User[];
  subjects: Subject[];
  topics: Topic[];
  cards: MistakeCard[];
  logs: CardAttemptLog[];
}

interface SubjectSeed {
  name: string;
  description: string;
  color: string;
  aiOutputLanguage: "VI" | "EN" | null;
  examInDays: number | null;
  chapters: { name: string; topics: string[] }[];
  cards: number;
  samples: string[];
  /** Worked solution for each sample (same index). */
  solutions: string[];
  /** Reflection notes written after a failed (AGAIN) attempt. */
  againNotes: string[];
  /** Notes after a HARD attempt. */
  hardNotes: string[];
}

const DEMO_SUBJECTS: SubjectSeed[] = [
  {
    name: "Toán TSA",
    description: "Tư duy định lượng — kỳ thi Đánh giá tư duy (ĐHBK Hà Nội).",
    color: "#6366F1",
    aiOutputLanguage: "VI",
    examInDays: 38,
    chapters: [
      { name: "Đại số", topics: ["Hàm số & đồ thị", "Phương trình, bất phương trình"] },
      { name: "Hình học không gian", topics: ["Thể tích khối đa diện", "Khoảng cách & góc"] },
      { name: "Xác suất – Tổ hợp", topics: ["Hoán vị, chỉnh hợp, tổ hợp"] },
    ],
    cards: 22,
    samples: [
      "Tìm $m$ để hàm số $y = x^3 - 3mx^2 + 3x$ đồng biến trên $\\mathbb{R}$.",
      "Cho hình chóp $S.ABCD$ đáy là hình vuông cạnh $a$, $SA \\perp (ABCD)$, $SA = a\\sqrt{2}$. Tính $d(A,(SBC))$.",
      "Có bao nhiêu số tự nhiên có $4$ chữ số khác nhau được lập từ $\\{0,1,2,3,4,5\\}$?",
      "Giải phương trình $\\log_2(x-1) + \\log_2(x+1) = 3$.",
    ],
    solutions: [
      "$y' = 3x^2 - 6mx + 3 \\ge 0\\ \\forall x \\iff \\Delta' = 9m^2 - 9 \\le 0 \\iff -1 \\le m \\le 1$.",
      "Kẻ $AH \\perp SB$ thì $AH \\perp (SBC)$. $\\dfrac{1}{AH^2} = \\dfrac{1}{SA^2} + \\dfrac{1}{AB^2} = \\dfrac{3}{2a^2} \\Rightarrow d = AH = \\dfrac{a\\sqrt{6}}{3}$.",
      "Chữ số đầu có $5$ cách (khác $0$), ba chữ số sau có $5 \\cdot 4 \\cdot 3$ cách: $5 \\cdot 5 \\cdot 4 \\cdot 3 = 300$ số.",
      "ĐK $x > 1$. $\\log_2(x^2 - 1) = 3 \\Rightarrow x^2 = 9 \\Rightarrow x = 3$ (loại $x = -3$).",
    ],
    againNotes: [
      "Quên điều kiện xác định trước khi giải, ra thừa nghiệm.",
      "Đọc lướt, bỏ sót chữ “khác nhau” trong đề.",
      "Không nghĩ ra cách hạ đường vuông góc trong không gian.",
      "Nhầm dấu khi tính $\\Delta'$, vội quá.",
      "Quên trường hợp chữ số $0$ đứng đầu.",
    ],
    hardNotes: ["Làm được nhưng mất gần 5 phút.", "Nhớ hướng làm nhưng phải dò lại công thức."],
  },
  {
    name: "Toán THPT",
    description: "Ôn thi cuối kỳ chương trình Toán 12.",
    color: "#A855F7",
    aiOutputLanguage: "VI",
    examInDays: 17,
    chapters: [
      { name: "Giải tích 12", topics: ["Đạo hàm & ứng dụng", "Nguyên hàm – Tích phân", "Mũ & Logarit"] },
      { name: "Hình học 12", topics: ["Mặt cầu – Mặt nón – Mặt trụ", "Tọa độ không gian Oxyz"] },
    ],
    cards: 20,
    samples: [
      "Tính $\\int_0^1 x e^{x}\\,dx$.",
      "Viết phương trình mặt cầu tâm $I(1,2,-1)$ tiếp xúc với mặt phẳng $(P): 2x-y+2z+3=0$.",
      "Tìm GTLN của $f(x) = x^3 - 3x + 2$ trên $[0,2]$.",
    ],
    solutions: [
      "Từng phần: $\\int_0^1 x e^{x}\\,dx = \\left[x e^{x} - e^{x}\\right]_0^1 = 0 - (-1) = 1$.",
      "$R = d(I,(P)) = \\dfrac{|2 - 2 - 2 + 3|}{3} = \\dfrac{1}{3}$, nên $(x-1)^2 + (y-2)^2 + (z+1)^2 = \\dfrac{1}{9}$.",
      "$f'(x) = 3x^2 - 3 = 0 \\Rightarrow x = 1$. $f(0) = 2$, $f(1) = 0$, $f(2) = 4$ nên $\\max_{[0,2]} f = 4$ tại $x = 2$.",
    ],
    againNotes: [
      "Chọn sai $u$ và $dv$ khi tích phân từng phần.",
      "Quên chia cho độ dài pháp tuyến khi tính khoảng cách.",
      "Chỉ xét điểm tới hạn, quên so sánh giá trị ở hai đầu mút.",
      "Tính sai $f(2)$ do vội.",
    ],
    hardNotes: ["Phải viết lại công thức khoảng cách mới nhớ.", "Đúng nhưng chậm ở bước đổi cận."],
  },
  {
    name: "Vật Lý",
    description: "Cơ học & Điện từ — IB Physics (giải thích bằng tiếng Anh).",
    color: "#38BDF8",
    aiOutputLanguage: "EN",
    examInDays: 52,
    chapters: [
      { name: "Mechanics", topics: ["Kinematics", "Newton's laws", "Work, energy & power"] },
      { name: "Electricity", topics: ["Circuits", "Magnetic fields"] },
    ],
    cards: 16,
    samples: [
      "A $2.0\\,\\mathrm{kg}$ block slides down a $30^\\circ$ incline with $\\mu_k = 0.2$. Find its acceleration.",
      "Two resistors $R_1 = 4\\,\\Omega$ and $R_2 = 6\\,\\Omega$ are in parallel across $12\\,\\mathrm{V}$. Find the total current.",
    ],
    solutions: [
      "$a = g(\\sin 30^\\circ - \\mu_k \\cos 30^\\circ) = 9.81(0.5 - 0.2 \\cdot 0.866) \\approx 3.2\\,\\mathrm{m/s^2}$.",
      "$R = \\dfrac{R_1 R_2}{R_1 + R_2} = 2.4\\,\\Omega$, so $I = \\dfrac{12}{2.4} = 5\\,\\mathrm{A}$.",
    ],
    againNotes: [
      "Forgot to resolve gravity along the incline.",
      "Used $\\sin$ instead of $\\cos$ for the normal force.",
      "Mixed up the series and parallel formulas.",
    ],
    hardNotes: ["Got it, but slow on the free-body diagram."],
  },
  {
    name: "IELTS / Tiếng Anh",
    description: "Ngữ pháp, từ vựng và dạng bài Reading.",
    color: "#10B981",
    aiOutputLanguage: null,
    examInDays: null,
    chapters: [
      { name: "Grammar", topics: ["Conditionals", "Relative clauses"] },
      { name: "Reading", topics: ["True / False / Not Given", "Matching headings"] },
    ],
    cards: 10,
    samples: [
      "Choose the correct form: If I **had known** about the delay, I ___ earlier.",
      "Rewrite using a relative clause: *The man is my uncle. He is standing by the door.*",
    ],
    solutions: [
      "**would have left** — câu điều kiện loại 3: *If + had V3, would have V3* (giả định trái với quá khứ).",
      "*The man **who** is standing by the door is my uncle.*",
    ],
    againNotes: [
      "Nhầm câu điều kiện loại 2 và loại 3.",
      "Đọc lướt nên không thấy mốc thời gian quá khứ.",
      "Bỏ sót đại từ quan hệ, viết thành hai mệnh đề.",
    ],
    hardNotes: ["Phân vân giữa *would* và *would have*."],
  },
];

const RATING_POOL: RatingName[] = ["GOOD", "GOOD", "GOOD", "EASY", "HARD", "AGAIN"];

/** Build a fully-populated demo account plus a small second account (for the multi-account switcher). */
export function buildDemoSeed(now: Date = new Date()): SeedBundle {
  const rand = mulberry32(20261112);
  const id = (prefix: string, n: number) => `${prefix}-${n.toString().padStart(4, "0")}`;
  const bundle: SeedBundle = { users: [], subjects: [], topics: [], cards: [], logs: [] };
  const t = now;

  const mainId = "test-user-a";
  const guestId = "test-user-b";
  bundle.users.push(
    {
      id: mainId, email: "user-a@vaultlearn.test", displayName: "Test User A", role: "USER", uiLanguage: "VI", defaultAiOutputLanguage: "VI",
      theme: "OBSIDIAN", timezone: "Asia/Ho_Chi_Minh", desiredRetention: 0.9, onboardedAt: t, lastActiveAt: t, createdAt: new Date(t.getTime() - 60 * DAY), updatedAt: t,
    },
    {
      id: guestId, email: "user-b@vaultlearn.test", displayName: "Test User B", role: "USER", uiLanguage: "EN", defaultAiOutputLanguage: "EN",
      theme: "LIGHT", timezone: "Asia/Ho_Chi_Minh", desiredRetention: 0.9, onboardedAt: t, lastActiveAt: t, createdAt: new Date(t.getTime() - 5 * DAY), updatedAt: t,
    },
  );

  let cardN = 0;
  let logN = 0;
  let topicN = 0;

  DEMO_SUBJECTS.forEach((seed, subjectIndex) => {
    const subjectId = id("subject", subjectIndex + 1);
    bundle.subjects.push({
      id: subjectId, userId: mainId, name: seed.name, slug: slugify(seed.name), description: seed.description, color: seed.color, icon: null,
      aiOutputLanguage: seed.aiOutputLanguage, preferredApiKeyId: null,
      examDate: seed.examInDays === null ? null : new Date(t.getTime() + seed.examInDays * DAY),
      sortOrder: subjectIndex, memorySummary: null, memoryInsights: null, memoryVersion: 0, memorySourceCardCount: 0, memoryStale: true, memoryUpdatedAt: null,
      archivedAt: null, createdAt: new Date(t.getTime() - 55 * DAY), updatedAt: t,
    });

    const leafTopicIds: string[] = [];
    seed.chapters.forEach((chapter, chapterIndex) => {
      const chapterId = id("topic", ++topicN);
      bundle.topics.push({
        id: chapterId, userId: mainId, subjectId, parentId: null, name: chapter.name, slug: slugify(chapter.name), sortOrder: chapterIndex, createdAt: t, updatedAt: t,
      });
      chapter.topics.forEach((name, i) => {
        const topicId = id("topic", ++topicN);
        leafTopicIds.push(topicId);
        bundle.topics.push({ id: topicId, userId: mainId, subjectId, parentId: chapterId, name, slug: slugify(name), sortOrder: i, createdAt: t, updatedAt: t });
      });
    });

    for (let i = 0; i < seed.cards; i++) {
      const cardId = id("card", ++cardN);
      const roll = rand();
      const state: CardState = roll < 0.12 ? "NEW" : roll < 0.2 ? "LEARNING" : roll < 0.28 ? "RELEARNING" : "REVIEW";
      const stability = state === "NEW" ? 0 : state === "REVIEW" ? 2 + rand() * 60 : 0.5 + rand() * 2;
      const reps = state === "NEW" ? 0 : 1 + Math.floor(rand() * 8);
      const lastReviewDaysAgo = state === "NEW" ? null : Math.floor(rand() * Math.min(25, Math.max(2, stability)));
      const lastReviewAt = lastReviewDaysAgo === null ? null : new Date(t.getTime() - lastReviewDaysAgo * DAY - Math.floor(rand() * 6) * 3_600_000);
      // ~40% of reviewed cards are due today or overdue; the rest are spread over the next weeks.
      const dueOffsetDays = state === "NEW" ? 0 : rand() < 0.4 ? -Math.floor(rand() * 4) : Math.ceil(rand() * Math.max(3, stability * 0.6));
      const due = new Date(t.getTime() + dueOffsetDays * DAY);
      const attempts = state === "NEW" ? 0 : reps;
      const createdAt = new Date(t.getTime() - (attempts + 3 + Math.floor(rand() * 20)) * DAY);

      bundle.cards.push({
        id: cardId, userId: mainId, subjectId, topicId: leafTopicIds[Math.floor(rand() * leafTopicIds.length)] ?? null, examUploadId: null,
        title: `${seed.name} · #${i + 1}`, questionLatex: seed.samples[i % seed.samples.length], userAnswerLatex: null, correctAnswerLatex: null,
        solutionLatex: seed.solutions[i % seed.solutions.length] ?? null,
        sourcePage: null, cropBox: null, figureBox: null, diagramImagePath: null, originalCropPath: null, ocrStatus: "MANUAL", ocrModel: null, ocrConfidence: null,
        ocrRawText: null, ahaNote: null,
        isHighYield: rand() < 0.22, needsReview: false, highYieldNote: null, state, due, stability, difficulty: state === "NEW" ? 0 : 3 + rand() * 6,
        elapsedDays: lastReviewDaysAgo ?? 0, scheduledDays: Math.round(stability), learningSteps: 0, reps, lapses: Math.floor(rand() * 3),
        lastReviewAt, attemptCount: attempts, isSuspended: false, archivedAt: null, createdAt, updatedAt: t,
      });

      const firstLog = bundle.logs.length;
      for (let a = 1; a <= attempts; a++) {
        const daysAgo = Math.max(0, Math.round((attempts - a) * (lastReviewDaysAgo === null ? 3 : 3 + rand() * 4) + (lastReviewDaysAgo ?? 0)));
        // Early attempts fail more often → believable improvement curve.
        const rating: RatingName = a === 1 && rand() < 0.5 ? "AGAIN" : RATING_POOL[Math.floor(rand() * RATING_POOL.length)];
        const reviewedAt = new Date(t.getTime() - daysAgo * DAY - Math.floor(rand() * 10) * 3_600_000);
        const grow = a / attempts;
        bundle.logs.push({
          id: id("log", ++logN), userId: mainId, cardId, attemptNumber: a, rating, note: rating === "AGAIN" ? seed.againNotes[Math.floor(rand() * seed.againNotes.length)] : rating === "HARD" ? seed.hardNotes[(cardN + a) % seed.hardNotes.length] : null,
          timeSpentMs: 30_000 + ((cardN * 7919 + a * 104_729) % 240_000), variantQuestionLatex: null,
          reviewedAt, stateBefore: a === 1 ? "NEW" : "REVIEW", stateAfter: "REVIEW", stabilityBefore: stability * Math.max(0, grow - 0.2), stabilityAfter: stability * grow,
          difficultyBefore: 5, difficultyAfter: 5, retrievability: a === 1 ? null : 0.7 + rand() * 0.28, elapsedDays: 3, scheduledDays: Math.round(stability * grow),
          learningSteps: 0, dueBefore: reviewedAt, dueAfter: new Date(reviewedAt.getTime() + stability * grow * DAY),
        });
      }
      // Attempt N must never predate attempt N-1: hand out the generated times in ascending order.
      const cardLogs = bundle.logs.slice(firstLog);
      const times = cardLogs.map((l) => l.reviewedAt.getTime()).sort((x, y) => x - y);
      cardLogs.forEach((l, k) => {
        const reviewedAt = new Date(times[k]);
        Object.assign(l, { reviewedAt, dueBefore: reviewedAt, dueAfter: new Date(reviewedAt.getTime() + l.scheduledDays * DAY) });
      });
    }
  });

  // Second account: a tiny workspace so the account switcher + empty-ish states are testable.
  const guestSubject: Subject = {
    id: "subject-guest-1", userId: guestId, name: "Chemistry", slug: "chemistry", description: "Organic chemistry basics.", color: "#F59E0B", icon: null,
    aiOutputLanguage: "EN", preferredApiKeyId: null, examDate: null, sortOrder: 0, memorySummary: null, memoryInsights: null, memoryVersion: 0, memorySourceCardCount: 0,
    memoryStale: false, memoryUpdatedAt: null, archivedAt: null, createdAt: t, updatedAt: t,
  };
  bundle.subjects.push(guestSubject);
  bundle.topics.push({ id: "topic-guest-1", userId: guestId, subjectId: guestSubject.id, parentId: null, name: "Alkanes & alkenes", slug: "alkanes-alkenes", sortOrder: 0, createdAt: t, updatedAt: t });
  return bundle;
}
