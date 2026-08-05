/**
 * THE ACADEMY (ADR-0050), rebuilt for the game as it actually is.
 *
 * Education is a primary pillar of this project, not a side page: the whole
 * point is that someone learns to swap, provide liquidity and manage a
 * position by PLAYING, not by reading documentation. So the lessons live
 * inside the room, and every one of them teaches a rule the game genuinely
 * runs on today.
 *
 * The old demo Academy taught the pre-ADR-0103 rules ("park $10 and your room
 * grows"), which are no longer true. Nothing here says that.
 *
 * Copy rules: plain words a beginner can read, no jargon left undefined, no
 * em-dashes, and never a promise about money.
 */

export interface Question {
  ask: string;
  options: string[];
  /** index of the right answer */
  answer: number;
  /** said kindly when they pick wrong, and it teaches rather than scolds */
  hint: string;
}

export interface Course {
  id: string;
  title: string;
  /** the lesson, in short paragraphs */
  lesson: string[];
  question: Question;
  /** coins for finishing, a real reward for real learning */
  reward: number;
}

export const COURSE_REWARD = 40;

export const COURSES: Course[] = [
  {
    id: "pool",
    title: "What a pool actually is",
    lesson: [
      "A pool is two piles of money sitting together: some of a domain's token, and some dollars. Anyone can swap one for the other.",
      "Nobody sets the price by hand. The price is just the balance between the two piles. Buy the token and its pile shrinks, so the price goes up. Sell it and the price goes down.",
      "Every swap pays a small fee, and that fee goes to the people who put money in the pool. That is where your kitchen's income comes from.",
    ],
    question: {
      ask: "Somebody buys a lot of the token. What happens to the price?",
      options: ["It goes up", "It goes down", "Nothing, the price is fixed"],
      answer: 0,
      hint: "Buying takes tokens out of the pile. The smaller that pile gets, the more each one is worth.",
    },
    reward: COURSE_REWARD,
  },
  {
    id: "range",
    title: "In range, and why it matters",
    lesson: [
      "When you add money to a pool you choose a price range for it. Your money only does any work while the price is inside that range.",
      "In range, your money is part of every trade and earns a share of the fees. The game shows this as Selling.",
      "Out of range, your money is still yours and perfectly safe, but it is sitting on the shelf earning nothing. The game shows this as Off the street.",
    ],
    question: {
      ask: "The price moves outside your range. What happens?",
      options: [
        "You lose the money",
        "It stops earning until the price comes back",
        "It earns twice as much",
      ],
      answer: 1,
      hint: "Nothing is lost. It just stops working, like a stall with the shutters down.",
    },
    reward: COURSE_REWARD,
  },
  {
    id: "width",
    title: "Tight, medium or wide",
    lesson: [
      "A tight range packs your money into a small band of prices. While the price stays there you earn much more per dollar, because your money is doing more of the work.",
      "A wide range earns less per dollar, but it keeps working through much bigger price moves without you touching it.",
      "Neither one is the clever answer. Tight suits someone who will check in and adjust. Wide suits someone who wants to set it down and go and live their life.",
    ],
    question: {
      ask: "Which is true about a tight range?",
      options: [
        "It earns more per dollar, and goes quiet sooner when the price moves",
        "It always earns more, whatever happens",
        "It cannot ever stop earning",
      ],
      answer: 0,
      hint: "Tight is a trade, not a free win: more while it works, and it stops working sooner.",
    },
    reward: COURSE_REWARD,
  },
  {
    id: "income",
    title: "How your restaurant grows",
    lesson: [
      "Your position pays you coins every hour, and so does your trading. Coins are a game thing. They never turn back into real money.",
      "Coins buy permanent things: tables, chairs, stoves, and the crew. Once you own it, it is yours.",
      "Here is the part worth remembering. Taking your money back out of a pool stops the coins coming in, but it never un-builds your room. Nothing you built goes away.",
    ],
    question: {
      ask: "You take your money out of the pool. What happens to the tables you bought?",
      options: [
        "They disappear",
        "They stay yours, the coins just stop coming in",
        "They get sold automatically",
      ],
      answer: 1,
      hint: "What you built stays yours. That is a rule of this game, not a maybe.",
    },
    reward: COURSE_REWARD,
  },
  {
    id: "quality",
    title: "The thing money cannot buy",
    lesson: [
      "Service quality comes from three places: your own hands, a room that is looked after, and dishes you have improved.",
      "There is no way to buy it. No amount of coins, and no size of position, moves it even slightly.",
      "That is on purpose. A big wallet can build a big restaurant, but only care makes a good one, and only good ones reach the top table.",
    ],
    question: {
      ask: "What is the fastest way to raise your service quality?",
      options: [
        "Buy more tables",
        "Add more liquidity",
        "Help out: clear tables, fix things, improve a dish",
      ],
      answer: 2,
      hint: "Money buys the room. Only your hands and your care raise the service.",
    },
    reward: COURSE_REWARD,
  },
];

export function courseById(id: string): Course | undefined {
  return COURSES.find((c) => c.id === id);
}

export function isGraduate(done: string[]): boolean {
  return COURSES.every((c) => done.includes(c.id));
}
